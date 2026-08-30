(function (global) {
  'use strict';

  var Assets = global.Dosukoi2.Assets;
  var Boss = global.Dosukoi2.Boss;
  var Entities = global.Dosukoi2.Entities;

  // 勝負俵の輪(見た目)は画面の大部分を占める大きさにする。ゲームオーバー判定
  // (Entities.DOHYO_RATIO)とは別の見た目専用の値で、難易度には影響しない。
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

  // 角度ごとに「画面矩形の外に出る距離」を計算する。円形のフィールド半径だけで
  // 出現距離を決めると、横長画面では横方向の出現位置が画面内に収まってしまうため、
  // 実際のcanvas矩形との交差距離+余白を使い、確実に画面外(不可視)から出現させる。
  function computeSpawnDistance(geometry, width, height, angle) {
    var halfW = width / 2;
    var halfH = height / 2;
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    var tHoriz = Math.abs(cos) > 1e-6 ? halfW / Math.abs(cos) : Infinity;
    var tVert = Math.abs(sin) > 1e-6 ? halfH / Math.abs(sin) : Infinity;
    var boundaryDist = Math.min(tHoriz, tVert);
    var margin = 48; // px。画面端ぎりぎりで湧かず、確実に不可視の位置から出現させる
    return (boundaryDist + margin) / geometry.fieldRadius;
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
    ctx.font = 'bold ' + Math.round(Math.min(width, height) * 0.16) + 'px ' + BRUSH_FONT_FAMILY;
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
    ctx.save();
    ctx.globalAlpha = 0.95;
    var textSize = Math.round(Math.min(width, height) * 0.15);
    var gradient = ctx.createLinearGradient(width / 2, height / 2 - textSize / 2, width / 2, height / 2 + textSize / 2);
    gradient.addColorStop(0, '#fff6d0');
    gradient.addColorStop(0.5, 'hsl(' + hue + ', 90%, 65%)');
    gradient.addColorStop(1, '#fff6d0');
    ctx.fillStyle = gradient;
    ctx.strokeStyle = '#7a4a00';
    ctx.lineWidth = 5;
    ctx.shadowColor = 'hsl(' + hue + ', 100%, 70%)';
    ctx.shadowBlur = Math.min(width, height) * 0.09;
    ctx.font = 'bold ' + textSize + 'px ' + BRUSH_FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
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

  function fallbackBoss(ctx, x, y, sizePx, rankKey) {
    var info = Boss.RANK_INFO[rankKey];
    ctx.beginPath();
    ctx.arc(x, y, sizePx / 2, 0, Math.PI * 2);
    ctx.fillStyle = info.color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#222';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(sizePx * 0.4) + 'px ' + BRUSH_FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(info.letter, x, y);
  }

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

  // 大関の無敵中(召喚した雑魚が生きている間)は虹色に光らせて分かりやすくする
  function drawInvincibleGlow(ctx, x, y, sizePx, elapsedTime) {
    var hue = (elapsedTime * 220) % 360;
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.25 * Math.sin(elapsedTime * 10);
    ctx.shadowColor = 'hsl(' + hue + ', 100%, 60%)';
    ctx.shadowBlur = sizePx * 0.6;
    ctx.lineWidth = Math.max(3, sizePx * 0.1);
    ctx.strokeStyle = 'hsl(' + hue + ', 100%, 60%)';
    ctx.beginPath();
    ctx.arc(x, y, sizePx * 0.58, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawEntity(ctx, geometry, entity, elapsedTime) {
    var pos2 = Entities.getPosition(entity);
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
      }
      var info = Boss.RANK_INFO[entity.rank];
      Assets.drawSprite(ctx, info.assetKey, pos.x, pos.y, sizePx, 0, function (c, x, y, s) {
        fallbackBoss(c, x, y, s, entity.rank);
      });
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

  function draw(ctx, width, height, game) {
    ctx.clearRect(0, 0, width, height);

    var geometry = computeFieldGeometry(width, height);
    drawDohyo(ctx, width, height, geometry);

    if (game.phase === 'BOSS_WARNING') {
      var nextRank = Boss.rankAt(game.spawner.bossIndex);
      drawWarning(ctx, width, height, game.elapsedTime, Boss.RANK_INFO[nextRank].label + '接近!!!');
    } else if (game.phase === 'BOSS_CLEAR' || game.phase === 'FINALE') {
      drawVictoryBanner(ctx, width, height, game.elapsedTime, (game.lastDefeatedRankLabel || '') + '撃破!!!');
    }

    for (var i = 0; i < game.entities.length; i++) {
      drawEntity(ctx, geometry, game.entities[i], game.elapsedTime);
    }
    drawEffects(ctx, geometry, game.effects);
  }

  global.Dosukoi2 = global.Dosukoi2 || {};
  global.Dosukoi2.Render = {
    computeFieldGeometry: computeFieldGeometry,
    computeSpawnDistance: computeSpawnDistance,
    randomEdgePoint: randomEdgePoint,
    toPixel: toPixel,
    draw: draw
  };
})(window);
