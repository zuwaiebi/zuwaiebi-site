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
  // ゲーム開始演出。「はっけよぉい…」をこの秒数表示してから、
  // 「のこった！」の表示と同時に実際のゲーム進行(雑魚の湧き)を始める。
  var HAKKEYOI_DURATION = 3.0;
  var NOKOTTA_DURATION = 1.0;
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

  // 大関の「時間停止からくり」。召喚のたびにゲーム全体を一時停止し、雑魚を
  // 1体ずつこの間隔で配置していく(画面外からではなく、いきなり所定の位置に
  // 出現させる)。詳細はstartOzekiTimeStop/updateOzekiTimeStopのコメント参照。
  var OZEKI_TIMESTOP_SPAWN_INTERVAL = 0.2;
  // 雑魚の配置位置。中心(0)から見て端(1.0、通常の登場距離の基準)までの2/3。
  var OZEKI_TIMESTOP_SUMMON_DISTANCE = 2 / 3;
  // 最後の1体を配置してから、実際に時間を再開するまでの余韻(秒)。
  // 0にすると配置完了と同時に動き出してしまい、隊列を見せる間が無くなるため。
  var OZEKI_TIMESTOP_POST_SPAWN_HOLD = 0.4;

  function createGame(mode) {
    return {
      mode: mode,
      phase: 'START_HAKKEYOI',
      phaseTimer: HAKKEYOI_DURATION,
      introBannerText: null,
      introBannerTimer: 0,
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
      // 大関の時間停止中はnullではなく{queue, spawnTimer, holdTimer, ...}になる
      // (詳細はstartOzekiTimeStopのコメント参照)。null以外の間、update()は
      // 冒頭で早期returnし、ゲーム全体(大関含む)が完全に停止する。
      timeStop: null,
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

  // ボスのHPが尽きた際の共通処理(通常のタップ撃破・関脇の電撃ダメージ・
  // 前頭(磁石)の共有HP消滅、いずれからも呼ぶ)。
  function defeatBoss(game, boss) {
    boss.phase = 'dying';
    addEffect(game, boss);
    removeEntity(game, boss);
    if (boss.partner) {
      // 前頭(磁石)は体力共有のペアなので、片方が尽きたらもう片方も同時にいなくなる
      boss.partner.phase = 'dying';
      addEffect(game, boss.partner);
      removeEntity(game, boss.partner);
    }
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

  function onBossDamaged(game, boss) {
    // 召喚フェーズの横綱(HP25%以下、大関の技を借用中)は、自分が呼び出した
    // 雑魚が生きている間は無敵(先に雑魚を片付けさせる)。大関自身はもう
    // このシールドを持たない(代わりに召喚の瞬間だけゲーム全体が時間停止する)。
    if (Boss.hasSummonShield(boss) && hasAliveSummonedZako(game, boss)) {
      addEffect(game, boss);
      return;
    }

    boss.hp--;
    boss.patternState.hitsSinceWarp = (boss.patternState.hitsSinceWarp || 0) + 1;
    Assets.playSound('bossHit');
    if (boss.hp > 0) { return; }
    defeatBoss(game, boss);
  }

  // 関脇(半無敵サイボーグ)は通常のタップではダメージを受けず、斜め左右に
  // 弾き飛ばされるだけ。弾き飛ばした先が画面端(電流の境界)まで届いていれば、
  // 電撃ダメージが入る。
  function onCyborgTapped(game, boss, canvasWidth, canvasHeight) {
    Assets.playSound('cyborgKnockback');
    Boss.applyCyborgKnockback(boss);
    var geometry = Render.computeFieldGeometry(canvasWidth, canvasHeight);
    var edgeDistance = Render.computeEdgeDistance(geometry, canvasWidth, canvasHeight, boss.angle);
    if (boss.distanceFromCenter < edgeDistance) { return; }
    boss.distanceFromCenter = edgeDistance;
    // 弾き先が画面端でクランプされた場合、飛んでいく演出の着地点もそこに合わせる
    if (boss.patternState.knockbackAnim) { boss.patternState.knockbackAnim.toDistance = edgeDistance; }
    Boss.applyCyborgShockReset(boss);
    boss.hp--;
    Assets.playSound('cyborgShock');
    addEffect(game, boss);
    if (boss.hp > 0) {
      // 画面端(edgeDistance)から、最初に登場した位置と同じ距離まで前方へスッと戻す
      Boss.startCyborgReturnGlide(boss, BOSS_INTRO_TARGET_DISTANCE);
      return;
    }
    defeatBoss(game, boss);
  }

  // 前頭(磁石、赤・青)。近づいている方をタップすると通常の1ダメージが入ると同時に
  // 役割(近づく/遠ざかる)が入れ替わる。遠ざかっている方をタップした場合も
  // ダメージは入るが、その1/4(0.25)のみで、役割の入れ替えは起きない。
  // ダメージは共有HPに入る(タップされた側と相棒の両方のhpを同期させる)。
  var MAGNET_RETREAT_TAP_DAMAGE = 0.25;

  function onMagnetTapped(game, entity) {
    var isApproaching = entity.role === 'approaching';
    entity.hp -= isApproaching ? 1 : MAGNET_RETREAT_TAP_DAMAGE;
    if (entity.partner) { entity.partner.hp = entity.hp; }
    Assets.playSound('bossHit');
    addEffect(game, entity);
    if (isApproaching) {
      entity.role = 'retreating';
      if (entity.partner) { entity.partner.role = 'approaching'; }
    }
    if (entity.hp > 0) { return; }
    defeatBoss(game, game.currentBoss);
  }

  function onTapAt(game, px, py, canvasWidth, canvasHeight) {
    if (game.isOver) { return; }
    // 大関の時間停止中はゲーム全体が止まっており、プレイヤーも敵にダメージを
    // 与えられない(startOzekiTimeStop/updateOzekiTimeStop参照)。
    if (game.timeStop) { return; }
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
    } else if (hit.rank === 'sekiwake') {
      onCyborgTapped(game, hit, canvasWidth, canvasHeight);
    } else if (hit.rank === 'jishaku') {
      onMagnetTapped(game, hit);
    } else {
      onBossDamaged(game, hit);
    }
  }

  // 雑魚・行司を1体ずつ更新する(exclude/exclude2指定のエンティティ、通常は
  // ボス自身、前頭(磁石)であればそのペア相手も除く)。雑魚が土俵に到達したら
  // ゲームオーバー、行司が反対側まで抜けたら黙って除去する。
  // ゲームオーバーになった場合は true を返す。
  function updateRoamingEntities(game, dt, exclude, exclude2) {
    for (var i = game.entities.length - 1; i >= 0; i--) {
      var e = game.entities[i];
      if (e === exclude || e === exclude2) { continue; }
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

  // 前頭(磁石、赤・青)は必ず向かい合わせ(角度差π)で同時出現し、体力を共有する。
  // game.currentBossには代表(赤)側を置き、相棒(青)はboss.partnerで参照する。
  function spawnMagnetPartner(game, boss, width, height) {
    var partner = Entities.createBoss('jishaku', boss.lap, Spawner.DIFFICULTY.lapDifficultyMultiplier,
      width, height, boss.angle + Math.PI);
    partner.hp = boss.hp;
    partner.maxHp = boss.maxHp;
    boss.partner = partner;
    partner.partner = boss;
    // 最初はどちらが近づく役かをランダムに決める
    var bossApproachesFirst = Math.random() < 0.5;
    boss.role = bossApproachesFirst ? 'approaching' : 'retreating';
    partner.role = bossApproachesFirst ? 'retreating' : 'approaching';
    boss.magnetVariant = 'red';
    partner.magnetVariant = 'blue';
    game.entities.push(partner);
  }

  function startBossIntro(game, width, height) {
    var boss = Spawner.nextBoss(game.spawner, width, height);
    game.currentBoss = boss;
    game.bossIntroStartDistance = boss.distanceFromCenter;
    if (game.firstBossRankSeen === null) { game.firstBossRankSeen = boss.rank; }
    game.entities.push(boss);
    if (boss.rank === 'jishaku') { spawnMagnetPartner(game, boss, width, height); }
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
    if (boss.patternState.pendingTimeStopSummon) {
      startOzekiTimeStop(game, boss, width, height);
    }
  }

  // 大関の「時間停止からくり」を開始する。以後のupdate()は冒頭でこれを検知し、
  // updateOzekiTimeStopに処理を譲る(ゲーム全体・大関自身を含め、通常の
  // フェーズ進行や敵の移動、タップ判定は一切行われなくなる)。
  function startOzekiTimeStop(game, boss, width, height) {
    var count = boss.patternState.pendingTimeStopSummon;
    boss.patternState.pendingTimeStopSummon = 0;
    if (!count) { return; }
    var queue = [];
    for (var i = 0; i < count; i++) {
      queue.push({ angle: Math.random() * Math.PI * 2, speed: Spawner.currentZakoSpeed(game.spawner) });
    }
    game.timeStop = {
      bossId: boss.id,
      width: width,
      height: height,
      queue: queue,
      spawnTimer: 0,
      holdTimer: null
    };
    Assets.playSound('timeStop');
  }

  // 大関の時間停止中、毎フレーム呼ばれる(update()冒頭からの委譲)。雑魚を
  // OZEKI_TIMESTOP_SPAWN_INTERVALごとに1体ずつ、画面外からではなく
  // OZEKI_TIMESTOP_SUMMON_DISTANCE(中心から見て端まで2/3)の位置へ直接配置する。
  // 全員配置し終えたら、少し(OZEKI_TIMESTOP_POST_SPAWN_HOLD秒)間を置いてから
  // 時間停止を解除する。
  function updateOzekiTimeStop(game, dt) {
    var ts = game.timeStop;
    if (ts.queue.length > 0) {
      ts.spawnTimer -= dt;
      if (ts.spawnTimer <= 0) {
        var next = ts.queue.shift();
        var zako = Entities.createZako(next.angle, next.speed, ts.width, ts.height, OZEKI_TIMESTOP_SUMMON_DISTANCE);
        zako.summonedBy = ts.bossId;
        game.entities.push(zako);
        Assets.playSound('summon');
        ts.spawnTimer = OZEKI_TIMESTOP_SPAWN_INTERVAL;
      }
      return;
    }
    if (ts.holdTimer === null) { ts.holdTimer = OZEKI_TIMESTOP_POST_SPAWN_HOLD; }
    ts.holdTimer -= dt;
    if (ts.holdTimer <= 0) {
      game.timeStop = null;
      Assets.playSound('timeStart');
    }
  }

  function update(game, dt, width, height) {
    if (game.isOver) { return; }
    // 大関の時間停止中は、ゲーム全体(大関自身・雑魚・行司・演出タイマー等)を
    // 完全に停止させる。updateOzekiTimeStop自身のタイマーだけを進める。
    if (game.timeStop) {
      updateOzekiTimeStop(game, dt);
      return;
    }
    game.elapsedTime += dt;

    for (var i = game.effects.length - 1; i >= 0; i--) {
      game.effects[i].ttl -= dt;
      if (game.effects[i].ttl <= 0) { game.effects.splice(i, 1); }
    }

    // 「のこった！」の表示は、ゲーム進行(雑魚の湧き等)とは独立したタイマーで消す
    if (game.introBannerTimer > 0) {
      game.introBannerTimer -= dt;
      if (game.introBannerTimer <= 0) { game.introBannerText = null; }
    }

    if (game.phase === 'START_HAKKEYOI') {
      game.phaseTimer -= dt;
      if (game.phaseTimer <= 0) {
        game.phase = 'RUSH';
        game.introBannerText = 'のこった！';
        game.introBannerTimer = NOKOTTA_DURATION;
        Assets.playSound('gameStart');
      }
      return;
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
      var introPartner = game.currentBoss && game.currentBoss.partner;
      // ボスの登場演出中も、残っている雑魚・行司は止まらずに動き続ける
      if (updateRoamingEntities(game, dt, game.currentBoss, introPartner)) { return; }
      game.phaseTimer -= dt;
      var t = Math.min(1, 1 - Math.max(0, game.phaseTimer) / BOSS_INTRO_DURATION);
      game.currentBoss.distanceFromCenter = game.bossIntroStartDistance +
        (BOSS_INTRO_TARGET_DISTANCE - game.bossIntroStartDistance) * t;
      // 前頭(磁石)は相棒も同じ滑り込みタイミングで一緒に登場させる
      if (introPartner) {
        introPartner.distanceFromCenter = game.bossIntroStartDistance +
          (BOSS_INTRO_TARGET_DISTANCE - game.bossIntroStartDistance) * t;
      }
      if (game.phaseTimer <= 0) {
        game.currentBoss.distanceFromCenter = BOSS_INTRO_TARGET_DISTANCE;
        game.currentBoss.phase = 'active';
        game.currentBoss.spawnedAt = game.elapsedTime;
        if (introPartner) {
          introPartner.distanceFromCenter = BOSS_INTRO_TARGET_DISTANCE;
          introPartner.phase = 'active';
          introPartner.spawnedAt = game.elapsedTime;
        }
        game.phase = 'BOSS';
      }
    } else if (game.phase === 'BOSS') {
      var boss2 = game.currentBoss;
      var partner2 = boss2 && boss2.partner;
      Spawner.updateBossEncounterZako(game.spawner, dt, game.entities, width, height, function (zako) {
        game.entities.push(zako);
      });
      if (updateRoamingEntities(game, dt, boss2, partner2)) { return; }
      if (boss2) {
        Entities.updateEntity(boss2, dt, game.elapsedTime - boss2.spawnedAt);
        applyBossAbilitySideEffects(game, boss2, width, height);
        var boss2HasAliveSummonedZako = hasAliveSummonedZako(game, boss2);
        // 無敵状態(自分が召喚した雑魚が生きている間)を描画側・boss.js側へ伝える
        // (大関自身はもうこのシールドを持たないため常にfalseになる。詳細は
        // Boss.hasSummonShieldのコメント参照)
        boss2.invincible = Boss.hasSummonShield(boss2) && boss2HasAliveSummonedZako;
        // 大関(summonAdvance)が「前回の召喚がまだ片付いていない間は新たな
        // 召喚を控える」ために参照する(旧来のentity.invincibleとは無関係)
        boss2.patternState.hasLiveSummonedZako = boss2HasAliveSummonedZako;
        if (Entities.hasReachedCenter(boss2)) {
          endGame(game);
          return;
        }
      }
      if (partner2) {
        Entities.updateEntity(partner2, dt, game.elapsedTime - partner2.spawnedAt);
        if (Entities.hasReachedCenter(partner2)) {
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
