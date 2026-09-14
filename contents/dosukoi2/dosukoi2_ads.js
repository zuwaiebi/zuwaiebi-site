(function (global) {
  'use strict';

  // 十両(広告妨害ボス、内部key: komusubi)専用。canvasの上に本物のDOM要素として広告ウィンドウを
  // 重ねることで、「広告の上からは下の敵をタップできない」を素朴に実現する
  // (position:absoluteな広告divがcanvasより上に描画され、クリックを吸収する)。
  // 広告本体同士の重なりはある程度許容する(MAX_OVERLAPPING_ADS)が、後から
  // 出た広告が既存の広告の×ボタンの真上に重なると、その×ボタンが完全に
  // 隠れて二度と押せなくなってしまうため、×ボタンの位置だけは新しい広告の
  // 置き場所探し(pickPlacement)で絶対に避けるようにしている。

  var AD_IMAGE_COUNT = 11;
  var AD_IMAGE_PATH = 'data/images/ad/ad';

  var BASE_WAVE_SIZE = 5;
  var WAVE_SIZE_GROWTH_PER_LAP = 2;
  var MAX_WAVE_SIZE = 14;
  var SPAWN_STAGGER_DELAY = 0.1;
  var BASE_WAVE_COOLDOWN = 4.0;
  var WAVE_COOLDOWN_SHRINK_PER_LAP = 0.7;
  var MIN_WAVE_COOLDOWN = 1.2;

  var CORNERS = [
    { top: '6px', left: '6px' },
    { top: '6px', right: '6px' },
    { bottom: '6px', left: '6px' },
    { bottom: '6px', right: '6px' }
  ];
  // dosukoi2.cssの.ad-close-btn(28px角)・CORNERSの余白(6px)と合わせる。
  // 新しい広告の置き場所を探す際、既存の広告の×ボタンをこのサイズで
  // 覆ってしまわないよう避けるために使う(座標系の詳細はcloseBtnRectPercent参照)。
  var AD_CLOSE_BTN_SIZE_PX = 28;
  var AD_CLOSE_BTN_INSET_PX = 6;

  // 広告の位置は基本ランダムだが、重なりすぎて収拾がつかなくならないよう、
  // 新しく出す広告は既存の広告と最大でもこの数までしか重ならない位置を探す
  // (画面が既に埋まっていて見つからない場合は、最も重なりが少ない候補で妥協する)。
  var MAX_OVERLAPPING_ADS = 3;
  var PLACEMENT_GRID_STEPS = 10;

  var container = null;

  function initialState() {
    return {
      active: false,
      // 表示中の妨害が何巡目か(encounter)を表すトークン。startEncounter/
      // endEncounterのたびに変える。画像プリロード中にボスが撃破される等で
      // 妨害が終わっても、後から届く読み込み完了コールバックが古いトークンの
      // ままだと無視されるようにするための世代管理。
      generation: 0,
      lap: 0,
      spawnQueueRemaining: 0,
      spawnStaggerTimer: 0,
      waveCooldownTimer: 0,
      openAds: []
    };
  }

  var state = initialState();

  function waveSize(lap) {
    return Math.min(MAX_WAVE_SIZE, BASE_WAVE_SIZE + lap * WAVE_SIZE_GROWTH_PER_LAP);
  }

  function waveCooldown(lap) {
    return Math.max(MIN_WAVE_COOLDOWN, BASE_WAVE_COOLDOWN - lap * WAVE_COOLDOWN_SHRINK_PER_LAP);
  }

  function init(el) {
    container = el;
  }

  function closeAd(el) {
    var idx = state.openAds.indexOf(el);
    if (idx >= 0) { state.openAds.splice(idx, 1); }
    if (el.parentNode) { el.parentNode.removeChild(el); }
  }

  function clearAllAds() {
    while (state.openAds.length > 0) { closeAd(state.openAds[0]); }
  }

  // 広告のサイズ・位置は画面内でランダム(重なりも許容する、いかにも
  // ポップアップ広告らしい配置)。size/leftはこの「収まる最大サイズ・位置」の
  // 枠内で、元画像の縦横比を保ったまま(左右・上下をカットせず)最終サイズを
  // 決める。play-frameは常に正方形なので、幅%と高さ%をそのまま同じ長さの
  // 単位として比較して構わない。
  function fitWithinBox(naturalW, naturalH, maxW, maxH, left, top) {
    var aspect = naturalW / naturalH;
    var w = maxW;
    var h = maxW / aspect;
    if (h > maxH) { h = maxH; w = maxH * aspect; }
    return { w: w, h: h, left: left + (maxW - w) / 2, top: top + (maxH - h) / 2 };
  }

  // 表示済みの広告を後からリサイズすると、×ボタンの位置(隅からのオフセット)も
  // 一緒に動いてしまい、狙って押した瞬間にボタンがズレて外れる事故につながる
  // (SPAWN_STAGGER_DELAYを短くすると、読み込み中の画像が同時に増えてこの事故が
  // 頻発した)。そのため、画像は表示前(裏側)で読み込みを済ませてサイズを
  // 確定してから、最終サイズのまま一度だけDOMに追加する(表示後は動かさない)。
  function createAdWindow(src, rect, generation) {
    if (!container || generation !== state.generation) { return; }
    var el = document.createElement('div');
    el.className = 'ad-window';
    el.style.width = rect.w + '%';
    el.style.height = rect.h + '%';
    el.style.left = rect.left + '%';
    el.style.top = rect.top + '%';

    var img = document.createElement('img');
    img.alt = '';
    img.src = src; // プリロード済みなのでブラウザキャッシュから即座に描画される
    el.appendChild(img);

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ad-close-btn';
    closeBtn.textContent = '×';
    var cornerIndex = Math.floor(Math.random() * CORNERS.length);
    var corner = CORNERS[cornerIndex];
    Object.keys(corner).forEach(function (key) { closeBtn.style[key] = corner[key]; });
    // 後から出す広告が、この広告の×ボタンの位置を覆ってしまわないようにする
    // 判定(pickPlacement)に使うため、どの角に付けたかを憶えておく。
    el.dataset.cornerIndex = String(cornerIndex);
    closeBtn.addEventListener('pointerdown', function (evt) {
      evt.preventDefault();
      evt.stopPropagation();
      closeAd(el);
    });
    el.appendChild(closeBtn);

    container.appendChild(el);
    state.openAds.push(el);
  }

  function rectsOverlap(a, b) {
    return a.left < b.left + b.width && a.left + a.width > b.left &&
      a.top < b.top + b.height && a.top + a.height > b.top;
  }

  // 広告本体の矩形(%)と、その広告に付いている×ボタンが置かれた角の情報から、
  // ×ボタンのおおよその矩形を%単位で返す(containerRectはcontainer要素の
  // getBoundingClientRect()の結果。px→%の換算に使う)。
  function closeBtnRectPercent(adRect, corner, containerRect) {
    var btnW = AD_CLOSE_BTN_SIZE_PX / containerRect.width * 100;
    var btnH = AD_CLOSE_BTN_SIZE_PX / containerRect.height * 100;
    var insetW = AD_CLOSE_BTN_INSET_PX / containerRect.width * 100;
    var insetH = AD_CLOSE_BTN_INSET_PX / containerRect.height * 100;
    var left = corner.left !== undefined ? adRect.left + insetW : adRect.left + adRect.width - insetW - btnW;
    var top = corner.top !== undefined ? adRect.top + insetH : adRect.top + adRect.height - insetH - btnH;
    return { left: left, top: top, width: btnW, height: btnH };
  }

  // 現在開いている広告(すでに最終サイズが確定済み)の矩形一覧を%単位で返す。
  // 各広告の×ボタンのおおよその矩形(closeBtnRect)も併せて返し、新しい広告が
  // それを覆ってしまわないようにする判定(pickPlacement)に使う。
  function openAdRects() {
    var containerRect = container.getBoundingClientRect();
    return state.openAds.map(function (el) {
      var rect = {
        left: parseFloat(el.style.left),
        top: parseFloat(el.style.top),
        width: parseFloat(el.style.width),
        height: parseFloat(el.style.height)
      };
      var corner = CORNERS[Number(el.dataset.cornerIndex)];
      rect.closeBtnRect = closeBtnRectPercent(rect, corner, containerRect);
      return rect;
    });
  }

  // 新しい広告(maxW×maxHの枠)の位置を、候補をグリッド状に(+わずかにランダムな
  // ずれを加えて)しらみつぶしに調べて探す。「新しい広告自身が何個と重なるか」
  // だけでなく「その配置によって、既にMAX_OVERLAPPING_ADS個と重なっている
  // 既存の広告をさらに1個重なり過多にしてしまわないか」も見る。さらに、
  // 後から出す広告は必ず既存の広告より上に重なって描画されるため、既存の
  // ×ボタンの上に新しい広告本体が被さると、その×ボタンが完全に隠れて
  // 押せなくなってしまう。そのため「既存のどの広告の×ボタンとも重ならない」
  // ことは(見た目の重なり許容とは別に)絶対条件として扱う。条件を満たす
  // 候補を「見つけ次第採用」すると、走査順(左上から)に偏って毎回左上に
  // 固まってしまうため、条件を満たす候補を全て集めてからランダムに1つ選ぶ
  // ことで、画面全体(右下や中央も含めて)に散らばるようにする。1つも
  // 見つからない場合のみ、調べた中で最もマシな候補(×ボタンを覆わない候補を
  // 最優先しつつ)で妥協する。
  function pickPlacement(maxW, maxH) {
    var existing = openAdRects();
    var existingOverlapCounts = existing.map(function (rect, i) {
      var count = 0;
      for (var j = 0; j < existing.length; j++) {
        if (i !== j && rectsOverlap(rect, existing[j])) { count++; }
      }
      return count;
    });

    var maxLeft = 100 - maxW;
    var maxTop = 100 - maxH;
    var acceptable = [];
    var best = null;
    var bestScore = Infinity;
    for (var gx = 0; gx <= PLACEMENT_GRID_STEPS; gx++) {
      for (var gy = 0; gy <= PLACEMENT_GRID_STEPS; gy++) {
        var jitterX = (Math.random() - 0.5) * (maxLeft / PLACEMENT_GRID_STEPS);
        var jitterY = (Math.random() - 0.5) * (maxTop / PLACEMENT_GRID_STEPS);
        var left = Math.min(maxLeft, Math.max(0, (maxLeft * gx) / PLACEMENT_GRID_STEPS + jitterX));
        var top = Math.min(maxTop, Math.max(0, (maxTop * gy) / PLACEMENT_GRID_STEPS + jitterY));
        var candidate = { left: left, top: top, width: maxW, height: maxH };
        var overlapCount = 0;
        var pushesSomeoneOverLimit = false;
        var coversCloseBtn = false;
        for (var i = 0; i < existing.length; i++) {
          if (rectsOverlap(candidate, existing[i])) {
            overlapCount++;
            if (existingOverlapCounts[i] >= MAX_OVERLAPPING_ADS) { pushesSomeoneOverLimit = true; }
          }
          if (rectsOverlap(candidate, existing[i].closeBtnRect)) { coversCloseBtn = true; }
        }
        if (overlapCount <= MAX_OVERLAPPING_ADS && !pushesSomeoneOverLimit && !coversCloseBtn) {
          acceptable.push({ left: left, top: top });
        }
        var score = overlapCount + (pushesSomeoneOverLimit ? 100 : 0) + (coversCloseBtn ? 1000 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = { left: left, top: top };
        }
      }
    }
    if (acceptable.length > 0) {
      return acceptable[Math.floor(Math.random() * acceptable.length)];
    }
    return best;
  }

  function spawnOneAd() {
    if (!container) { return; }
    var maxW = 38 + Math.random() * 22; // 38%〜60%
    var maxH = 34 + Math.random() * 22; // 34%〜56%
    var placement = pickPlacement(maxW, maxH);
    var left = placement.left;
    var top = placement.top;
    var src = AD_IMAGE_PATH + (1 + Math.floor(Math.random() * AD_IMAGE_COUNT)) + '.webp';
    var generation = state.generation;

    var preload = new Image();
    preload.onload = function () {
      var rect = fitWithinBox(preload.naturalWidth, preload.naturalHeight, maxW, maxH, left, top);
      createAdWindow(src, rect, generation);
    };
    preload.onerror = function () {
      // 万一読み込みに失敗しても、枠だけは表示して妨害を継続する
      createAdWindow(src, { w: maxW, h: maxH, left: left, top: top }, generation);
    };
    preload.src = src;
  }

  function startEncounter(lap) {
    state.active = true;
    state.generation++;
    state.lap = lap;
    state.spawnQueueRemaining = waveSize(lap);
    state.spawnStaggerTimer = 0;
    state.waveCooldownTimer = 0;
  }

  function endEncounter() {
    state.active = false;
    state.generation++;
    state.spawnQueueRemaining = 0;
    clearAllAds();
  }

  function tick(dt) {
    if (state.spawnQueueRemaining > 0) {
      state.spawnStaggerTimer -= dt;
      if (state.spawnStaggerTimer <= 0) {
        spawnOneAd();
        state.spawnQueueRemaining--;
        state.spawnStaggerTimer = SPAWN_STAGGER_DELAY;
      }
      return;
    }
    if (state.openAds.length === 0) {
      state.waveCooldownTimer -= dt;
      if (state.waveCooldownTimer <= 0) {
        state.spawnQueueRemaining = waveSize(state.lap);
        state.spawnStaggerTimer = 0;
      }
    } else {
      // 広告が1つでも残っている間は、最後の1つが消えた瞬間から
      // クールダウンが始まるよう、常にフルの待ち時間へリセットしておく
      state.waveCooldownTimer = waveCooldown(state.lap);
    }
  }

  // mainのゲームループから毎フレーム呼ぶ。active/lapは「今この瞬間、十両の
  // 広告妨害が有効な状況か」を呼び出し側(dosukoi2_main.js)が判定して渡す。
  function sync(active, lap, dt) {
    if (active && !state.active) { startEncounter(lap); }
    if (!active && state.active) { endEncounter(); }
    if (state.active) { tick(dt); }
  }

  global.Dosukoi2 = global.Dosukoi2 || {};
  global.Dosukoi2.AdBlock = {
    init: init,
    sync: sync,
    endEncounter: endEncounter
  };
})(window);
