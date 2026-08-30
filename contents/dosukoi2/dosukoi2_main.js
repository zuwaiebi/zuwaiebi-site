(function (global) {
  'use strict';

  var Dosukoi2 = global.Dosukoi2;
  var State = Dosukoi2.State;
  var Storage = Dosukoi2.Storage;
  var Assets = Dosukoi2.Assets;
  var Game = Dosukoi2.Game;
  var Render = Dosukoi2.Render;
  var Input = Dosukoi2.Input;
  var Result = Dosukoi2.Result;
  var Boss = Dosukoi2.Boss;

  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var cssWidth = 0;
  var cssHeight = 0;
  var currentGame = null;
  var lastTimestamp = null;
  var storyIndex = 0;
  var pendingMode = 'normal';

  function resizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var rect = canvas.parentElement.getBoundingClientRect();
    cssWidth = rect.width;
    cssHeight = rect.height;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function updateHud(game) {
    document.getElementById('hud-score').textContent =
      '撃退数: ' + (game.defeatedZako + game.defeatedBosses);

    var rankEl = document.getElementById('hud-rank');
    var bossWrap = document.getElementById('boss-hp-wrap');

    if (game.phase === 'FINALE') {
      rankEl.textContent = '千秋楽！';
      bossWrap.hidden = true;
    } else if (game.phase === 'BOSS_WARNING') {
      rankEl.textContent = '';
      bossWrap.hidden = true;
    } else if (game.phase === 'BOSS_CLEAR') {
      rankEl.textContent = '撃破！';
      bossWrap.hidden = true;
    } else if (game.currentBoss && (game.phase === 'BOSS_INTRO' || game.phase === 'BOSS')) {
      var info = Boss.RANK_INFO[game.currentBoss.rank];
      rankEl.textContent = info.label + '出現！';
      bossWrap.hidden = false;
      document.getElementById('boss-hp-label').textContent = info.label;
      var pct = Math.max(0, game.currentBoss.hp / game.currentBoss.maxHp) * 100;
      document.getElementById('boss-hp-fill').style.width = pct + '%';
    } else {
      rankEl.textContent = game.mode === 'extra' ? 'EXTRA' : '';
      bossWrap.hidden = true;
    }
  }

  function loop(timestamp) {
    if (lastTimestamp === null) { lastTimestamp = timestamp; }
    var dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;

    if (currentGame && !currentGame.isOver) {
      Game.update(currentGame, dt, cssWidth, cssHeight);
      updateHud(currentGame);
    }
    if (currentGame) {
      Render.draw(ctx, cssWidth, cssHeight, currentGame);
    }
    requestAnimationFrame(loop);
  }

  function startGame(mode) {
    Assets.playSound('gameStart');
    Assets.playBgm(mode);
    State.show('play');
    resizeCanvas();
    currentGame = Game.createGame(mode);
    currentGame.onGameOver = function (result) {
      Result.show(result);
      State.show('result');
      Assets.playBgm('title');
    };
  }

  function goToStart() {
    pendingMode = 'normal';
    if (Storage.hasSeenIntro()) {
      startGame('normal');
    } else {
      Assets.playSound('decision');
      storyIndex = 0;
      showStorySlide();
      State.show('story');
    }
  }

  function showStorySlide() {
    var story = Assets.STORY[storyIndex];
    var imageEl = document.getElementById('story-image');
    var captionEl = document.getElementById('story-caption');
    captionEl.textContent = story.caption;
    var img = Assets.getStoryImage(storyIndex);
    if (img) {
      imageEl.style.backgroundImage = 'url(' + img.src + ')';
      imageEl.classList.remove('placeholder');
    } else {
      imageEl.style.backgroundImage = '';
      imageEl.classList.add('placeholder');
    }
    document.getElementById('btn-story-next').textContent =
      storyIndex >= Assets.STORY.length - 1 ? '遊び方へ' : 'つぎへ';
  }

  function refreshTitle() {
    document.getElementById('btn-extra').hidden = !Storage.isExtraUnlocked();
    var best = Storage.getBest('normal');
    document.getElementById('title-best').textContent =
      best ? '自己ベスト: スコア ' + best.score : '';
  }

  // スマホのブラウザで開いた際、ブラウザのアドレスバー等を隠した全画面表示に
  // できるようにする。Fullscreen APIはユーザー操作(タップ)を起点にしないと
  // 呼び出せないため、最初のタップ1回だけを捉えて試行する。非対応環境
  // (一部のiOS Safari等)では静かに諦める。
  function tryEnterFullscreen() {
    try {
      var el = document.documentElement;
      var request = el.requestFullscreen || el.webkitRequestFullscreen ||
        el.mozRequestFullScreen || el.msRequestFullscreen;
      if (!request) {
        console.warn('[dosukoi2] Fullscreen API非対応(requestFullscreenが存在しない)');
        return;
      }
      if (document.fullscreenElement) { return; }
      var result = request.call(el);
      if (result && typeof result.catch === 'function') {
        result.catch(function (err) {
          // 失敗理由が分かるようコンソールに残す(例: Permissions-Policyでの禁止、
          // iframe埋め込みでallow="fullscreen"が無い、等が典型的な原因)
          console.warn('[dosukoi2] フルスクリーン化に失敗:', err && err.name, err && err.message);
        });
      }
    } catch (e) {
      console.warn('[dosukoi2] フルスクリーン化で例外:', e && e.message);
    }
  }

  function init() {
    // ボタンの配線を最優先で行う。アセット読み込み/BGM再生を先に行うと、
    // 万一そちらで例外が起きた際にボタンが一切反応しなくなってしまうため、
    // 配線を終えてから後段でアセット関連の処理を行う。
    document.addEventListener('pointerdown', tryEnterFullscreen, { once: true });

    document.getElementById('btn-start').addEventListener('click', goToStart);

    document.getElementById('btn-extra').addEventListener('click', function () {
      startGame('extra');
    });

    document.getElementById('btn-story').addEventListener('click', function () {
      Assets.playSound('decision');
      pendingMode = 'normal';
      storyIndex = 0;
      showStorySlide();
      State.show('story');
    });

    document.getElementById('btn-howto').addEventListener('click', function () {
      Assets.playSound('decision');
      State.show('howto');
    });

    document.getElementById('btn-story-skip').addEventListener('click', function () {
      Assets.playSound('decision');
      State.show('howto');
    });

    document.getElementById('btn-story-next').addEventListener('click', function () {
      Assets.playSound('decision');
      storyIndex++;
      if (storyIndex >= Assets.STORY.length) {
        State.show('howto');
      } else {
        showStorySlide();
      }
    });

    document.getElementById('btn-howto-close').addEventListener('click', function () {
      Storage.markIntroSeen();
      startGame(pendingMode);
    });

    document.getElementById('btn-retry').addEventListener('click', function () {
      startGame(currentGame ? currentGame.mode : 'normal');
    });

    document.getElementById('btn-to-title').addEventListener('click', function () {
      Assets.playSound('decision');
      refreshTitle();
      State.show('title');
    });

    Input.attach(canvas, function (px, py) {
      if (currentGame && !currentGame.isOver) {
        Game.onTapAt(currentGame, px, py, cssWidth, cssHeight);
      }
    });

    window.addEventListener('resize', function () {
      if (document.getElementById('screen-play').classList.contains('active')) {
        resizeCanvas();
      }
    });

    window.addEventListener('orientationchange', function () {
      requestAnimationFrame(function () {
        if (document.getElementById('screen-play').classList.contains('active')) {
          resizeCanvas();
        }
      });
    });

    requestAnimationFrame(loop);

    try { Assets.preload(); } catch (e) { /* 素材読み込みに失敗してもゲーム進行は妨げない */ }
    try { refreshTitle(); } catch (e) { /* noop */ }
    Assets.playBgm('title');
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
