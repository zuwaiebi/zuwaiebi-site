(function (global) {
  'use strict';

  var Boss = global.Dosukoi2.Boss;

  // 土俵(中心の輪)の半径をフィールド半径に対する比率で定義。この値以下まで
  // 近づいたら土俵の輪に到達したとみなす。dosukoi2_render.js の描画にも使う。
  var DOHYO_RATIO = 0.2;
  var HIT_TOLERANCE = 0.02;

  var nextId = 1;

  // 出現距離(distanceFromCenter初期値)は画面の実サイズから、その角度で画面矩形の
  // 外にはみ出る距離を計算する(Dosukoi2.Render.computeSpawnDistance)。
  // 円形のフィールド半径だけで計算すると、横長画面では横方向が画面内に収まって
  // しまい「画面外から出現」にならないため。

  function createZako(angle, referenceSpeed, width, height) {
    var Render = global.Dosukoi2.Render;
    var geometry = Render.computeFieldGeometry(width, height);
    var spawnDistance = Render.computeSpawnDistance(geometry, width, height, angle);
    // 出現角度によって出現距離(spawnDistance)は変わる(横長画面では左右からの
    // 出現の方が遠い)。実際に移動する距離(spawnDistance - DOHYO_RATIO、土俵の輪に
    // 到達するまでの距離)に比例して速度を決めることで、基準距離1.0での所要時間を
    // 基準に、どの角度から出現しても土俵到達までの所要時間が一定になるようにする。
    var speed = referenceSpeed * (spawnDistance - DOHYO_RATIO) / (1 - DOHYO_RATIO);
    return {
      id: nextId++,
      kind: 'zako',
      angle: angle,
      baseAngle: angle,
      distanceFromCenter: spawnDistance,
      speed: speed,
      hp: 1,
      maxHp: 1,
      size: 0.30,
      pattern: null,
      patternState: {},
      phase: 'active',
      spawnedAt: 0
    };
  }

  function createBoss(rankKey, lap, lapMultiplier, width, height) {
    var Render = global.Dosukoi2.Render;
    var info = Boss.RANK_INFO[rankKey];
    var stats = Boss.statsFor(rankKey, lap, lapMultiplier);
    var angle = Math.random() * Math.PI * 2;
    var geometry = Render.computeFieldGeometry(width, height);
    var spawnDistance = Render.computeSpawnDistance(geometry, width, height, angle);
    return {
      id: nextId++,
      kind: 'boss',
      rank: rankKey,
      lap: lap,
      angle: angle,
      baseAngle: angle,
      distanceFromCenter: spawnDistance,
      speed: stats.speed,
      hp: stats.hp,
      maxHp: stats.hp,
      size: 0.48,
      pattern: info.pattern,
      patternState: {},
      phase: 'intro',
      spawnedAt: 0
    };
  }

  // 行司: 土俵中央を目指さず、出現した辺の向かい合わせの辺のどこかへ直進して
  // 通り抜ける。タップしてしまうと即ゲームオーバーになる障害物。
  function createGyoji(speed, width, height) {
    var Render = global.Dosukoi2.Render;
    var geometry = Render.computeFieldGeometry(width, height);
    var sides = ['left', 'right', 'top', 'bottom'];
    var opposite = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
    var side = sides[Math.floor(Math.random() * sides.length)];
    var start = Render.randomEdgePoint(geometry, width, height, side);
    var end = Render.randomEdgePoint(geometry, width, height, opposite[side]);
    var dx = end.nx - start.nx;
    var dy = end.ny - start.ny;
    return {
      id: nextId++,
      kind: 'gyoji',
      startNx: start.nx,
      startNy: start.ny,
      endNx: end.nx,
      endNy: end.ny,
      traveled: 0,
      pathLength: Math.sqrt(dx * dx + dy * dy),
      speed: speed,
      size: 0.32,
      phase: 'active',
      spawnedAt: 0
    };
  }

  // どの種類のエンティティでも、土俵中心を原点・フィールド半径を1とした
  // 正規化座標での現在位置を返す(描画・当たり判定の共通経路)。
  function getPosition(entity) {
    if (entity.kind === 'gyoji') {
      var t = entity.pathLength > 0 ? Math.min(1, entity.traveled / entity.pathLength) : 1;
      return {
        nx: entity.startNx + (entity.endNx - entity.startNx) * t,
        ny: entity.startNy + (entity.endNy - entity.startNy) * t
      };
    }
    return {
      nx: Math.cos(entity.angle) * entity.distanceFromCenter,
      ny: Math.sin(entity.angle) * entity.distanceFromCenter
    };
  }

  function updateEntity(entity, dt, elapsedSinceSpawn) {
    if (entity.kind === 'gyoji') {
      entity.traveled += entity.speed * dt;
      if (entity.traveled > entity.pathLength) { entity.traveled = entity.pathLength; }
      return;
    }
    if (entity.kind === 'boss' && entity.pattern) {
      Boss.updateBossPattern(entity, dt, elapsedSinceSpawn);
    } else {
      entity.distanceFromCenter -= entity.speed * dt;
    }
    if (entity.distanceFromCenter < 0) { entity.distanceFromCenter = 0; }
  }

  function hasReachedCenter(entity) {
    return entity.distanceFromCenter <= DOHYO_RATIO;
  }

  function hasExited(entity) {
    return entity.traveled >= entity.pathLength;
  }

  // nx, ny は土俵中心を原点、フィールド半径を1とした正規化座標
  function hitTestAt(nx, ny, entities) {
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      if (e.phase !== 'active') { continue; }
      var pos = getPosition(e);
      var dx = nx - pos.nx;
      var dy = ny - pos.ny;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var radius = (e.size / 2) + HIT_TOLERANCE;
      if (dist <= radius && dist < bestDist) {
        best = e;
        bestDist = dist;
      }
    }
    return best;
  }

  global.Dosukoi2 = global.Dosukoi2 || {};
  global.Dosukoi2.Entities = {
    DOHYO_RATIO: DOHYO_RATIO,
    createZako: createZako,
    createBoss: createBoss,
    createGyoji: createGyoji,
    getPosition: getPosition,
    updateEntity: updateEntity,
    hasReachedCenter: hasReachedCenter,
    hasExited: hasExited,
    hitTestAt: hitTestAt
  };
})(window);
