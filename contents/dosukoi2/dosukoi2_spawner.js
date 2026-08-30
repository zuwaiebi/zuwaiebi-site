(function (global) {
  'use strict';

  var Entities = global.Dosukoi2.Entities;
  var Boss = global.Dosukoi2.Boss;

  var DIFFICULTY = {
    initialSpawnInterval: 1.8,
    minSpawnInterval: 0.3,
    spawnIntervalDecayPerSecond: 0.02,
    initialMaxConcurrent: 3,
    maxConcurrentCap: 10,
    concurrentIncreasePerKills: 8,
    initialZakoSpeed: 0.13,
    zakoSpeedGrowthPerSecond: 0.0009,
    zakoSpeedCap: 0.20,
    killsPerBossWave: 15,
    // ボスを一周(前頭〜横綱)するごとに、次の周でボス出現に必要な撃退数を増やす
    killsPerBossWaveGrowthPerLap: 5,
    lapDifficultyMultiplier: 1.25
  };

  // 行司は2周目(lap>=1)から登場する。出現間隔は固定、速度は雑魚と同じ上昇曲線を使う。
  var GYOJI_SPAWN_INTERVAL = 5.0;

  // 2周目(lap>=1)以降、ボス接近演出〜ボス撃破までの間も控えめに湧く雑魚の設定。
  // ゲーム開始時より低頻度・低速で、難度の上昇も緩やかにする。
  var BOSS_ENCOUNTER_ZAKO = {
    initialSpawnInterval: 3.2,
    minSpawnInterval: 1.2,
    spawnIntervalDecayPerSecond: 0.006,
    initialSpeed: 0.09,
    speedGrowthPerSecond: 0.0004,
    speedCap: 0.15
  };

  function createSpawner(mode) {
    return {
      mode: mode,
      elapsed: 0,
      zakoKills: 0,
      totalKillsSinceBoss: 0,
      spawnTimer: 0,
      gyojiSpawnTimer: GYOJI_SPAWN_INTERVAL,
      bossZakoSpawnTimer: BOSS_ENCOUNTER_ZAKO.initialSpawnInterval,
      lap: 0,
      bossIndex: 0
    };
  }

  // EXTRAモードは経過時間/撃退数を無視し、常に通常モード終盤相当の上限値を使う
  // (「開始時点から超高難易度」という仕様)。

  function currentSpawnInterval(spawner) {
    if (spawner.mode === 'extra') { return DIFFICULTY.minSpawnInterval; }
    var v = DIFFICULTY.initialSpawnInterval - spawner.elapsed * DIFFICULTY.spawnIntervalDecayPerSecond;
    return Math.max(DIFFICULTY.minSpawnInterval, v);
  }

  function currentMaxConcurrent(spawner) {
    if (spawner.mode === 'extra') { return DIFFICULTY.maxConcurrentCap; }
    var extra = Math.floor(spawner.zakoKills / DIFFICULTY.concurrentIncreasePerKills);
    return Math.min(DIFFICULTY.maxConcurrentCap, DIFFICULTY.initialMaxConcurrent + extra);
  }

  function currentZakoSpeed(spawner) {
    if (spawner.mode === 'extra') { return DIFFICULTY.zakoSpeedCap; }
    var v = DIFFICULTY.initialZakoSpeed + spawner.elapsed * DIFFICULTY.zakoSpeedGrowthPerSecond;
    return Math.min(DIFFICULTY.zakoSpeedCap, v);
  }

  function currentKillsPerBossWave(spawner) {
    return DIFFICULTY.killsPerBossWave + spawner.lap * DIFFICULTY.killsPerBossWaveGrowthPerLap;
  }

  function activeCount(entities) {
    var count = 0;
    for (var i = 0; i < entities.length; i++) {
      if (entities[i].kind === 'zako' && entities[i].phase !== 'dying') { count++; }
    }
    return count;
  }

  function activeGyojiCount(entities) {
    var count = 0;
    for (var i = 0; i < entities.length; i++) {
      if (entities[i].kind === 'gyoji' && entities[i].phase !== 'dying') { count++; }
    }
    return count;
  }

  // n周目(1始まり)では(n-1)人まで、という仕様。lapは0始まりなので lap がそのまま上限になる。
  function maxGyojiConcurrent(spawner) {
    return spawner.lap;
  }

  function update(spawner, dt, entities, width, height, onSpawnZako) {
    spawner.elapsed += dt;
    spawner.spawnTimer -= dt;
    if (spawner.spawnTimer <= 0 && activeCount(entities) < currentMaxConcurrent(spawner)) {
      spawner.spawnTimer = currentSpawnInterval(spawner);
      var angle = Math.random() * Math.PI * 2;
      onSpawnZako(Entities.createZako(angle, currentZakoSpeed(spawner), width, height));
    }
  }

  function updateGyoji(spawner, dt, entities, width, height, onSpawnGyoji) {
    if (spawner.lap < 1) { return; }
    spawner.gyojiSpawnTimer -= dt;
    if (spawner.gyojiSpawnTimer <= 0 && activeGyojiCount(entities) < maxGyojiConcurrent(spawner)) {
      spawner.gyojiSpawnTimer = GYOJI_SPAWN_INTERVAL;
      onSpawnGyoji(Entities.createGyoji(currentZakoSpeed(spawner), width, height));
    }
  }

  function currentBossEncounterZakoInterval(spawner) {
    if (spawner.mode === 'extra') { return BOSS_ENCOUNTER_ZAKO.minSpawnInterval; }
    var v = BOSS_ENCOUNTER_ZAKO.initialSpawnInterval - spawner.elapsed * BOSS_ENCOUNTER_ZAKO.spawnIntervalDecayPerSecond;
    return Math.max(BOSS_ENCOUNTER_ZAKO.minSpawnInterval, v);
  }

  function currentBossEncounterZakoSpeed(spawner) {
    if (spawner.mode === 'extra') { return BOSS_ENCOUNTER_ZAKO.speedCap; }
    var v = BOSS_ENCOUNTER_ZAKO.initialSpeed + spawner.elapsed * BOSS_ENCOUNTER_ZAKO.speedGrowthPerSecond;
    return Math.min(BOSS_ENCOUNTER_ZAKO.speedCap, v);
  }

  // 2周目(lap>=1)以降、ボス接近演出〜ボス撃破までの間も控えめに雑魚を湧かせる。
  // 通常のRUSH中の湧き(update関数)とは別の、低頻度・低速な専用カーブを使う。
  function updateBossEncounterZako(spawner, dt, entities, width, height, onSpawnZako) {
    if (spawner.lap < 1) { return; }
    spawner.bossZakoSpawnTimer -= dt;
    if (spawner.bossZakoSpawnTimer <= 0 && activeCount(entities) < currentMaxConcurrent(spawner)) {
      spawner.bossZakoSpawnTimer = currentBossEncounterZakoInterval(spawner);
      var angle = Math.random() * Math.PI * 2;
      onSpawnZako(Entities.createZako(angle, currentBossEncounterZakoSpeed(spawner), width, height));
    }
  }

  function notifyZakoKilled(spawner) {
    spawner.zakoKills++;
    spawner.totalKillsSinceBoss++;
  }

  function shouldStartBoss(spawner) {
    return spawner.totalKillsSinceBoss >= currentKillsPerBossWave(spawner);
  }

  function nextBoss(spawner, width, height) {
    var rankKey = Boss.rankAt(spawner.bossIndex);
    return Entities.createBoss(rankKey, spawner.lap, DIFFICULTY.lapDifficultyMultiplier, width, height);
  }

  function advanceAfterBoss(spawner) {
    spawner.totalKillsSinceBoss = 0;
    spawner.bossIndex++;
    if (spawner.bossIndex >= Boss.RANKS.length) {
      spawner.bossIndex = 0;
      spawner.lap++;
    }
  }

  global.Dosukoi2 = global.Dosukoi2 || {};
  global.Dosukoi2.Spawner = {
    DIFFICULTY: DIFFICULTY,
    createSpawner: createSpawner,
    update: update,
    updateGyoji: updateGyoji,
    updateBossEncounterZako: updateBossEncounterZako,
    currentZakoSpeed: currentZakoSpeed,
    notifyZakoKilled: notifyZakoKilled,
    shouldStartBoss: shouldStartBoss,
    nextBoss: nextBoss,
    advanceAfterBoss: advanceAfterBoss
  };
})(window);
