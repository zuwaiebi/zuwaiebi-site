(function (global) {
  'use strict';

  // 前作からの仮素材。zako/gyojiは52x60の縦長スプライト、congratulation.pngは
  // 前作エンディングの「CONGRATULATION!」画像でEXTRAモードのオマケ絵として流用する。
  var ASSET_IMAGES = {
    zako: 'data/images/zako.png',
    oozekiZako: 'data/images/oozeki_zako.png',
    gyoji: 'data/images/gyoji.png',
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
    gameOver: 'miss',
    decision: 'decision',
    gameStart: 'gameStart'
  };

  var BGM_MAP = { title: 'bgmTitle', normal: 'bgmMain', extra: 'bgmExtra' };

  var images = {};
  var loaded = {};
  var audioElements = {};
  var currentBgmEl = null;

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

  function preload() {
    var promises = Object.keys(ASSET_IMAGES).map(function (key) {
      return loadOne(key, ASSET_IMAGES[key]);
    });
    var storyPromises = ASSET_STORY.map(function (entry, index) {
      return loadOne('story_' + index, entry.image);
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
      var el = new Audio(src);
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
      var el = getAudio(key);
      if (!el) { return; }
      // 複製して鳴らすことで、連打時に前の再生が途切れず重なって鳴るようにする
      var node = el.cloneNode(true);
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
      if (currentBgmEl) {
        currentBgmEl.pause();
        currentBgmEl.currentTime = 0;
        currentBgmEl = null;
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
    stopBgm: stopBgm
  };
})(window);
