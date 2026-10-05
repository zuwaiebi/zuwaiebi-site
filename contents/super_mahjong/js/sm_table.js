// 卓の描画（各家の河・副露・抜き北・場のパワー・中央情報・自分の手牌）
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);
  const T = () => SM.Tiles;

  const WIND = ['東', '南', '西', '北'];
  const POS4 = ['bottom', 'right', 'top', 'left'];
  const POS3 = ['bottom', 'right', 'left'];

  let lastGame = null;
  let lastRoom = null;

  function posOf(game, seat) {
    const rel = (seat - game.you + game.n) % game.n;
    return (game.n === 4 ? POS4 : POS3)[rel];
  }

  // 自分から見た関係（スマホ縦画面では位置で分からないので文字で出す）。逆回り中は上家・下家が入れ替わる
  function relName(game, seat) {
    const rel = (seat - game.you + game.n) % game.n;
    if (rel === 0) return '';
    if (game.n === 4 && rel === 2) return '対面';
    const next = rel === 1;
    return next === (game.dir !== -1) ? '下家' : '上家';
  }

  // tileOpts: 牌ごとに足す表示の指定（和了画面の treat など）
  function meldEl(m, seat, n, red, size, tileOpts) {
    const wrap = document.createElement('div');
    wrap.className = `meld${m.type === 'akan' ? ' meld--akan' : ''}`;
    const tiles = m.tiles.slice();
    const opt = (t, o) => (tileOpts && t !== null ? { ...o, ...tileOpts(t) } : o);
    if (m.type === 'ankan' || m.from === null || m.from === undefined) {
      tiles.forEach((t, i) => {
        const id = m.type === 'ankan' && (i === 0 || i === 3) ? null : t;
        wrap.appendChild(T().el(id, opt(id, { red, size })));
      });
      return wrap;
    }
    // 鳴いた牌を横向きにし、鳴いた相手の方向に置く（上家=左, 対面=中, 下家=右）
    const called = m.called;
    const others = tiles.filter((t) => t !== called && t !== m.added);
    const rel = (m.from - seat + n) % n;
    let order;
    if (rel === n - 1) order = [called, ...others];
    else if (rel === 1) order = [...others, called];
    else order = [others[0], called, ...others.slice(1)];
    order.forEach((t) => {
      if (t === called) {
        const holder = document.createElement('div');
        holder.className = 'meld__called';
        holder.appendChild(T().el(t, opt(t, { red, size, sideways: true })));
        if (m.added !== null && m.added !== undefined) holder.appendChild(T().el(m.added, opt(m.added, { red, size, sideways: true })));
        wrap.appendChild(holder);
      } else if (t !== undefined) wrap.appendChild(T().el(t, opt(t, { red, size })));
    });
    return wrap;
  }

  function renderPanel(game, room, p) {
    const pos = posOf(game, p.seat);
    const panel = $(`seat-${pos}`);
    panel.hidden = false;
    const self = p.seat === game.you;
    const seatInfo = room.seats[p.seat] || {};
    const size = self ? 'river' : 'sm';

    const head = panel.querySelector('.seat__head');
    panel.classList.toggle('is-turn', game.phase === 'play' && game.turn === p.seat);
    panel.classList.toggle('is-dealer', p.dealer);
    panel.classList.toggle('is-thinking', game.waitingFor.includes(p.seat) && !self);
    head.innerHTML = '';
    if (!self) {
      const rel = document.createElement('span');
      rel.className = 'seat__rel';
      rel.textContent = relName(game, p.seat);
      head.appendChild(rel);
    }
    const wind = document.createElement('span');
    wind.className = 'seat__wind';
    wind.textContent = WIND[p.wind - 27];
    head.appendChild(wind);
    head.appendChild(SM.Icons.el(seatInfo.icon));
    const name = document.createElement('span');
    name.className = 'seat__name';
    const away = seatInfo.left ? ' [退出・CPU代打ち]' : seatInfo.connected === false ? ' [切断・CPU代打ち]' : '';
    name.textContent = `${seatInfo.name || '?'}${seatInfo.kind === 'cpu' ? '(CPU)' : ''}${away}`;
    head.appendChild(name);
    const score = document.createElement('span');
    score.className = 'seat__score';
    score.textContent = p.score;
    head.appendChild(score);
    if (p.riichi) {
      const r = document.createElement('span');
      r.className = 'seat__riichi';
      r.textContent = 'リーチ';
      head.appendChild(r);
    }
    if (game.cardsEnabled && !self) {
      const hc = document.createElement('span');
      hc.className = 'seat__cards';
      hc.textContent = `🂠${p.cards.handCount}`;
      hc.title = `手札 ${p.cards.handCount}枚`;
      head.appendChild(hc);
    }

    // 場のパワー（5スロット）
    let field = panel.querySelector('.seat__field');
    if (!field) {
      field = document.createElement('div');
      field.className = 'seat__field';
      panel.insertBefore(field, panel.querySelector('.seat__melds'));
    }
    field.innerHTML = '';
    field.hidden = !game.cardsEnabled;
    for (let i = 0; i < 5; i++) {
      const c = p.cards.field[i];
      if (c) field.appendChild(SM.Cards.el(c.cid, { size: 'tiny' }));
      else {
        const e = document.createElement('div');
        e.className = 'card card--tiny card--empty';
        field.appendChild(e);
      }
    }

    const river = panel.querySelector('.seat__river');
    river.innerHTML = '';
    p.discards.forEach((d, i) => {
      const last = game.lastDiscard && game.lastDiscard.seat === p.seat && i === p.discards.length - 1;
      const cls = [d.called ? 'is-called' : '', d.tsumogiri ? 'is-tsumogiri' : '', last ? 'is-last' : '', d.faceDown ? 'is-facedown' : ''].join(' ');
      river.appendChild(T().el(d.tile, { red: game.red, size, sideways: d.riichi, cls }));
    });

    const melds = panel.querySelector('.seat__melds');
    melds.innerHTML = '';
    if (!self) {
      const hidden = document.createElement('div');
      hidden.className = 'hidden-hand';
      if (p.hand) {
        p.hand.forEach((t) => hidden.appendChild(T().el(t, { size: 'sm', red: game.red })));
      } else {
        const shown = p.shown || [];
        shown.forEach((t) => hidden.appendChild(T().el(t, { size: 'xs', red: game.red })));
        for (let i = shown.length; i < p.handCount; i++) hidden.appendChild(T().el(null, { size: 'xs' }));
      }
      melds.appendChild(hidden);
    }
    if (p.kita.length) {
      const k = document.createElement('div');
      k.className = 'kita';
      p.kita.forEach((t) => k.appendChild(T().el(t, { size: 'sm' })));
      melds.appendChild(k);
    }
    if (!self) p.melds.forEach((m) => melds.appendChild(meldEl(m, p.seat, game.n, game.red, 'sm')));
    if (p.held) {
      const h = document.createElement('span');
      h.className = 'seat__note';
      h.textContent = `握り込み${p.held}枚`;
      melds.appendChild(h);
    }
    if (p.altCount) {
      const h = document.createElement('span');
      h.className = 'seat__note';
      h.textContent = `2つ目の手牌${p.altCount}枚`;
      melds.appendChild(h);
    }
  }

  function renderCenter(game) {
    $('center-label').textContent = game.label;
    $('center-sticks').textContent = `${game.honba}本場 / 供託${game.pot}点`;
    $('center-wall').textContent = `残り ${game.wallRemaining}枚`;
    const dora = $('center-dora');
    dora.innerHTML = '';
    for (let i = 0; i < Math.max(5, game.doraIndicators.length); i++) {
      const t = game.doraIndicators[i];
      dora.appendChild(T().el(t === undefined ? null : t, { red: game.red, size: 'sm', plain: true }));
    }
    const cards = $('center-cards');
    cards.hidden = !game.cardsEnabled;
    if (game.cardsEnabled) {
      // 山札の残り枚数は対局中は非公開（サーバーも送らない）
      cards.innerHTML = '';
      const pile = document.createElement('button');
      pile.className = 'small-button';
      pile.textContent = `捨て場 ${game.discardPile.length}枚`;
      pile.addEventListener('click', () => showPile(game));
      cards.appendChild(pile);
      if (game.dir === -1) {
        const d = document.createElement('span');
        d.textContent = '⟲ 逆回り';
        cards.appendChild(d);
      }
    }
    const eff = $('center-effects');
    eff.innerHTML = '';
    for (const e of game.effects) {
      const li = document.createElement('div');
      li.className = 'effect-chip';
      li.textContent = `${e.owner !== null && e.owner !== undefined ? `${SM.Main.seatName(e.owner)}: ` : ''}${e.name}${e.desc ? `（${e.desc}）` : ''}`;
      eff.appendChild(li);
    }
  }

  function showPile(game) {
    const box = $('pile-box');
    const body = $('pile-body');
    body.innerHTML = '';
    const list = game.discardPile.slice().reverse();
    if (!list.length) body.textContent = '捨て場にカードはありません';
    for (const cid of list) body.appendChild(SM.Cards.el(cid, { size: 'mini' }));
    box.hidden = false;
  }

  function renderHand(game) {
    const me = game.players[game.you];
    const hand = $('my-hand');
    hand.innerHTML = '';
    const input = SM.Input;
    const make = (t, extraCls) => {
      const e = T().el(t, { red: game.red, size: 'hand', cls: extraCls, mask: me.masked });
      input.decorateHandTile(e, t);
      return e;
    };
    me.hand.forEach((t) => hand.appendChild(make(t, '')));
    if (me.drawn !== null && me.drawn !== undefined) hand.appendChild(make(me.drawn, 'is-drawn'));
    if (me.heldTiles && me.heldTiles.length) {
      const h = document.createElement('div');
      h.className = 'held-tiles';
      me.heldTiles.forEach((t) => h.appendChild(T().el(t, { size: 'sm', red: game.red })));
      hand.appendChild(h);
    }

    const melds = $('my-melds');
    melds.innerHTML = '';
    me.melds.slice().reverse().forEach((m) => melds.appendChild(meldEl(m, me.seat, game.n, game.red, 'hand-sm')));

    // 二足の草鞋: 今使っていない方の手牌を、普通の手牌の下にいつも出す
    const alt = $('my-alt');
    alt.hidden = !me.altHand;
    if (me.altHand) {
      const ah = $('my-alt-hand');
      ah.innerHTML = '';
      me.altHand.forEach((t) => ah.appendChild(T().el(t, { red: game.red, size: 'hand-sm', mask: me.masked })));
      const am = $('my-alt-melds');
      am.innerHTML = '';
      (me.altMelds || []).slice().reverse().forEach((m) => am.appendChild(meldEl(m, me.seat, game.n, game.red, 'hand-sm')));
    }

    const info = $('my-info');
    const parts = [];
    if (!me.masked && me.waits && me.waits.length) parts.push(`待ち: ${me.waits.map((k) => T().kindLabel(k)).join(' ')}`);
    if (me.furiten) parts.push('<span class="furiten">フリテン</span>');
    info.innerHTML = parts.join('　');
  }

  function render(game, room) {
    lastGame = game;
    lastRoom = room;
    T().setView(game);
    const table = $('table');
    table.dataset.players = game.n;
    ['bottom', 'right', 'top', 'left'].forEach((pos) => { $(`seat-${pos}`).hidden = true; });
    game.players.forEach((p) => renderPanel(game, room, p));
    renderCenter(game);
    renderHand(game);
  }

  // 発声の吹き出し
  const SHOUT = { pon: 'ポン', chi: 'チー', minkan: 'カン', ankan: 'カン', kakan: 'カン', akan: '亜空槓' };
  function shout(game, seat, text) {
    const panel = $(`seat-${posOf(game, seat)}`);
    if (!panel) return;
    const b = document.createElement('div');
    b.className = 'shout';
    b.textContent = text;
    panel.appendChild(b);
    setTimeout(() => b.remove(), 1300);
  }

  // 効果音: 出来事ごとの音（ツモ・カードを引く音も全員分鳴らす）
  function soundOf(e) {
    switch (e.type) {
      case 'deal': return '洗牌';
      case 'draw': return 'ツモる';
      case 'discard': return '打牌';
      case 'cardDraw': return 'ドロー';
      case 'cardPlay': {
        const d = e.cid ? SM.Cards.def(e.cid) : null;
        return d && d.typeKey !== 'event' ? 'パワー使用' : 'イベント発動';
      }
      case 'happening': return 'イベント発動';
      case 'powerTrigger': return 'パワー使用';
      case 'powerDestroyed': return '破壊';
      case 'dice': return 'サイコロ';
      case 'end': return e.result && e.result.type === 'agari' ? (e.result.han >= 13 ? '役満和了' : '和了') : null;
      default: return null;
    }
  }

  function showEvents(game, events) {
    if (!game || !events) return;
    const sounds = new Set();  // 一度に届いた出来事では、同じ音は1回だけ
    for (const e of events) {
      let text = null;
      let seat = e.seat;
      if (e.type === 'riichi') text = 'リーチ';
      else if (e.type === 'call') text = SHOUT[e.call];
      else if (e.type === 'kita') text = '抜き';
      else if (e.type === 'end' && e.result.type === 'agari') { text = e.result.isTsumo ? 'ツモ' : 'ロン'; seat = e.result.winner; }
      else if (e.type === 'cardPlay') {
        const who = SM.Main.seatName(e.seat);
        SM.Cards.showPlayed(e.cid, `${who}${e.reaction ? 'の割り込み' : 'がプレイ'}`, SM.Icons.targetLine(e.seat, e.shown, e.reactTo));
      } else if (e.type === 'happening') {
        SM.Cards.showPlayed(e.cid, `${SM.Main.seatName(e.seat)}のハプニング！`);
      } else if (e.type === 'powerTrigger') {
        const d = SM.Cards.def(e.cid);
        const who = SM.Main.seatName(e.seat);
        SM.Cards.showTriggered(e.cid, e.ability ? `${who}が能力を使った` : `${who}の《${d ? d.name : 'パワー'}》が発動`);
      } else if (e.type === 'dice') {
        SM.Fx.dice(e.seat, e.values, e.label);
      } else if (e.type === 'rps') {
        SM.Fx.rps(e.a, e.b, e.ha, e.hb);
      } else if (e.type === 'compare') {
        SM.Fx.compare(e, game.red);
      }
      // 和了したら次の局が始まるまでBGMを止める
      if (e.type === 'end' && e.result && e.result.type === 'agari') SM.Audio.holdBgm(true);
      else if (e.type === 'deal') SM.Audio.holdBgm(false);
      if (text && seat !== undefined) shout(game, seat, text);
      const snd = soundOf(e);
      if (snd) sounds.add(snd);
      SM.Log.add(game, e);
    }
    for (const snd of sounds) SM.Audio.se(snd);
  }

  SM.Table = { render, showEvents, meldEl, posOf, rerender: () => lastGame && render(lastGame, lastRoom), WIND };
})();
