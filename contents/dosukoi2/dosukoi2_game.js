(function (global) {
  'use strict';

  var Entities = global.Dosukoi2.Entities;
  var Spawner = global.Dosukoi2.Spawner;
  var Boss = global.Dosukoi2.Boss;
  var Assets = global.Dosukoi2.Assets;
  var Render = global.Dosukoi2.Render;
  var Storage = global.Dosukoi2.Storage;

  var BOSS_INTRO_DURATION = 1.4;
  var BOSS_CLEAR_DURATION = 1.2;
  var FINALE_DURATION = 2.4;
  var EFFECT_TTL = 0.35;
  // WARNING演出の長さ。雑魚・行司の残数に関わらず、この秒数が経過したらボスを出現させる。
  var BOSS_WARNING_DURATION = 3.0;
  // WARNING中、雑魚が全滅して行司だけが残った場合に行司を速める倍率
  var GYOJI_HURRY_SPEED_MULTIPLIER = 4;
  // ボスが出現した時点で(まだ速められていない)行司にかける倍率。上の半分程度。
  var GYOJI_BOSS_APPEAR_SPEED_MULTIPLIER = GYOJI_HURRY_SPEED_MULTIPLIER / 2;
  // ボスは登場演出中、画面外の出現位置からこの距離(フィールド半径基準)まで
  // 滑り込んでくる。1.0はフィールド円のふち(旧仕様での初期出現位置)に相当し、
  // 以降のボス戦の間合いを変えないための値。
  var BOSS_INTRO_TARGET_DISTANCE = 1.0;

  function createGame(mode) {
    return {
      mode: mode,
      phase: 'RUSH',
      phaseTimer: 0,
      entities: [],
      effects: [],
      spawner: Spawner.createSpawner(mode),
      score: 0,
      defeatedZako: 0,
      defeatedBosses: 0,
      elapsedTime: 0,
      currentBoss: null,
      bossIntroStartDistance: 0,
      highestRankIndex: -1,
      firstBossRankSeen: null,
      firstBossDefeated: false,
      lastDefeatedRankLabel: null,
      isOver: false,
      onGameOver: null
    };
  }

  var SMOKE_EFFECT_TTL = 0.5;

  function addEffectAt(game, nx, ny) {
    game.effects.push({ nx: nx, ny: ny, ttl: EFFECT_TTL, maxTtl: EFFECT_TTL });
  }

  function addSmokeEffectAt(game, nx, ny) {
    game.effects.push({ nx: nx, ny: ny, ttl: SMOKE_EFFECT_TTL, maxTtl: SMOKE_EFFECT_TTL, kind: 'smoke' });
  }

  function addEffect(game, entity) {
    var pos = Entities.getPosition(entity);
    addEffectAt(game, pos.nx, pos.ny);
  }

  function removeEntityAt(game, index) {
    game.entities.splice(index, 1);
  }

  function removeEntity(game, entity) {
    var idx = game.entities.indexOf(entity);
    if (idx >= 0) { game.entities.splice(idx, 1); }
  }

  function endGame(game) {
    if (game.isOver) { return; }
    game.isOver = true;
    game.phase = 'GAMEOVER';
    Assets.playSound('gameOver');
    if (typeof game.onGameOver === 'function') {
      game.onGameOver(buildResult(game));
    }
  }

  function buildResult(game) {
    return {
      mode: game.mode,
      score: game.score,
      defeatedZako: game.defeatedZako,
      defeatedBosses: game.defeatedBosses,
      highestRank: game.highestRankIndex >= 0 ? Boss.RANKS[game.highestRankIndex] : null,
      laps: game.spawner.lap,
      survivalSec: Math.round(game.elapsedTime),
      showOmake: game.mode === 'extra' && game.firstBossDefeated,
      achievedAt: new Date().toISOString()
    };
  }

  function onZakoDefeated(game, zako) {
    zako.phase = 'dying';
    addEffect(game, zako);
    removeEntity(game, zako);
    game.defeatedZako++;
    game.score += 1;
    Spawner.notifyZakoKilled(game.spawner);
    Assets.playSound('zakoDefeated');
  }

  // ボスが自ら召喚した雑魚がまだ場に生きているかどうか
  function hasAliveSummonedZako(game, boss) {
    for (var i = 0; i < game.entities.length; i++) {
      if (game.entities[i].summonedBy === boss.id) { return true; }
    }
    return false;
  }

  function onBossDamaged(game, boss) {
    // 大関、および召喚フェーズの横綱は、自分が呼び出した雑魚が生きている間は無敵
    // (先に雑魚を片付けさせる)
    if (Boss.hasSummonShield(boss) && hasAliveSummonedZako(game, boss)) {
      addEffect(game, boss);
      return;
    }

    boss.hp--;
    boss.patternState.hitsSinceWarp = (boss.patternState.hitsSinceWarp || 0) + 1;
    Assets.playSound('bossHit');
    if (boss.hp > 0) { return; }

    boss.phase = 'dying';
    addEffect(game, boss);
    removeEntity(game, boss);
    game.defeatedBosses++;
    game.score += 5;
    game.lastDefeatedRankLabel = Boss.RANK_INFO[boss.rank].label;
    Assets.playSound('bossDefeated');
    Assets.playSound('bossVictory'); // 「○○撃破!!!」の表示に合わせて歓声を鳴らす

    // ボスが召喚した雑魚がいれば、ボスの撃破と同時に全ていなくなる
    for (var i = game.entities.length - 1; i >= 0; i--) {
      if (game.entities[i].summonedBy === boss.id) {
        game.entities.splice(i, 1);
      }
    }

    var rankIndex = Boss.RANKS.indexOf(boss.rank);
    if (rankIndex > game.highestRankIndex) { game.highestRankIndex = rankIndex; }

    if (game.firstBossRankSeen === boss.rank && !game.firstBossDefeated) {
      game.firstBossDefeated = true;
    }

    if (game.mode === 'normal' && boss.rank === 'yokozuna' && !Storage.isExtraUnlocked()) {
      Storage.unlockExtra();
    }

    if (boss.rank === 'yokozuna') {
      game.phase = 'FINALE';
      game.phaseTimer = FINALE_DURATION;
      Assets.playSound('finale');
    } else {
      game.phase = 'BOSS_CLEAR';
      game.phaseTimer = BOSS_CLEAR_DURATION;
    }
    Spawner.advanceAfterBoss(game.spawner);
    game.currentBoss = null;
  }

  function onTapAt(game, px, py, canvasWidth, canvasHeight) {
    if (game.isOver) { return; }
    var geometry = Render.computeFieldGeometry(canvasWidth, canvasHeight);
    var nx = (px - geometry.centerX) / geometry.fieldRadius;
    var ny = (py - geometry.centerY) / geometry.fieldRadius;
    var hit = Entities.hitTestAt(nx, ny, game.entities);
    if (!hit) { return; }
    if (hit.kind === 'zako') {
      onZakoDefeated(game, hit);
    } else if (hit.kind === 'gyoji') {
      // 行司は誤ってタップしてしまうと即ゲームオーバーの障害物
      endGame(game);
    } else {
      onBossDamaged(game, hit);
    }
  }

  // 雑魚・行司を1体ずつ更新する(exclude指定のエンティティ、通常はボス自身は除く)。
  // 雑魚が土俵に到達したらゲームオーバー、行司が反対側まで抜けたら黙って除去する。
  // ゲームオーバーになった場合は true を返す。
  function updateRoamingEntities(game, dt, exclude) {
    for (var i = game.entities.length - 1; i >= 0; i--) {
      var e = game.entities[i];
      if (e === exclude) { continue; }
      Entities.updateEntity(e, dt, dt);
      if (e.kind === 'gyoji') {
        if (Entities.hasExited(e)) { removeEntityAt(game, i); }
      } else if (Entities.hasReachedCenter(e)) {
        endGame(game);
        return true;
      }
    }
    return false;
  }

  // WARNING中、雑魚が全滅して行司だけが残っている場合、行司を速めて
  // さっさと画面外へ抜けさせる(ボス出現までいつまでも居座らせないため)。
  function hurryLoneGyoji(game) {
    for (var i = 0; i < game.entities.length; i++) {
      if (game.entities[i].kind === 'zako') { return; }
    }
    for (var j = 0; j < game.entities.length; j++) {
      var e = game.entities[j];
      if (e.kind === 'gyoji' && !e.hurrying) {
        e.hurrying = true;
        e.speed *= GYOJI_HURRY_SPEED_MULTIPLIER;
      }
    }
  }

  // WARNINGが終わってボスが出現した時点で、まだ速められていない行司を
  // 幾らか速める(WARNING中の「行司単独残り」ほどではないが、居座らせすぎないため)。
  function applyBossAppearGyojiSpeedup(game) {
    for (var i = 0; i < game.entities.length; i++) {
      var e = game.entities[i];
      if (e.kind === 'gyoji' && !e.hurrying) {
        e.hurrying = true;
        e.speed *= GYOJI_BOSS_APPEAR_SPEED_MULTIPLIER;
      }
    }
  }

  function startBossIntro(game, width, height) {
    var boss = Spawner.nextBoss(game.spawner, width, height);
    game.currentBoss = boss;
    game.bossIntroStartDistance = boss.distanceFromCenter;
    if (game.firstBossRankSeen === null) { game.firstBossRankSeen = boss.rank; }
    game.entities.push(boss);
    game.phase = 'BOSS_INTRO';
    game.phaseTimer = BOSS_INTRO_DURATION;
    applyBossAppearGyojiSpeedup(game);
    Assets.playSound('bossIntro');
  }

  // ボスの特殊能力による副作用(忍者ワープの煙演出、大関の雑魚大量召喚)を反映する。
  function applyBossAbilitySideEffects(game, boss, width, height) {
    if (boss.patternState.warpEffectFrom) {
      addSmokeEffectAt(game, boss.patternState.warpEffectFrom.nx, boss.patternState.warpEffectFrom.ny);
      boss.patternState.warpEffectFrom = null;
    }
    if (boss.patternState.warpEffectTo) {
      addSmokeEffectAt(game, boss.patternState.warpEffectTo.nx, boss.patternState.warpEffectTo.ny);
      boss.patternState.warpEffectTo = null;
    }
    if (boss.patternState.pendingSummonCount) {
      var count = boss.patternState.pendingSummonCount;
      boss.patternState.pendingSummonCount = 0;
      for (var s = 0; s < count; s++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = Spawner.currentZakoSpeed(game.spawner);
        var summonedZako = Entities.createZako(angle, speed, width, height);
        summonedZako.summonedBy = boss.id;
        game.entities.push(summonedZako);
      }
    }
  }

  function update(game, dt, width, height) {
    if (game.isOver) { return; }
    game.elapsedTime += dt;

    for (var i = game.effects.length - 1; i >= 0; i--) {
      game.effects[i].ttl -= dt;
      if (game.effects[i].ttl <= 0) { game.effects.splice(i, 1); }
    }

    if (game.phase === 'RUSH') {
      Spawner.update(game.spawner, dt, game.entities, width, height, function (zako) {
        game.entities.push(zako);
      });
      Spawner.updateGyoji(game.spawner, dt, game.entities, width, height, function (gyoji) {
        game.entities.push(gyoji);
      });
      if (updateRoamingEntities(game, dt)) { return; }

      if (Spawner.shouldStartBoss(game.spawner)) {
        // 必要数の雑魚を倒しきったら、新規湧きを止めてWARNING演出に入る。
        // 残存する雑魚・行司の全滅は待たず、WARNING開始から一定秒数でボスを出現させる。
        game.phase = 'BOSS_WARNING';
        game.phaseTimer = BOSS_WARNING_DURATION;
        Assets.playSound('bossApproaching'); // 「○○接近!!!」の表示に合わせて法螺貝を鳴らす
      }
    } else if (game.phase === 'BOSS_WARNING') {
      hurryLoneGyoji(game);
      Spawner.updateBossEncounterZako(game.spawner, dt, game.entities, width, height, function (zako) {
        game.entities.push(zako);
      });
      if (updateRoamingEntities(game, dt)) { return; }
      game.phaseTimer -= dt;
      if (game.phaseTimer <= 0) {
        startBossIntro(game, width, height);
      }
    } else if (game.phase === 'BOSS_INTRO') {
      Spawner.updateBossEncounterZako(game.spawner, dt, game.entities, width, height, function (zako) {
        game.entities.push(zako);
      });
      // ボスの登場演出中も、残っている雑魚・行司は止まらずに動き続ける
      if (updateRoamingEntities(game, dt, game.currentBoss)) { return; }
      game.phaseTimer -= dt;
      var t = Math.min(1, 1 - Math.max(0, game.phaseTimer) / BOSS_INTRO_DURATION);
      game.currentBoss.distanceFromCenter = game.bossIntroStartDistance +
        (BOSS_INTRO_TARGET_DISTANCE - game.bossIntroStartDistance) * t;
      if (game.phaseTimer <= 0) {
        game.currentBoss.distanceFromCenter = BOSS_INTRO_TARGET_DISTANCE;
        game.currentBoss.phase = 'active';
        game.currentBoss.spawnedAt = game.elapsedTime;
        game.phase = 'BOSS';
      }
    } else if (game.phase === 'BOSS') {
      var boss2 = game.currentBoss;
      Spawner.updateBossEncounterZako(game.spawner, dt, game.entities, width, height, function (zako) {
        game.entities.push(zako);
      });
      if (updateRoamingEntities(game, dt, boss2)) { return; }
      if (boss2) {
        Entities.updateEntity(boss2, dt, game.elapsedTime - boss2.spawnedAt);
        applyBossAbilitySideEffects(game, boss2, width, height);
        // 無敵状態(自分が召喚した雑魚が生きている間)を描画側・boss.js側へ伝える
        boss2.invincible = Boss.hasSummonShield(boss2) && hasAliveSummonedZako(game, boss2);
        if (Entities.hasReachedCenter(boss2)) {
          endGame(game);
          return;
        }
      }
    } else if (game.phase === 'BOSS_CLEAR' || game.phase === 'FINALE') {
      // 撃破演出中は新規の雑魚は湧かないが、既に残っている雑魚・行司は動き続ける
      if (updateRoamingEntities(game, dt)) { return; }
      game.phaseTimer -= dt;
      if (game.phaseTimer <= 0) {
        game.phase = 'RUSH';
      }
    }
  }

  global.Dosukoi2 = global.Dosukoi2 || {};
  global.Dosukoi2.Game = {
    createGame: createGame,
    update: update,
    onTapAt: onTapAt,
    buildResult: buildResult
  };
})(window);
