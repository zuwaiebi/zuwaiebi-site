// 操作: 打牌選択・行動ボタン・鳴き方の選択・カードのプレイ・持ち時間表示
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);
  const ONECLICK_KEY = 'super_mahjong_oneclick';
  const NOCALL_KEY = 'super_mahjong_nocall';

  let game = null;
  let prompt = null;       // 自分への手番・鳴きの問い合わせ
  let actions = [];
  let discardSet = new Set();
  let riichiSet = new Set();
  let riichiMode = false;
  let faceDown = false;
  let selected = null;
  let sentId = null;       // 同じ問い合わせに二重送信しない
  let deadline = null;

  const sent = () => !prompt || prompt.id === sentId;

  // 選んでいる牌を変える（スマホでは同じ牌を光らせる。手牌が？の時は光らせない）
  function select(t) {
    if (selected === t) return;
    selected = t;
    const masked = game && game.players[game.you] && game.players[game.you].masked;
    SM.Tiles.highlightSelected(masked ? null : t);
  }

  function sendAction(action) {
    if (sent()) return;
    sentId = prompt.id;
    select(null);
    riichiMode = false;
    closeChooser();
    SM.Cards.hideDetail();
    SM.Net.send({ type: 'answer', promptId: prompt.id, answer: action });
    renderButtons();
    SM.Table.rerender();
  }

  function oneClick() { return $('opt-oneclick').checked; }

  function update(g) {
    game = g;
    const p = g.prompt && (g.prompt.kind === 'turn' || g.prompt.kind === 'call') ? g.prompt : null;
    if (!p || !prompt || p.id !== prompt.id) { riichiMode = false; faceDown = false; select(null); }
    prompt = p;
    actions = p ? p.actions : [];
    const d = actions.find((a) => a.type === 'discard');
    discardSet = new Set(d ? d.tiles : []);
    const r = actions.find((a) => a.type === 'riichi');
    riichiSet = new Set(r ? r.tiles : []);
    if (!r) riichiMode = false;
    if (selected !== null && !discardSet.has(selected) && !riichiSet.has(selected)) select(null);
    deadline = p && g.timeLeft !== null && g.timeLeft !== undefined ? performance.now() + g.timeLeft : null;
    closeChooser();

    // 鳴かない設定: ロン以外の応答は自動でスキップ
    if ($('opt-nocall').checked && p && p.kind === 'call' && !sent() && !actions.some((a) => a.type === 'ron')) {
      setTimeout(() => sendAction({ type: 'pass' }), 150);
    }
    renderButtons();
    renderMyCards();
  }

  function decorateHandTile(el, t) {
    // カードの効果で手牌から選んでいる最中（選び方は sm_prompt）
    if (SM.Prompt.decorateHandPick(el, t)) return;
    const can = riichiMode ? riichiSet.has(t) : discardSet.has(t);
    if (!sent() && (discardSet.size || riichiSet.size)) el.classList.toggle('is-disabled', !can);
    if (t === selected) el.classList.add('is-selected');
    if (riichiMode && riichiSet.has(t)) el.classList.add('is-riichi-cand');
    el.addEventListener('click', () => onTileClick(t));
    el.addEventListener('mouseenter', () => showRiichiWaits(t));
    el.addEventListener('mouseleave', () => showRiichiWaits(null));
  }

  function showRiichiWaits(t) {
    const box = $('riichi-waits');
    if (!riichiMode || t === null || !game || !game.riichiWaits) { box.textContent = ''; return; }
    const w = game.riichiWaits[t];
    box.textContent = w ? `この牌を切ると待ち: ${w.map((k) => SM.Tiles.kindLabel(k)).join(' ')}` : '';
  }

  function onTileClick(t) {
    if (sent()) return;
    const set = riichiMode ? riichiSet : discardSet;
    if (!set.has(t)) return;
    if (oneClick() || selected === t) {
      sendAction({ type: riichiMode ? 'riichi' : 'discard', tile: t, faceDown });
      return;
    }
    select(t);
    SM.Table.rerender();
    showRiichiWaits(t);
  }

  function button(label, cls, onClick) {
    const b = document.createElement('button');
    b.className = `action-button ${cls || ''}`;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function chooser(title, rows, onPick) {
    const box = $('chooser');
    box.innerHTML = '';
    const h = document.createElement('div');
    h.className = 'chooser__title';
    h.textContent = title;
    box.appendChild(h);
    rows.forEach((row, i) => {
      const b = document.createElement('button');
      b.className = 'chooser__item';
      if (row.label) b.append(row.label);
      (row.tiles || []).forEach((t) => b.appendChild(SM.Tiles.el(t, { red: game.red, size: 'sm' })));
      b.addEventListener('click', () => onPick(i));
      box.appendChild(b);
    });
    box.appendChild(button('やめる', 'is-sub', closeChooser));
    box.hidden = false;
  }
  function closeChooser() { const b = $('chooser'); if (b) b.hidden = true; }

  const kindTile = (k) => k * 4 + 1;

  function renderButtons() {
    const box = $('actions');
    // 鳴き・和了・リーチ・スキップは自分の領域の上にはみ出して出す
    const top = $('call-actions');
    box.innerHTML = '';
    top.innerHTML = '';
    const hint = $('action-hint');
    hint.textContent = '';
    if (sent() || !game) return;
    const has = (type) => actions.filter((a) => a.type === type);
    const tile = prompt.tile;
    const name = (s) => SM.Main.seatName(s);

    if (has('tsumo').length) top.appendChild(button('ツモ', 'is-win', () => sendAction({ type: 'tsumo' })));
    if (has('ron').length) top.appendChild(button('ロン', 'is-win', () => sendAction({ type: 'ron' })));
    if (has('riichi').length) {
      top.appendChild(button(riichiMode ? 'リーチ取消' : 'リーチ', 'is-riichi', () => {
        riichiMode = !riichiMode;
        select(null);
        renderButtons();
        SM.Table.rerender();
      }));
    }
    const pon = has('pon')[0];
    if (pon) {
      top.appendChild(button('ポン', '', () => {
        if (pon.options.length === 1) sendAction({ type: 'pon', option: 0 });
        else chooser('どの牌でポンしますか', pon.options.map((o) => ({ tiles: [...o, tile] })), (i) => sendAction({ type: 'pon', option: i }));
      }));
    }
    const chi = has('chi')[0];
    if (chi) {
      top.appendChild(button('チー', '', () => {
        if (chi.options.length === 1) sendAction({ type: 'chi', option: 0 });
        else chooser('どの形でチーしますか', chi.options.map((o) => ({ tiles: [...o, tile] })), (i) => sendAction({ type: 'chi', option: i }));
      }));
    }
    if (has('minkan').length) top.appendChild(button('カン', '', () => sendAction({ type: 'minkan' })));
    if (has('akan').length) top.appendChild(button('亜空槓', '', () => sendAction({ type: 'akan' })));
    const kans = [...has('ankan'), ...has('kakan')];
    if (kans.length) {
      top.appendChild(button('カン', '', () => {
        if (kans.length === 1) sendAction({ ...kans[0] });
        else {
          chooser('どの牌でカンしますか', kans.map((k) => ({ tiles: [kindTile(k.kind)], label: k.target !== undefined ? `${name(k.target)}のポンに` : '' })), (i) => sendAction({ ...kans[i] }));
        }
      }));
    }
    const kitas = has('kita');
    if (kitas.length) {
      top.appendChild(button('抜き', '', () => {
        if (kitas.length === 1) sendAction({ ...kitas[0] });
        else chooser('どの牌を抜きますか', kitas.map((k) => ({ tiles: [kindTile(k.kind)] })), (i) => sendAction({ ...kitas[i] }));
      }));
    }
    if (has('kyuushu').length) box.appendChild(button('九種九牌', '', () => sendAction({ type: 'kyuushu' })));
    // フルパワーはボタンではなく、手札の横のフルパワーの画像を押してプレイする（renderMyCards）
    for (const a of has('ability')) box.appendChild(button(a.label, 'is-ability', () => sendAction({ type: 'ability', iid: a.iid })));
    if (has('endTurn').length) box.appendChild(button('手番を終える', 'is-sub', () => sendAction({ type: 'endTurn' })));
    const d = has('discard')[0];
    if (d && d.faceDown) {
      box.appendChild(button(faceDown ? '裏向き: ON' : '裏向き: OFF', 'is-sub', () => { faceDown = !faceDown; renderButtons(); }));
    }
    if (has('pass').length) top.appendChild(button('スキップ', 'is-sub', () => sendAction({ type: 'pass' })));

    if (riichiMode) hint.textContent = 'リーチ宣言牌を選んでください';
    else if (prompt.kind === 'call') hint.textContent = `${SM.Tiles.label(tile, game.red)} に対して`;
    else if (discardSet.size && !actions.some((a) => a.type === 'tsumo')) hint.textContent = oneClick() ? '切る牌をクリック' : '切る牌を選んでもう一度タップ';
  }

  function renderMyCards() {
    const box = $('my-cards');
    if (!box || !game) return;
    box.innerHTML = '';
    box.hidden = !game.cardsEnabled;
    if (!game.cardsEnabled) return;
    const playable = new Set();
    const cardAct = actions.find((a) => a.type === 'card');
    if (cardAct && !sent()) for (const iid of cardAct.iids) playable.add(iid);
    const label = document.createElement('div');
    label.className = 'my-cards__label';
    label.textContent = `手札 ${game.myCards.length}/5`;
    box.appendChild(label);
    for (const c of game.myCards) {
      const can = playable.has(c.iid);
      const e = SM.Cards.el(c.cid, {
        size: 'mini',
        cls: can ? 'is-playable' : '',
        onClick: () => SM.Cards.showDetail(c.cid, can ? { actions: [{ label: 'このカードをプレイする', onClick: () => sendAction({ type: 'card', iid: c.iid }) }] } : {}),
      });
      box.appendChild(e);
    }
    const me = game.players[game.you];
    if (me.fp) {
      // 他のカードと同じく、画像を押して詳しく見てからプレイする
      const canFp = !sent() && actions.some((a) => a.type === 'fullPower');
      const wrap = document.createElement('div');
      wrap.className = 'my-cards__fp';
      const cap = document.createElement('div');
      cap.className = 'my-cards__label';
      cap.textContent = me.fp.playable ? 'フルパワー（使える）' : (me.fp.cooldown ? `フルパワー（あと${me.fp.cooldown}ツモ番）` : 'フルパワー');
      wrap.appendChild(cap);
      wrap.appendChild(SM.Cards.el(me.fp.cid, {
        size: 'mini',
        cls: canFp ? 'is-playable' : me.fp.playable ? '' : 'is-dim',
        onClick: () => SM.Cards.showDetail(me.fp.cid, canFp ? { actions: [{ label: 'このフルパワーをプレイする', onClick: () => sendAction({ type: 'fullPower' }) }] } : {}),
      }));
      box.appendChild(wrap);
    }
  }

  function tickTimer() {
    const el = $('my-timer');
    if (deadline === null || sent()) { el.textContent = ''; return; }
    const sec = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
    el.textContent = `残り ${sec}秒`;
    el.classList.toggle('is-urgent', sec <= 5);
  }

  function init() {
    const st = SM.Net.store;
    $('opt-oneclick').checked = st.get(ONECLICK_KEY) === '1' || (st.get(ONECLICK_KEY) === null && matchMedia('(pointer: fine)').matches);
    $('opt-nocall').checked = st.get(NOCALL_KEY) === '1';
    $('opt-oneclick').addEventListener('change', (e) => { st.set(ONECLICK_KEY, e.target.checked ? '1' : '0'); renderButtons(); });
    $('opt-nocall').addEventListener('change', (e) => st.set(NOCALL_KEY, e.target.checked ? '1' : '0'));
    setInterval(tickTimer, 250);
  }

  // サーバーが行動を拒否したら選び直せるようにする
  function onRejected() {
    if (!game) return;
    sentId = null;
    renderButtons();
    SM.Table.rerender();
  }

  SM.Input = { init, update, decorateHandTile, onRejected, oneClick };
})();
