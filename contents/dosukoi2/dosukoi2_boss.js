(function (global) {
  'use strict';

  // 出現順・番付ラベルはプレイテストの結果に基づいて決めたもので、今後さらに
  // 変わる可能性がある(内部key名は歴史的な名残で、必ずしも現在のlabelとは
  // 対応していない。ゲーム内表示は常にlabelを使うので実害はない)。
  // 実際の相撲の番付順(低→高、このゲームで使っているものだけ抜粋):
  // 序ノ口 < 幕下 < 十両 < 前頭 < 小結 < 関脇 < 大関 < 横綱
  var RANKS = ['makushita', 'juryo', 'komusubi', 'jishaku', 'maekashira', 'sekiwake', 'ozeki', 'yokozuna'];

  var RANK_INFO = {
    // 序ノ口(内部key: makushita): 大きく左右に揺れながら直進する(zigzagパターン)。
    makushita: { label: '序ノ口', letter: '序', color: '#4d78d9', baseHp: 8, baseSpeed: 0.050, pattern: 'zigzag', assetKey: 'bossMakushita' },
    // 幕下(内部key: juryo): 忍者風のワープ持ち(ninjaWarpパターン)。
    juryo: { label: '幕下', letter: '幕', color: '#3fb950', baseHp: 12, baseSpeed: 0.058, pattern: 'ninjaWarp', assetKey: 'bossJuryo' },
    // 十両(内部key: komusubi): 妨害系。登場と同時に広告風ウィンドウを連鎖表示し、
    // 消すまで下の敵をタップできなくする(実際の妨害処理はdosukoi2_ads.js/
    // dosukoi2_main.js側)。移動自体はzigzagパターンを流用した横揺れ直進。
    komusubi: { label: '十両', letter: '十', color: '#e83e9c', baseHp: 12, baseSpeed: 0.058, pattern: 'adBlock', assetKey: 'bossKomusubi' },
    // 前頭(内部key: jishaku): 赤・青の2体が向かい合わせで同時出現し、体力を
    // 共有する。常に片方が近づき片方が遠ざかり、近づいている方をタップすると
    // 役割(近づく/遠ざかる)が入れ替わる(実際の役割入れ替え・ダメージ処理は
    // dosukoi2_game.jsのonMagnetTapped)。baseSpeedはこのランクでは未使用
    // (移動はmagnetPair内の専用定数で制御)。
    jishaku: { label: '前頭', letter: '前', color: '#9a7bd6', baseHp: 12, baseSpeed: 0.045, pattern: 'magnetPair', assetKey: 'bossJishaku' },
    // 小結(内部key: maekashira): 渦を巻くように高速回転しながら中心へ迫る(spiralパターン)。
    maekashira: { label: '小結', letter: '小', color: '#d29922', baseHp: 16, baseSpeed: 0.062, pattern: 'spiral', assetKey: 'bossMaekashira' },
    // 関脇(内部key: sekiwake): 半無敵サイボーグ。タップではダメージが入らず
    // 弾き返すのみで、画面端(電流が流れる境界)まで弾き飛ばすと電撃ダメージが
    // 入る(dosukoi2_game.js側)。
    sekiwake: { label: '関脇', letter: '関', color: '#b0b8c0', baseHp: 8, baseSpeed: 0.045, pattern: 'cyborgAdvance', assetKey: 'bossSekiwake' },
    // 大関: 一定間隔で雑魚を大量召喚する。召喚の瞬間はゲーム全体の時間が止まり、
    // 灰色の画面の中、雑魚が中心から見て端まで2/3の位置へ0.2秒間隔で
    // 次々に配置されていく(演出・実処理の詳細はsummonAdvanceのコメント、
    // 時間停止そのものはdosukoi2_game.jsのstartOzekiTimeStop/updateOzekiTimeStop参照)。
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

  // 横綱が召喚フェーズ(HP25%以下、大関の技を借りている間)にいる間は「雑魚シールド」を
  // 持つ。自分が召喚した雑魚が生きている間は無敵になり(dosukoi2_game.js側で判定)、
  // 新たな召喚も控える(下のsummonAdvanceLegacyAuraがentity.invincibleを見て判断する)。
  //
  // 大関自身はもうこのシールド(無敵のオーラ)を持たない。以前は
  // `if (entity.rank === 'ozeki') { return true; }` をここに置き、大関を
  // 「自分が召喚した雑魚が生きている間ずっと無敵」にしていたが、現在は
  // 召喚の瞬間だけゲーム全体の時間を止める演出(summonAdvance+
  // dosukoi2_game.jsのstartOzekiTimeStop/updateOzekiTimeStop)に置き換えた。
  // 元の無敵オーラ仕様に戻したい場合は、上のif文を復活させ、かつ
  // RANK_INFO.ozeki.patternを'summonAdvanceLegacyAura'に変更すればよい
  // (summonAdvanceLegacyAuraは旧実装のまま残してある)。
  function hasSummonShield(entity) {
    if (entity.rank === 'yokozuna') { return (entity.hp / entity.maxHp) <= 0.25; }
    return false;
  }

  // 大関(summonAdvanceLegacyAura、および横綱の借用技)が雑魚を召喚した直後に
  // 歩みを止める時間(秒)。現在の大関(summonAdvance)は召喚のたびに
  // ゲーム全体を時間停止させるため、この一時停止は使わない。
  var SUMMON_PAUSE_DURATION = 1.0;

  // 幕下のワープ先が元の位置に近すぎないよう、最低限これだけ角度を離す(ラジアン)
  var MIN_WARP_ANGLE_OFFSET = Math.PI / 3; // 60度

  // 関脇(半無敵サイボーグ)は等速ではなく、時間経過で加速しながら中心へ迫る。
  // 初速度(RANK_INFO.baseSpeed)はやや遅めだが、加速度は周回が進むほど高くなる。
  // 電撃ダメージを受けると、加速度・速度ともに初期状態へリセットされる
  // (dosukoi2_game.js側でapplyCyborgShockResetを呼ぶ)。
  var CYBORG_BASE_ACCELERATION = 0.02;
  var CYBORG_ACCELERATION_LAP_GROWTH = 0.015;

  // 関脇をタップした際に弾き飛ばす距離・角度。真後ろではなく斜め左右に
  // 回り込むように弾くため、角度もランダムな範囲でずらす。実際にその場所まで
  // 弧を描いて移動する様子を見せるため、瞬間移動はさせずアニメーションさせる
  // (patternState.knockbackAnim、描画側はdosukoi2_render.jsが参照する)。
  var CYBORG_KNOCKBACK_DISTANCE = 0.16;
  var CYBORG_KNOCKBACK_ANGLE_MIN = Math.PI / 7;
  var CYBORG_KNOCKBACK_ANGLE_MAX = Math.PI / 4;
  var CYBORG_KNOCKBACK_ANIM_DURATION = 0.22;

  // 電撃ダメージを受けた後、弾かれた先(画面端)から前方へ、角度はそのまま
  // スッと前進させる(knockbackAnimの再生が終わってから始まり、これ自体も
  // distanceFromCenterを直接動かす実移動)。被弾するたびに前進する距離は
  // 段階的に増えていく(CYBORG_RETURN_GLIDE_STEPずつ深く進むようになる)が、
  // 安全マージンとして「端(登場位置)から中心までのうち、これ以上内側へは
  // 進ませない」という下限比率を設ける。この下限比率は1周目(lap=0)では
  // 半分(0.5)だが、周回が増えるごとに1/3(CYBORG_MIN_APPROACH_RATIO)へ
  // 指数関数的に漸近していく(0.5→0.4→0.36→0.34→…)。
  var CYBORG_RETURN_GLIDE_DURATION = 0.35;
  var CYBORG_RETURN_GLIDE_STEP = 0.12;
  var CYBORG_MIN_APPROACH_RATIO = 1 / 3;
  var CYBORG_MAX_APPROACH_RATIO_LAP0 = 0.5;
  var CYBORG_APPROACH_FLOOR_DECAY = 0.4;

  // 周回数(lap、0始まり)に応じた「これ以上内側へは進ませない」比率を返す。
  function cyborgApproachFloorRatio(lap) {
    return CYBORG_MIN_APPROACH_RATIO +
      (CYBORG_MAX_APPROACH_RATIO_LAP0 - CYBORG_MIN_APPROACH_RATIO) * Math.pow(CYBORG_APPROACH_FLOOR_DECAY, lap);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // 前頭(赤・青、内部key: jishaku)。遠ざかる速度は固定でごく遅く、周回が進んでも変わらない。
  // 近づく速度は基準値が周回ごとに上がるうえ、HPが減るほど(0に近づくほど)
  // さらに加速する。役割(近づく/遠ざかる)の入れ替え自体はタップ時に
  // dosukoi2_game.js側(onMagnetTapped)が行う。
  // 登場した瞬間は両者ともdistanceFromCenter=1.0(登場位置)から始まるため、
  // 遠ざかる側の上限をちょうど1.0にしてしまうと最初から上限に張り付いて
  // 全く動けなくなる。登場位置より少し外側まで動けるようにしておく。
  var MAGNET_RETREAT_SPEED = 0.035;
  var MAGNET_RETREAT_MAX_DISTANCE = 1.15;
  // 初速・HP減少時の加速幅ともにさらに引き上げ済み
  // (旧値: BASE_SPEED=0.045→0.075、HP_SPEED_BONUS=0.09→0.16)。
  var MAGNET_APPROACH_BASE_SPEED = 0.10;
  var MAGNET_APPROACH_LAP_GROWTH = 0.02;
  var MAGNET_APPROACH_HP_SPEED_BONUS = 0.24;

  var PATTERNS = {
    // 序ノ口: 大きく左右に何度も揺れながら直進する
    zigzag: function (entity, dt, elapsed) {
      entity.distanceFromCenter -= entity.speed * dt;
      clampDistance(entity);
      var lap = entity.lap || 0;
      var wobbleSpeed = 2.6 + lap * 0.3;
      var wobbleAmp = 0.7 + lap * 0.15;
      entity.angle = entity.baseAngle + Math.sin(elapsed * wobbleSpeed) * wobbleAmp;
    },

    // 幕下: 忍者風。軽く揺れながら進むが、一定回数タップされると「ドロン」で
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

    // 小結: 渦を巻くように高速回転しながら、じりじりと中心へ近づく
    spiral: function (entity, dt) {
      var lap = entity.lap || 0;
      var angularSpeed = 3.5 + lap * 0.6;
      entity.angle += angularSpeed * dt;
      entity.distanceFromCenter -= entity.speed * 0.35 * dt;
      clampDistance(entity);
    },

    // 大関: 登場した瞬間に1回目の召喚を行い、以降も少し進むごとに雑魚を
    // 大量召喚しつつ中心へ近づく。召喚の合図(pendingTimeStopSummon)を
    // 立てるだけで、実際の召喚(ゲーム全体の時間停止・雑魚の等間隔配置・
    // 効果音)はdosukoi2_game.js側(startOzekiTimeStop/updateOzekiTimeStop)が
    // 行う。召喚数は周回ごとに4→16体まで増える(旧仕様から変更なし)。
    // 前回召喚した雑魚がまだ生きている間(entity.patternState.hasLiveSummonedZako、
    // game.js側で毎フレーム更新)は新たな召喚を控える(雑魚を延々と積み増ししない
    // ための間隔調整で、以前の「無敵のオーラ」とは無関係)。
    summonAdvance: function (entity, dt) {
      entity.distanceFromCenter -= entity.speed * dt;
      clampDistance(entity);

      if (entity.patternState.hasLiveSummonedZako) {
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
        entity.patternState.pendingTimeStopSummon = Math.min(16, 4 + lap * 2);
      }
    },

    // 大関の旧仕様(無敵のオーラ)。現在は使われていないが、いつでも戻せるように
    // そのまま残してある(戻し方はhasSummonShieldのコメント参照)。横綱がHP25%
    // 以下で「大関の技を借りる」際は、大関自身の仕様変更後もこちらの旧仕様の
    // ままにしてある(横綱は無敵時間などのズルはしない、という設計を踏襲するため)。
    summonAdvanceLegacyAura: function (entity, dt) {
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

    // 十両(広告妨害): 移動そのものは序ノ口(zigzag)と同じ横揺れ直進を流用する。
    adBlock: function (entity, dt, elapsed) {
      PATTERNS.zigzag(entity, dt, elapsed);
    },

    // 関脇(半無敵サイボーグ): タップでは怯まず、時間経過で加速度的に中心へ迫る。
    // 弾き飛ばされた分の後退(distanceFromCenterの加算)はapplyCyborgKnockbackが
    // 行い、ここでは「現在の速度で前進しつつ、速度自体を加速させる」処理のみ行う。
    cyborgAdvance: function (entity, dt) {
      if (entity.patternState.velocity === undefined) {
        entity.patternState.velocity = entity.speed;
      }
      // 弾かれた際の見た目上の飛び(knockbackAnim)が再生中は、それが終わるまで
      // 通常移動・帰還スッ移動のどちらも進めない(先に飛んでいく様子を見せきる)。
      var anim = entity.patternState.knockbackAnim;
      if (anim) {
        anim.elapsed += dt;
        if (anim.elapsed >= anim.duration) { entity.patternState.knockbackAnim = null; }
        return;
      }
      // 電撃ダメージ直後は、弾かれた画面端から最初の登場位置と同じ距離まで
      // スッと戻る(角度はそのまま、distanceFromCenterを直接動かす実移動)。
      var returnGlide = entity.patternState.returnGlide;
      if (returnGlide) {
        returnGlide.elapsed += dt;
        var t = Math.min(1, returnGlide.elapsed / returnGlide.duration);
        entity.distanceFromCenter = returnGlide.fromDistance +
          (returnGlide.toDistance - returnGlide.fromDistance) * easeOutCubic(t);
        clampDistance(entity);
        if (t >= 1) { entity.patternState.returnGlide = null; }
        return;
      }
      var lap = entity.lap || 0;
      var acceleration = CYBORG_BASE_ACCELERATION + lap * CYBORG_ACCELERATION_LAP_GROWTH +
        (entity.patternState.accelerationBonus || 0);
      entity.patternState.velocity += acceleration * dt;
      entity.distanceFromCenter -= entity.patternState.velocity * dt;
      clampDistance(entity);
    },

    // 前頭(赤・青、内部key: jishaku): entity.roleが'retreating'なら固定の遅い速度で中心から
    // 離れていき(1.0で頭打ち)、'approaching'ならHPが減るほど・周回が
    // 進むほど速くなる速度で中心へ迫る。役割の入れ替えはタップ時に
    // dosukoi2_game.js側で行われ、ここでは現在の役割に従って動くだけ。
    magnetPair: function (entity, dt) {
      if (entity.role === 'retreating') {
        entity.distanceFromCenter += MAGNET_RETREAT_SPEED * dt;
        if (entity.distanceFromCenter > MAGNET_RETREAT_MAX_DISTANCE) { entity.distanceFromCenter = MAGNET_RETREAT_MAX_DISTANCE; }
        return;
      }
      var lap = entity.lap || 0;
      var hpRatio = entity.maxHp > 0 ? entity.hp / entity.maxHp : 1;
      var speed = MAGNET_APPROACH_BASE_SPEED + lap * MAGNET_APPROACH_LAP_GROWTH +
        (1 - hpRatio) * MAGNET_APPROACH_HP_SPEED_BONUS;
      entity.distanceFromCenter -= speed * dt;
      clampDistance(entity);
    },

    // 横綱: 「心・技・体」ならぬ、格下の四力士の技を全て使いこなす。
    // HPが減るごとに 序ノ口(揺れ)→幕下(ワープ)→小結(渦)→大関(召喚) の技へ
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
        // 大関の技を借りる場面では、大関自身の現行仕様(時間停止)ではなく
        // 旧仕様(無敵のオーラ)のまま据え置く(理由はhasSummonShieldのコメント参照)。
        PATTERNS.summonAdvanceLegacyAura(entity, dt, elapsed);
      }
    }
  };

  function updateBossPattern(entity, dt, elapsed) {
    var fn = PATTERNS[entity.pattern];
    if (fn) { fn(entity, dt, elapsed); }
  }

  // 関脇をタップした際に呼ぶ。ダメージは与えず、斜め左右に回り込むように
  // 弾き飛ばす(角度をランダムな向き・大きさでずらしつつ、距離も後退させる)。
  // 実際の位置(angle/distanceFromCenter)は即座に弾いた先へ進めるが、見た目は
  // knockbackAnimを介して弧を描きながら移動する様子をdosukoi2_render.js側で
  // 描く(当たり判定やゲームロジックは瞬間移動のまま扱うほうがシンプルなため)。
  function applyCyborgKnockback(entity) {
    var dir = Math.random() < 0.5 ? -1 : 1;
    var angleOffset = CYBORG_KNOCKBACK_ANGLE_MIN +
      Math.random() * (CYBORG_KNOCKBACK_ANGLE_MAX - CYBORG_KNOCKBACK_ANGLE_MIN);
    var fromAngle = entity.angle;
    var fromDistance = entity.distanceFromCenter;
    entity.angle = fromAngle + dir * angleOffset;
    entity.distanceFromCenter = fromDistance + CYBORG_KNOCKBACK_DISTANCE;
    entity.patternState.knockbackAnim = {
      fromAngle: fromAngle,
      fromDistance: fromDistance,
      toAngle: entity.angle,
      toDistance: entity.distanceFromCenter,
      elapsed: 0,
      duration: CYBORG_KNOCKBACK_ANIM_DURATION
    };
  }

  // 関脇が画面端の電流で電撃ダメージを受けるたびに呼ぶ。加速度・速度ともに
  // 初期状態にリセットし、再び遅い初速からじわじわ加速し直させる。
  function applyCyborgShockReset(entity) {
    entity.patternState.accelerationBonus = 0;
    entity.patternState.velocity = entity.speed;
  }

  // 電撃ダメージを受けた直後に呼ぶ。角度はそのまま、distanceFromCenterだけを
  // 前方へスッと進めるアニメーションを開始する(knockbackAnimの再生中は
  // cyborgAdvance側で待たされ、それが終わってから始まる)。
  // entranceDistanceは最初に登場した位置と中心からの距離(game.js側のボス
  // 登場演出の着地距離と揃える=「端」の基準)。被弾のたびに進む距離は
  // CYBORG_RETURN_GLIDE_STEPずつ深くなるが、cyborgApproachFloorRatio(lap)より
  // 内側へは進ませない(1周目は半分まで、周回を追うごとに1/3へ漸近)。
  function startCyborgReturnGlide(entity, entranceDistance) {
    var shockCount = (entity.patternState.cyborgShockCount || 0) + 1;
    entity.patternState.cyborgShockCount = shockCount;
    var lap = entity.lap || 0;
    var minApproach = entranceDistance * cyborgApproachFloorRatio(lap);
    var target = Math.max(minApproach, entranceDistance - shockCount * CYBORG_RETURN_GLIDE_STEP);
    entity.patternState.returnGlide = {
      fromDistance: entity.distanceFromCenter,
      toDistance: target,
      elapsed: 0,
      duration: CYBORG_RETURN_GLIDE_DURATION
    };
  }

  global.Dosukoi2 = global.Dosukoi2 || {};
  global.Dosukoi2.Boss = {
    RANKS: RANKS,
    RANK_INFO: RANK_INFO,
    rankAt: rankAt,
    statsFor: statsFor,
    hasSummonShield: hasSummonShield,
    updateBossPattern: updateBossPattern,
    applyCyborgKnockback: applyCyborgKnockback,
    applyCyborgShockReset: applyCyborgShockReset,
    startCyborgReturnGlide: startCyborgReturnGlide
  };
})(window);
