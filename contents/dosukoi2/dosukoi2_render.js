(function (global) {
  'use strict';

  var Assets = global.Dosukoi2.Assets;
  var Boss = global.Dosukoi2.Boss;
  var Entities = global.Dosukoi2.Entities;

  // 勝負俵の輪(見た目)は画面の大部分を占める大きさにする。ゲームオーバー判定
  // (敵が完全に中心distanceFromCenter<=0へ到達したか)とは別の見た目専用の値で、
  // 難易度には影響しない。
  var DOHYO_VISUAL_RATIO = 0.85;

  function computeFieldGeometry(width, height) {
    var margin = 0.92;
    var fieldRadius = Math.min(width, height) / 2 * margin;
    return {
      centerX: width / 2,
      centerY: height / 2,
      fieldRadius: fieldRadius,
      dohyoRadius: fieldRadius * DOHYO_VISUAL_RATIO
    };
  }

  // 指定した角度の光線が、canvas矩形(画面端)と交差するまでの距離(px)を返す。
  function computeBoundaryDistance(width, height, angle) {
    var halfW = width / 2;
    var halfH = height / 2;
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    var tHoriz = Math.abs(cos) > 1e-6 ? halfW / Math.abs(cos) : Infinity;
    var tVert = Math.abs(sin) > 1e-6 ? halfH / Math.abs(sin) : Infinity;
    return Math.min(tHoriz, tVert);
  }

  // 角度ごとに「画面矩形の外に出る距離」を計算する。円形のフィールド半径だけで
  // 出現距離を決めると、横長画面では横方向の出現位置が画面内に収まってしまうため、
  // 実際のcanvas矩形との交差距離+余白を使い、確実に画面外(不可視)から出現させる。
  function computeSpawnDistance(geometry, width, height, angle) {
    var margin = 48; // px。画面端ぎりぎりで湧かず、確実に不可視の位置から出現させる
    return (computeBoundaryDistance(width, height, angle) + margin) / geometry.fieldRadius;
  }

  // 関脇(半無敵サイボーグ)を弾き飛ばした先が、画面端(電流が流れる境界)に
  // 到達したかどうかの判定に使う。出現用の余白を含まない、純粋な境界距離。
  function computeEdgeDistance(geometry, width, height, angle) {
    return computeBoundaryDistance(width, height, angle) / geometry.fieldRadius;
  }

  var EDGE_MARGIN = 48;

  // 指定した辺(left/right/top/bottom)上のランダムな位置で、画面外にあたる点を
  // 正規化座標(nx, ny。フィールド半径基準)で返す。行司の出現/退出地点に使う。
  function randomEdgePoint(geometry, width, height, side) {
    var halfW = width / 2;
    var halfH = height / 2;
    var x, y;
    if (side === 'left') {
      x = -halfW - EDGE_MARGIN;
      y = (Math.random() - 0.5) * height;
    } else if (side === 'right') {
      x = halfW + EDGE_MARGIN;
      y = (Math.random() - 0.5) * height;
    } else if (side === 'top') {
      y = -halfH - EDGE_MARGIN;
      x = (Math.random() - 0.5) * width;
    } else {
      y = halfH + EDGE_MARGIN;
      x = (Math.random() - 0.5) * width;
    }
    return { nx: x / geometry.fieldRadius, ny: y / geometry.fieldRadius };
  }

  function toPixel(geometry, nx, ny) {
    return {
      x: geometry.centerX + nx * geometry.fieldRadius,
      y: geometry.centerY + ny * geometry.fieldRadius
    };
  }

  // 勝負俵の輪は、個々の俵の粒々(ブツブツ)ではなく単純な1本の線として表現する。
  function drawDohyoRing(ctx, geometry) {
    ctx.save();
    ctx.strokeStyle = '#7a4a1e';
    ctx.lineWidth = Math.max(4, geometry.dohyoRadius * 0.035);
    ctx.beginPath();
    ctx.arc(geometry.centerX, geometry.centerY, geometry.dohyoRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 仕切り線: 土俵中央に引かれる2本の白線。縦向きの線を左右に並べる。
  // 輪の大きさに関わらず中央付近に収める。
  function drawShikiriSen(ctx, geometry) {
    var halfLength = geometry.fieldRadius * 0.12;
    var offset = geometry.fieldRadius * 0.05;
    ctx.save();
    ctx.strokeStyle = '#f5f5f5';
    ctx.lineWidth = Math.max(2, geometry.fieldRadius * 0.015);
    ctx.lineCap = 'round';
    [-1, 1].forEach(function (dir) {
      ctx.beginPath();
      ctx.moveTo(geometry.centerX + dir * offset, geometry.centerY - halfLength);
      ctx.lineTo(geometry.centerX + dir * offset, geometry.centerY + halfLength);
      ctx.stroke();
    });
    ctx.restore();
  }

  // 土俵(背景)は画面いっぱいの粘土色を敷いた上に、円形の勝負俵の輪と
  // 中央の仕切り線を描く。粘土色は画面全体を覆うだけの単純な矩形塗りなので、
  // どんな画面比率でも破綻しない。
  function drawDohyo(ctx, width, height, geometry) {
    ctx.fillStyle = '#c8a165';
    ctx.fillRect(0, 0, width, height);
    drawDohyoRing(ctx, geometry);
    drawShikiriSen(ctx, geometry);
  }

  // canvas上のテキストに使う毛筆風フォント(dosukoi2.htmlでGoogle Fontsから読み込み)
  var BRUSH_FONT_FAMILY = '"Yuji Syuku", sans-serif';

  // 中央に大きく表示する系のテキストが、正方形画面の幅に収まりきらず
  // 見切れてしまうことがないよう、必要ならフォントサイズを縮小してから
  // ctx.fontに反映する。戻り値は最終的に使われたフォントサイズ(px)。
  function fitBannerFontSize(ctx, text, maxWidth, baseFontSizePx) {
    var fontSizePx = baseFontSizePx;
    ctx.font = 'bold ' + fontSizePx + 'px ' + BRUSH_FONT_FAMILY;
    var measured = ctx.measureText(text).width;
    if (measured > maxWidth) {
      fontSizePx = Math.floor(fontSizePx * maxWidth / measured);
      ctx.font = 'bold ' + fontSizePx + 'px ' + BRUSH_FONT_FAMILY;
    }
    return fontSizePx;
  }

  // ボス出現前の警告演出。敵キャラより先(下のレイヤー)に描画することで、
  // 残っている雑魚が見えにくくならないようにする。
  function drawWarning(ctx, width, height, elapsedTime, label) {
    var pulse = 0.28 + 0.22 * Math.sin(elapsedTime * 8);
    ctx.save();
    ctx.globalAlpha = Math.max(0, pulse);
    ctx.fillStyle = '#c81e1e';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#7a0d0d';
    ctx.lineWidth = 4;
    fitBannerFontSize(ctx, label, width * 0.9, Math.round(Math.min(width, height) * 0.16));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(label, width / 2, height / 2);
    ctx.fillText(label, width / 2, height / 2);
    ctx.restore();
  }

  // ゲーム開始演出(「はっけよぉい…」「のこった！」)用。ボス警告のような
  // 赤い点滅はせず、文字だけを中央に静かに表示する。
  function drawCeremonyBanner(ctx, width, height, label) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#3a2a10';
    ctx.lineWidth = 4;
    fitBannerFontSize(ctx, label, width * 0.9, Math.round(Math.min(width, height) * 0.13));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(label, width / 2, height / 2);
    ctx.fillText(label, width / 2, height / 2);
    ctx.restore();
  }

  // ボス撃破時の演出。WARNINGと同様に画面中央へ大きく表示するが、
  // 警戒色の赤ではなく、色相を回しながら光らせる煌びやかな見た目にする。
  function drawVictoryBanner(ctx, width, height, elapsedTime, label) {
    var pulse = 0.16 + 0.10 * Math.sin(elapsedTime * 6);
    ctx.save();
    ctx.globalAlpha = Math.max(0, pulse);
    ctx.fillStyle = '#ffd76a';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    var hue = (elapsedTime * 90) % 360;
    var textSize = fitBannerFontSize(ctx, label, width * 0.9, Math.round(Math.min(width, height) * 0.15));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // iOS Safariは「グラデーションのfillStyle」と「shadowBlur」を同時に
    // テキストへ適用すると、文字の下に格子状の壊れた模様が出る既知の不具合が
    // あるため、光彩(shadow)は単色fillStyleのみの1回目の描画で作り、
    // グラデーションで塗る本番の文字はshadowを外した2回目の描画で重ねる
    // (見た目はほぼ変わらないまま、両者が同時に適用される場面を無くす)。
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'hsl(' + hue + ', 100%, 70%)';
    ctx.shadowColor = 'hsl(' + hue + ', 100%, 70%)';
    ctx.shadowBlur = Math.min(width, height) * 0.09;
    ctx.fillText(label, width / 2, height / 2);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.95;
    var gradient = ctx.createLinearGradient(width / 2, height / 2 - textSize / 2, width / 2, height / 2 + textSize / 2);
    gradient.addColorStop(0, '#fff6d0');
    gradient.addColorStop(0.5, 'hsl(' + hue + ', 90%, 65%)');
    gradient.addColorStop(1, '#fff6d0');
    ctx.fillStyle = gradient;
    ctx.strokeStyle = '#7a4a00';
    ctx.lineWidth = 5;
    ctx.strokeText(label, width / 2, height / 2);
    ctx.fillText(label, width / 2, height / 2);
    ctx.restore();
  }

  function fallbackZako(ctx, x, y, sizePx) {
    ctx.beginPath();
    ctx.arc(x, y, sizePx / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#6f7ef7';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2f3a9e';
    ctx.stroke();
  }

  function fallbackBossShape(ctx, x, y, sizePx, color, letter) {
    ctx.beginPath();
    ctx.arc(x, y, sizePx / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#222';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(sizePx * 0.4) + 'px ' + BRUSH_FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x, y);
  }

  function fallbackBoss(ctx, x, y, sizePx, rankKey) {
    var info = Boss.RANK_INFO[rankKey];
    fallbackBossShape(ctx, x, y, sizePx, info.color, info.letter);
  }

  // 前頭(赤・青、内部key: jishaku)の色分け。同じrankでも、どちらの個体かで色・文字を変える。
  var MAGNET_COLORS = { red: '#e5484d', blue: '#3b6fe0' };
  var MAGNET_LETTERS = { red: '赤', blue: '青' };

  function fallbackGyoji(ctx, x, y, sizePx) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.rect(-sizePx / 2, -sizePx / 2, sizePx, sizePx);
    ctx.fillStyle = '#3a2a52';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#1a1128';
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(sizePx * 0.4) + 'px ' + BRUSH_FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('行', x, y);
  }

  // 無敵中(召喚した雑魚が生きている間)の横綱(HP25%以下、大関の技を借用中)を
  // 虹色に光らせて分かりやすくする。関脇(半無敵サイボーグ)は常時、同じ演出を
  // 銀色固定(fixedColor指定)で纏う。大関自身はもうこの無敵オーラを使わない
  // (代わりに召喚の瞬間だけ画面全体を灰色にする。drawTimeStopOverlay参照)。
  function drawInvincibleGlow(ctx, x, y, sizePx, elapsedTime, fixedColor) {
    var color = fixedColor || ('hsl(' + ((elapsedTime * 220) % 360) + ', 100%, 60%)');
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.25 * Math.sin(elapsedTime * 10);
    ctx.shadowColor = color;
    ctx.shadowBlur = sizePx * 0.6;
    ctx.lineWidth = Math.max(3, sizePx * 0.1);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, sizePx * 0.58, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // シェーダーでよく使われる簡易ハッシュ。同じseedには常に同じ値を返す
  // (0〜1)ので、「その一瞬のギザギザ形状」を毎フレーム安定して再現しつつ、
  // seedを変えるだけで別の形状に切り替えられる(=パチパチ弾ける明滅表現に使う)。
  function pseudoRandom(seed) {
    var x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  var LIGHTNING_SEGMENTS_PER_EDGE = 9;
  var LIGHTNING_JITTER_PX = 24;
  var LIGHTNING_FLICKER_INTERVAL = 0.055; // これより短い間隔で形状を切り替える(パチパチ感)

  // 画面四辺に沿ってギザギザに歪んだ閉路を作る。四隅そのものは動かさず、
  // 各辺の途中だけを法線方向にランダムへずらすことで、雷のような
  // 稲妻状の輪郭にする。
  function buildElectricBorderPoints(width, height, flickerSeed) {
    var margin = 3;
    var corners = [
      { x: margin, y: margin },
      { x: width - margin, y: margin },
      { x: width - margin, y: height - margin },
      { x: margin, y: height - margin }
    ];
    var pts = [];
    var idx = 0;
    for (var edge = 0; edge < 4; edge++) {
      var a = corners[edge];
      var b = corners[(edge + 1) % 4];
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len;
      var ny = dx / len;
      for (var s = 0; s < LIGHTNING_SEGMENTS_PER_EDGE; s++) {
        var t = s / LIGHTNING_SEGMENTS_PER_EDGE;
        // 角そのものはジッターさせず、辺の中央に近いほど大きく歪ませる
        var edgeFactor = Math.sin(t * Math.PI);
        var jitter = (pseudoRandom(idx * 3.71 + flickerSeed * 91.3) - 0.5) * 2 * LIGHTNING_JITTER_PX * edgeFactor;
        pts.push({
          x: a.x + dx * t + nx * jitter,
          y: a.y + dy * t + ny * jitter
        });
        idx++;
      }
    }
    return pts;
  }

  function strokeClosedPath(ctx, pts) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      if (i === 0) { ctx.moveTo(pts[i].x, pts[i].y); } else { ctx.lineTo(pts[i].x, pts[i].y); }
    }
    ctx.closePath();
    ctx.stroke();
  }

  // 関脇戦中、画面端の四辺に流れる電流の演出。稲妻のようにギザギザに歪んだ
  // 輪郭を短い間隔で切り替えることでパチパチと弾ける明滅感を出し、外側に淡い
  // 発光、内側に白い芯を重ねることで実際の電流・放電のような見た目にする。
  // さらに数本の短いスパーク(枝分かれ)をランダムな位置に添える。
  // 弾き飛ばされた関脇がここまで届くとダメージが入る。
  function drawElectricBorder(ctx, width, height, elapsedTime) {
    var flickerSeed = Math.floor(elapsedTime / LIGHTNING_FLICKER_INTERVAL);
    var pts = buildElectricBorderPoints(width, height, flickerSeed);
    var flicker = 0.65 + 0.35 * pseudoRandom(flickerSeed * 1.7);

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 外側の淡い発光(ぼかし)
    ctx.globalAlpha = flicker * 0.6;
    ctx.strokeStyle = '#7fe0ff';
    ctx.shadowColor = '#7fe0ff';
    ctx.shadowBlur = 22;
    ctx.lineWidth = 7;
    strokeClosedPath(ctx, pts);

    // 内側の白い芯
    ctx.globalAlpha = flicker;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    strokeClosedPath(ctx, pts);

    // 輪郭からランダムに飛び出す短いスパーク(枝分かれ)
    ctx.strokeStyle = '#dff6ff';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 1.5;
    var branchCount = 3 + Math.floor(pseudoRandom(flickerSeed * 5.3) * 3);
    for (var b = 0; b < branchCount; b++) {
      var base = pts[Math.floor(pseudoRandom(flickerSeed + b * 13.1) * pts.length)];
      var angle = pseudoRandom(flickerSeed + b * 27.7) * Math.PI * 2;
      var sparkLen = 8 + pseudoRandom(flickerSeed + b * 41.9) * 14;
      ctx.globalAlpha = flicker * (0.5 + 0.5 * pseudoRandom(flickerSeed + b * 8.2));
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(base.x + Math.cos(angle) * sparkLen, base.y + Math.sin(angle) * sparkLen);
      ctx.stroke();
    }

    ctx.restore();
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // 関脇が弾き飛ばされた際、当たり判定上は即座に着地点へ移すが、見た目は
  // knockbackAnimを使って弧を描きながら移動する様子を見せる(描画専用の位置)。
  function getVisualPosition(entity) {
    var anim = entity.patternState && entity.patternState.knockbackAnim;
    if (!anim) { return Entities.getPosition(entity); }
    var t = Math.min(1, anim.elapsed / anim.duration);
    var eased = easeOutCubic(t);
    var angle = anim.fromAngle + (anim.toAngle - anim.fromAngle) * eased;
    var distance = anim.fromDistance + (anim.toDistance - anim.fromDistance) * eased;
    return { nx: Math.cos(angle) * distance, ny: Math.sin(angle) * distance };
  }

  function drawEntity(ctx, geometry, entity, elapsedTime) {
    var pos2 = getVisualPosition(entity);
    var pos = toPixel(geometry, pos2.nx, pos2.ny);
    var sizePx = entity.size * geometry.fieldRadius;

    if (entity.kind === 'zako') {
      // 大関(の技を借りた横綱含む)が召喚した雑魚は専用スプライトで見分けられるようにする
      var spriteKey = entity.summonedBy ? 'oozekiZako' : 'zako';
      Assets.drawSprite(ctx, spriteKey, pos.x, pos.y, sizePx, 0, fallbackZako);
    } else if (entity.kind === 'gyoji') {
      Assets.drawSprite(ctx, 'gyoji', pos.x, pos.y, sizePx, 0, fallbackGyoji);
    } else {
      if (entity.invincible) {
        drawInvincibleGlow(ctx, pos.x, pos.y, sizePx, elapsedTime);
      } else if (entity.rank === 'sekiwake') {
        drawInvincibleGlow(ctx, pos.x, pos.y, sizePx, elapsedTime, '#c7d2db');
      }
      if (entity.rank === 'jishaku') {
        var variant = entity.magnetVariant;
        var assetKey = variant === 'red' ? 'bossJishakuRed' : 'bossJishakuBlue';
        Assets.drawSprite(ctx, assetKey, pos.x, pos.y, sizePx, 0, function (c, x, y, s) {
          fallbackBossShape(c, x, y, s, MAGNET_COLORS[variant], MAGNET_LETTERS[variant]);
        });
      } else {
        var info = Boss.RANK_INFO[entity.rank];
        Assets.drawSprite(ctx, info.assetKey, pos.x, pos.y, sizePx, 0, function (c, x, y, s) {
          fallbackBoss(c, x, y, s, entity.rank);
        });
      }
    }
  }

  // 忍者ワープの「ドロン」演出用の煙玉。複数の円を重ねてもくもくと広がって消える見た目にする。
  var SMOKE_PUFF_OFFSETS = [
    { dx: 0, dy: 0, scale: 1.0 },
    { dx: 0.5, dy: -0.3, scale: 0.7 },
    { dx: -0.5, dy: -0.25, scale: 0.65 },
    { dx: 0.25, dy: 0.45, scale: 0.6 },
    { dx: -0.3, dy: 0.4, scale: 0.55 }
  ];

  function drawSmokeEffect(ctx, geometry, fx, t) {
    var pos = toPixel(geometry, fx.nx, fx.ny);
    var baseRadius = (0.06 + t * 0.10) * geometry.fieldRadius;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.8;
    ctx.fillStyle = '#e4e4e4';
    for (var i = 0; i < SMOKE_PUFF_OFFSETS.length; i++) {
      var o = SMOKE_PUFF_OFFSETS[i];
      ctx.beginPath();
      ctx.arc(
        pos.x + o.dx * baseRadius,
        pos.y + o.dy * baseRadius,
        baseRadius * o.scale,
        0, Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHitRingEffect(ctx, geometry, fx, t) {
    var pos = toPixel(geometry, fx.nx, fx.ny);
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, (0.05 + t * 0.08) * geometry.fieldRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffe082';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }

  function drawEffects(ctx, geometry, effects) {
    for (var i = 0; i < effects.length; i++) {
      var fx = effects[i];
      var t = 1 - (fx.ttl / fx.maxTtl);
      if (fx.kind === 'smoke') {
        drawSmokeEffect(ctx, geometry, fx, t);
      } else {
        drawHitRingEffect(ctx, geometry, fx, t);
      }
    }
  }

  // 大関の時間停止中、画面全体に薄い灰色を重ねる。drawWarningの赤い点滅とは
  // 異なり、雑魚が1体ずつ配置されていく様子が見えるよう、敵の描画より後に
  // (=敵の上から)半透明で重ねることで「止まった世界がうっすら灰色がかる」
  // 見た目にする(完全に覆い隠さない)。
  var TIME_STOP_OVERLAY_ALPHA = 0.55;
  var TIME_STOP_OVERLAY_COLOR = '#8a8f98';

  function drawTimeStopOverlay(ctx, width, height) {
    ctx.save();
    ctx.globalAlpha = TIME_STOP_OVERLAY_ALPHA;
    ctx.fillStyle = TIME_STOP_OVERLAY_COLOR;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  function draw(ctx, width, height, game) {
    ctx.clearRect(0, 0, width, height);

    var geometry = computeFieldGeometry(width, height);
    drawDohyo(ctx, width, height, geometry);

    if (game.phase === 'START_HAKKEYOI') {
      drawCeremonyBanner(ctx, width, height, 'はっけよぉい…');
    } else if (game.introBannerText) {
      drawCeremonyBanner(ctx, width, height, game.introBannerText);
    } else if (game.phase === 'BOSS_WARNING') {
      var nextRank = Boss.rankAt(game.spawner.bossIndex);
      drawWarning(ctx, width, height, game.elapsedTime, Boss.RANK_INFO[nextRank].label + '接近!!!');
    } else if (game.phase === 'BOSS_CLEAR' || game.phase === 'FINALE') {
      drawVictoryBanner(ctx, width, height, game.elapsedTime, (game.lastDefeatedRankLabel || '') + '撃破!!!');
    }

    for (var i = 0; i < game.entities.length; i++) {
      drawEntity(ctx, geometry, game.entities[i], game.elapsedTime);
    }
    drawEffects(ctx, geometry, game.effects);

    if (game.timeStop) {
      drawTimeStopOverlay(ctx, width, height);
    }

    if (game.currentBoss && game.currentBoss.rank === 'sekiwake' &&
      (game.phase === 'BOSS_INTRO' || game.phase === 'BOSS')) {
      drawElectricBorder(ctx, width, height, game.elapsedTime);
    }
  }

  global.Dosukoi2 = global.Dosukoi2 || {};
  global.Dosukoi2.Render = {
    computeFieldGeometry: computeFieldGeometry,
    computeSpawnDistance: computeSpawnDistance,
    computeEdgeDistance: computeEdgeDistance,
    randomEdgePoint: randomEdgePoint,
    toPixel: toPixel,
    draw: draw
  };
})(window);
