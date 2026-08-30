(function (global) {
  'use strict';

  var KEY_SEEN_INTRO = 'dosukoi2_seenIntro';
  var KEY_EXTRA_UNLOCKED = 'dosukoi2_extraUnlocked';
  var KEY_BEST_NORMAL = 'dosukoi2_best';
  var KEY_BEST_EXTRA = 'dosukoi2_bestExtra';

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

  global.Dosukoi2 = global.Dosukoi2 || {};
  global.Dosukoi2.Storage = {
    hasSeenIntro: hasSeenIntro,
    markIntroSeen: markIntroSeen,
    isExtraUnlocked: isExtraUnlocked,
    unlockExtra: unlockExtra,
    getBest: getBest,
    saveIfBest: saveIfBest
  };
})(window);
