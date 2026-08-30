(function (global) {
  'use strict';

  var KEY_SEEN_INTRO = 'dosukoi2_seenIntro';
  var KEY_EXTRA_UNLOCKED = 'dosukoi2_extraUnlocked';
  var KEY_BEST_NORMAL = 'dosukoi2_best';
  var KEY_BEST_EXTRA = 'dosukoi2_bestExtra';
  var KEY_FULLSCREEN_PREF = 'dosukoi2_fullscreenPref';

  function bestKey(mode) {
    return mode === 'extra' ? KEY_BEST_EXTRA : KEY_BEST_NORMAL;
  }

  function readJson(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // localStorageが使えない環境(プライベートブラウジング等)では黙って諦める
    }
  }

  function hasSeenIntro() {
    try {
      return localStorage.getItem(KEY_SEEN_INTRO) === '1';
    } catch (e) {
      return false;
    }
  }

  function markIntroSeen() {
    try {
      localStorage.setItem(KEY_SEEN_INTRO, '1');
    } catch (e) { /* noop */ }
  }

  function isExtraUnlocked() {
    try {
      return localStorage.getItem(KEY_EXTRA_UNLOCKED) === '1';
    } catch (e) {
      return false;
    }
  }

  function unlockExtra() {
    try {
      localStorage.setItem(KEY_EXTRA_UNLOCKED, '1');
    } catch (e) { /* noop */ }
  }

  // 未設定(初回)時はtrue扱いにする(全画面表示をデフォルトで有効にするため)
  function isFullscreenPrefEnabled() {
    try {
      var v = localStorage.getItem(KEY_FULLSCREEN_PREF);
      return v === null ? true : v === '1';
    } catch (e) {
      return true;
    }
  }

  function setFullscreenPref(enabled) {
    try {
      localStorage.setItem(KEY_FULLSCREEN_PREF, enabled ? '1' : '0');
    } catch (e) { /* noop */ }
  }

  function getBest(mode) {
    return readJson(bestKey(mode));
  }

  function saveIfBest(mode, result) {
    var current = getBest(mode);
    if (current && current.score >= result.score) {
      return false;
    }
    writeJson(bestKey(mode), {
      score: result.score,
      defeatedZako: result.defeatedZako,
      defeatedBosses: result.defeatedBosses,
      highestRank: result.highestRank,
      laps: result.laps,
      survivalSec: result.survivalSec,
      achievedAt: result.achievedAt
    });
    return true;
  }

  // ハイスコア・EXTRA解放・導入既読フラグ・全画面設定など、このゲームが
  // localStorageに保存している内容をすべて消し、初期状態に戻す。
  function resetAll() {
    var keys = [KEY_SEEN_INTRO, KEY_EXTRA_UNLOCKED, KEY_BEST_NORMAL, KEY_BEST_EXTRA, KEY_FULLSCREEN_PREF];
    for (var i = 0; i < keys.length; i++) {
      try { localStorage.removeItem(keys[i]); } catch (e) { /* noop */ }
    }
  }

  global.Dosukoi2 = global.Dosukoi2 || {};
  global.Dosukoi2.Storage = {
    hasSeenIntro: hasSeenIntro,
    markIntroSeen: markIntroSeen,
    isExtraUnlocked: isExtraUnlocked,
    unlockExtra: unlockExtra,
    getBest: getBest,
    saveIfBest: saveIfBest,
    isFullscreenPrefEnabled: isFullscreenPrefEnabled,
    setFullscreenPref: setFullscreenPref,
    resetAll: resetAll
  };
})(window);
