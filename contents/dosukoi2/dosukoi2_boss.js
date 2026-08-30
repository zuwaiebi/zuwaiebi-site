(function (global) {
  'use strict';

  var RANKS = ['maekashira', 'komusubi', 'sekiwake', 'ozeki', 'yokozuna'];

  var RANK_INFO = {
    maekashira: { label: '前頭', letter: '前', color: '#4d78d9', baseHp: 8, baseSpeed: 0.050, pattern: 'zigzag', assetKey: 'bossMaekashira' },
    komusubi: { label: '小結', letter: '小', color: '#3fb950', baseHp: 12, baseSpeed: 0.058, pattern: 'ninjaWarp', assetKey: 'bossKomusubi' },
    sekiwake: { label: '関脇', letter: '関', color: '#d29922', baseHp: 16, baseSpeed: 0.062, pattern: 'spiral', assetKey: 'bossSekiwake' },
    ozeki: { label: '大関', letter: '大', color: '#db6d28', baseHp: 14, baseSpeed: 0.068, pattern: 'summonAdvance', assetKey: 'bossOzeki' },
    yokozuna: { label: '横綱', letter: '横', color: '#f85149', baseHp: 30, baseSpeed: 0.075, pattern: 'yokozunaPhases', assetKey: 'bossYokozuna' }
  };

  function rankAt(index) {
    return RANKS[((index % RANKS.length) + RANKS.length) % RANKS.length];
  }

  // lap(周回数)が進むほどHP・速度を底上げする。周回0(初回)はmultiplier=1のまま。
  function statsFor(rankKey, lap, multiplier) {
    var info = RANK_INFO[rankKey];
    var mul = Math.pow(multiplier, lap);
    return {
      hp: Math.round(info.baseHp * mul),
      speed: info.baseSpeed * (1 + (mul - 1) * 0.5)
    };
  }

  function clampDistance(entity) {
    if (entity.distanceFromCenter < 0) { entity.distanceFromCenter = 0; }
  }

  // 大関、および横綱が召喚フェーズ(HP25%以下)にいる間は「雑魚シールド」を持つ。
  // 自分が召喚した雑魚が生きている間は無敵になり(dosukoi2_game.js側で判定)、
  // 新たな召喚も控える(下のsummonAdvanceがentity.invincibleを見て判断する)。
  function hasSummonShield(entity) {
    if (entity.rank === 'ozeki') { return true; }
    if (entity.rank === 'yokozuna') { return (entity.hp / entity.maxHp) <= 0.25; }
    return false;
  }

  // 大関(summonAdvance)が雑魚を召喚した直後に歩みを止める時間(秒)
  var SUMMON_PAUSE_DURATION = 1.0;

  // 小結のワープ先が元の位置に近すぎないよう、最低限これだけ角度を離す(ラジアン)
  var MIN_WARP_ANGLE_OFFSET = Math.PI / 3; // 60度

  var PATTERNS = {
    // 前頭: 大きく左右に何度も揺れながら直進する
    zigzag: function (entity, dt, elapsed) {
      entity.distanceFromCenter -= entity.speed * dt;
      clampDistance(entity);
      var lap = entity.lap || 0;
      var wobbleSpeed = 2.6 + lap * 0.3;
      var wobbleAmp = 0.7 + lap * 0.15;
      entity.angle = entity.baseAngle + Math.sin(elapsed * wobbleSpeed) * wobbleAmp;
    },

    // 小結: 忍者風。軽く揺れながら進むが、一定回数タップされると「ドロン」で
    // 少しだけ中心から遠い別の場所へ瞬間移動する(タップ回数はgame.js側で加算)。
    ninjaWarp: function (entity, dt, elapsed) {
      entity.distanceFromCenter -= entity.speed * dt;
      clampDistance(entity);
      entity.angle = entity.baseAngle + Math.sin(elapsed * 4) * 0.2;

      var lap = entity.lap || 0;
      var hitsNeeded = Math.max(1, 3 - Math.floor(lap / 2));
      if ((entity.patternState.hitsSinceWarp || 0) >= hitsNeeded) {
        entity.patternState.hitsSinceWarp = 0;
        entity.patternState.warpEffectFrom = {
          nx: Math.cos(entity.angle) * entity.distanceFromCenter,
          ny: Math.sin(entity.angle) * entity.distanceFromCenter
        };
        var warpDistanceBonus = 0.08 + lap * 0.02;
        // 元の角度からMIN_WARP_ANGLE_OFFSET〜(2π-MIN_WARP_ANGLE_OFFSET)だけ
        // ずらすことで、どの方向にずれても必ず一定角度以上離れた場所へワープする
        var offsetRange = Math.PI * 2 - MIN_WARP_ANGLE_OFFSET * 2;
        var angleOffset = MIN_WARP_ANGLE_OFFSET + Math.random() * offsetRange;
        entity.baseAngle = entity.baseAngle + angleOffset;
        entity.angle = entity.baseAngle;
        entity.distanceFromCenter = Math.min(1.0, entity.distanceFromCenter + warpDistanceBonus);
        entity.patternState.warpEffectTo = {
          nx: Math.cos(entity.angle) * entity.distanceFromCenter,
          ny: Math.sin(entity.angle) * entity.distanceFromCenter
        };
      }
    },

    // 関脇: 渦を巻くように高速回転しながら、じりじりと中心へ近づく
    spiral: function (entity, dt) {
      var lap = entity.lap || 0;
      var angularSpeed = 3.5 + lap * 0.6;
      entity.angle += angularSpeed * dt;
      entity.distanceFromCenter -= entity.speed * 0.35 * dt;
      clampDistance(entity);
    },

    // 大関(および召喚フェーズの横綱): 登場した瞬間に1回目の召喚を行い、以降も
    // 少し進むごとに雑魚を大量召喚しつつ中心へ近づく(実際の召喚処理は
    // pendingSummonCountを見てdosukoi2_game.js側が行う)。召喚数は周回ごとに
    // 4→16体まで増える。召喚するたびにコンマ数秒だけ歩みを止める(隙が生まれる)。
    // 自分が召喚した雑魚がまだ生きている間(entity.invincible、game.js側で毎フレーム
    // 更新)は無敵になるとともに、新たな召喚も中断する(雑魚を延々と積み増ししない)。
    summonAdvance: function (entity, dt) {
      if ((entity.patternState.summonPauseTimer || 0) > 0) {
        entity.patternState.summonPauseTimer -= dt;
        return;
      }

      entity.distanceFromCenter -= entity.speed * dt;
      clampDistance(entity);

      if (entity.invincible) {
        // 召喚済みの雑魚がまだ残っている間は、次の召喚までの間隔をリセットし続ける。
        // こうすることで、雑魚を片付けた直後から改めて間隔分の猶予が生まれる。
        entity.patternState.lastSummonDistance = entity.distanceFromCenter;
        return;
      }

      var lap = entity.lap || 0;
      var summonInterval = Math.max(0.12, 0.22 - lap * 0.02);
      var isFirstCall = entity.patternState.lastSummonDistance === undefined;
      if (isFirstCall) {
        entity.patternState.lastSummonDistance = entity.distanceFromCenter;
      }
      // 登場した瞬間(1回目の呼び出し)は無条件で召喚し、以降は間隔分進むごとに召喚する
      if (isFirstCall || entity.patternState.lastSummonDistance - entity.distanceFromCenter >= summonInterval) {
        entity.patternState.lastSummonDistance = entity.distanceFromCenter;
        entity.patternState.pendingSummonCount = Math.min(16, 4 + lap * 2);
        entity.patternState.summonPauseTimer = SUMMON_PAUSE_DURATION;
      }
    },

    // 横綱: 「心・技・体」ならぬ、格下の四力士の技を全て使いこなす。
    // HPが減るごとに 前頭(揺れ)→小結(ワープ)→関脇(渦)→大関(召喚) の技へ
    // 切り替わっていく、格の違いを見せつける総合力士。無敵時間などのズルはしない。
    yokozunaPhases: function (entity, dt, elapsed) {
      var hpRatio = entity.hp / entity.maxHp;
      if (hpRatio > 0.75) {
        PATTERNS.zigzag(entity, dt, elapsed);
      } else if (hpRatio > 0.5) {
        PATTERNS.ninjaWarp(entity, dt, elapsed);
      } else if (hpRatio > 0.25) {
        PATTERNS.spiral(entity, dt, elapsed);
      } else {
        PATTERNS.summonAdvance(entity, dt, elapsed);
      }
    }
  };

  function updateBossPattern(entity, dt, elapsed) {
    var fn = PATTERNS[entity.pattern];
    if (fn) { fn(entity, dt, elapsed); }
  }

  global.Dosukoi2 = global.Dosukoi2 || {};
  global.Dosukoi2.Boss = {
    RANKS: RANKS,
    RANK_INFO: RANK_INFO,
    rankAt: rankAt,
    statsFor: statsFor,
    hasSummonShield: hasSummonShield,
    updateBossPattern: updateBossPattern
  };
})(window);
