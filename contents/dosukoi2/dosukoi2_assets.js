(function (global) {
  'use strict';

  // 前作からの仮素材。zako/gyojiは52x60の縦長スプライト、congratulation.pngは
  // 前作エンディングの「CONGRATULATION!」画像でEXTRAモードのオマケ絵として流用する。
  var ASSET_IMAGES = {
    zako: 'data/images/zako.png',
    oozekiZako: 'data/images/oozeki_zako.png',
    gyoji: 'data/images/gyoji.png',
    bossJishakuRed: 'data/images/boss_jishaku_red.png',
    bossJishakuBlue: 'data/images/boss_jishaku_blue.png',
    bossMakushita: 'data/images/boss_makushita.png',
    bossJuryo: 'data/images/boss_juryo.png',
    bossMaekashira: 'data/images/boss_maekashira.png',
    bossKomusubi: 'data/images/boss_komusubi.png',
    bossSekiwake: 'data/images/boss_sekiwake.png',
    bossOzeki: 'data/images/boss_ozeki.png',
    bossYokozuna: 'data/images/boss_yokozuna.png',
    omakeArt: 'data/story/congratulation.png'
  };

  var ASSET_STORY = [
    { image: 'data/story/story_01.png', caption: '稽古場にて、いつも通りの稽古が始まろうとしていた。' },
    { image: 'data/story/story_02.png', caption: 'そこへふらりと現れた、やたら顔の良い力士。' },
    { image: 'data/story/story_03.png', caption: '前作の顛末はさておき、なんだかんだで今日も一緒にいる二人。' },
    { image: 'data/story/story_04.png', caption: 'しかし、それを良く思わない力士たちが土俵の外からわらわらと……' },
    { image: 'data/story/story_05.png', caption: '「今日ぐらい、静かに稽古させてくれ！」' },
    { image: 'data/story/story_06.png', caption: 'というわけで、また土俵の真ん中を守り抜くことになった。' }
  ];

  // 前作の効果音・BGM(仮素材)。専用の音が無いイベント(bossIntro, finale)は
  // 現状マッピングせず無音のままにしておく。
  var ASSET_AUDIO = {
    decision: 'data/audio/decision_se.mp3',
    gameStart: 'data/audio/gamestart_decision_se.mp3',
    enemyHit: 'data/audio/enemy_hit_se.wav',
    miss: 'data/audio/miss_se.mp3',
    horagai: 'data/audio/horagai.mp3',
    crowdCheer: 'data/audio/Crowd Cheer.mp3',
    metal: 'data/audio/metal.mp3',
    electricShock: 'data/audio/Electric_Shock.mp3',
    bgmTitle: 'data/audio/title_bgm.mp3',
    bgmMain: 'data/audio/main_bgm.mp3',
    bgmExtra: 'data/audio/extra_bgm.mp3'
  };

  var SE_MAP = {
    zakoDefeated: 'enemyHit',
    bossHit: 'enemyHit',
    bossDefeated: 'decision',
    bossApproaching: 'horagai',
    bossVictory: 'crowdCheer',
    cyborgKnockback: 'metal',
    cyborgShock: 'electricShock',
    gameOver: 'miss',
    decision: 'decision',
    gameStart: 'gameStart'
  };

  var BGM_MAP = { title: 'bgmTitle', normal: 'bgmMain', extra: 'bgmExtra' };

  var images = {};
  var loaded = {};
  var audioElements = {};
  var currentBgmEl = null;
  // タブが非表示/画面ロック等で隠れた際、こちらの都合でBGMを一時停止したかどうか。
  // 明示的なplayBgm/stopBgm呼び出しとは区別し、復帰時にだけ自動再開する。
  var bgmPausedByVisibility = false;

  function loadOne(key, src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        loaded[key] = true;
        resolve();
      };
      img.onerror = function () {
        loaded[key] = false;
        resolve();
      };
      img.src = src;
      images[key] = img;
    });
  }

  // 効果音プール(1つの音につき複数のAudio要素を使い回す)のサイズ。
  // 連打時に前の再生と重ねて鳴らすため、cloneNodeではなく事前生成した
  // プールを順番に使い回す(詳細はgetAudio/playSoundのコメント参照)。
  var SE_POOL_SIZE = 4;
  var sePools = {};

  // preload="auto"を指定した上でload()を呼び、要素生成と同時にダウンロードを
  // 開始させる。実サーバー配信時、効果音初回再生時にダウンロード待ちで
  // 再生が遅れる問題への対策(詳細はpreload/playSoundのコメント参照)。
  function createLoadedAudio(src) {
    var el = new Audio();
    el.preload = 'auto';
    el.src = src;
    try { el.load(); } catch (e) { /* 一部環境でload()が例外を投げても無視する */ }
    return el;
  }

  function buildSePool(key) {
    var src = ASSET_AUDIO[key];
    if (!src) { return null; }
    var nodes = [];
    for (var i = 0; i < SE_POOL_SIZE; i++) { nodes.push(createLoadedAudio(src)); }
    return { nodes: nodes, index: 0 };
  }

  function preload() {
    var promises = Object.keys(ASSET_IMAGES).map(function (key) {
      return loadOne(key, ASSET_IMAGES[key]);
    });
    var storyPromises = ASSET_STORY.map(function (entry, index) {
      return loadOne('story_' + index, entry.image);
    });

    // 効果音・BGMは実際に鳴らす瞬間(初回タップ等)まで読み込みを遅らせず、
    // ここで先読みを始めておく。ローカルファイルでは気づきにくいが、実際に
    // webサーバーへ公開して再生すると、遅延読み込みでは初回再生がネットワーク
    // 待ちで遅れて聞こえることがあるため。
    Object.keys(SE_MAP).forEach(function (id) {
      var key = SE_MAP[id];
      if (key && !sePools[key]) { sePools[key] = buildSePool(key); }
    });
    Object.keys(BGM_MAP).forEach(function (mode) {
      getAudio(BGM_MAP[mode]);
    });

    return Promise.allSettled(promises.concat(storyPromises));
  }

  function getImage(key) {
    return loaded[key] ? images[key] : null;
  }

  function getStoryImage(index) {
    return getImage('story_' + index);
  }

  // 画像は縦横比を保ったまま size x size の枠に収まるように描画する
  // (前作素材のzako/gyojiは52x60の縦長スプライトのため)。
  function drawSprite(ctx, key, x, y, size, angle, fallbackDraw) {
    var img = getImage(key);
    if (img) {
      var aspect = (img.naturalWidth || img.width || 1) / (img.naturalHeight || img.height || 1);
      var drawW = aspect >= 1 ? size : size * aspect;
      var drawH = aspect >= 1 ? size / aspect : size;
      ctx.save();
      ctx.translate(x, y);
      if (angle) { ctx.rotate(angle); }
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    } else if (fallbackDraw) {
      fallbackDraw(ctx, x, y, size, angle);
    }
  }

  function getAudio(key) {
    if (audioElements[key]) { return audioElements[key]; }
    var src = ASSET_AUDIO[key];
    if (!src) { return null; }
    try {
      var el = createLoadedAudio(src);
      audioElements[key] = el;
      return el;
    } catch (e) {
      return null;
    }
  }

  // 音声再生に関する処理は、どのような環境(自動再生ブロック・Audio未対応の
  // WebViewなど)でも例外を外に漏らさない。ここで例外が漏れると、呼び出し元の
  // ボタン処理(画面遷移等)まで巻き込んで止まってしまうため。
  function playSound(id) {
    try {
      var key = SE_MAP[id];
      if (!key) { return; }
      // 再生の都度cloneNodeで複製すると、複製後に改めて読み込みが走り
      // (特に実サーバー配信時)再生が遅れることがあるため、preloadで事前に
      // 用意しておいたプールを使い回す(連打時に前の再生と重ねて鳴らす目的も
      // これで達成できる)。
      var pool = sePools[key] || (sePools[key] = buildSePool(key));
      if (!pool) { return; }
      var node = pool.nodes[pool.index];
      pool.index = (pool.index + 1) % pool.nodes.length;
      node.currentTime = 0;
      node.volume = 0.8;
      var p = node.play();
      if (p && typeof p.catch === 'function') { p.catch(function () {}); }
    } catch (e) { /* 再生できない環境では黙って諦める */ }
  }

  function playBgm(id) {
    try {
      var key = BGM_MAP[id];
      if (!key) { return; }
      var el = getAudio(key);
      if (!el) { return; }
      bgmPausedByVisibility = false;
      if (currentBgmEl === el && !el.paused) { return; }
      stopBgm();
      el.loop = true;
      el.volume = 0.5;
      currentBgmEl = el;
      var p = el.play();
      if (p && typeof p.catch === 'function') { p.catch(function () {}); }
    } catch (e) { /* 自動再生ブロック等は無視する */ }
  }

  function stopBgm() {
    try {
      bgmPausedByVisibility = false;
      if (currentBgmEl) {
        currentBgmEl.pause();
        currentBgmEl.currentTime = 0;
        currentBgmEl = null;
      }
    } catch (e) { /* noop */ }
  }

  // タブが非表示になったり画面を消したりした際にBGMが鳴りっぱなしにならない
  // ようにする。stopBgmとは異なり再生位置(currentTime)は保持し、復帰時に
  // resumeBgmIfHiddenで同じ位置から再開する。
  function pauseBgmForHidden() {
    try {
      if (currentBgmEl && !currentBgmEl.paused) {
        currentBgmEl.pause();
        bgmPausedByVisibility = true;
      }
    } catch (e) { /* noop */ }
  }

  function resumeBgmIfHidden() {
    try {
      if (currentBgmEl && bgmPausedByVisibility) {
        bgmPausedByVisibility = false;
        var p = currentBgmEl.play();
        if (p && typeof p.catch === 'function') { p.catch(function () {}); }
      }
    } catch (e) { /* noop */ }
  }

  global.Dosukoi2 = global.Dosukoi2 || {};
  global.Dosukoi2.Assets = {
    IMAGES: ASSET_IMAGES,
    STORY: ASSET_STORY,
    preload: preload,
    getImage: getImage,
    getStoryImage: getStoryImage,
    drawSprite: drawSprite,
    playSound: playSound,
    playBgm: playBgm,
    stopBgm: stopBgm,
    pauseBgmForHidden: pauseBgmForHidden,
    resumeBgmIfHidden: resumeBgmIfHidden
  };
})(window);
