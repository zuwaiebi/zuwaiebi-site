// モンティホール問題の盤: 裏向きのカード3枚を全員に見せ、仕掛けられた人だけが選べる。
// 表向きにする時は、その場でカードを回転させてめくる（サーバーの game.monty と、選ぶ人への monty の問い合わせ）
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);
  const LABELS = ['左', '真ん中', '右'];

  let boardId = null;   // 表示中の盤（プレイされたカードの番号）
  let slots = [];       // [{ slot, card, front, cap, cid }]
  let titleEl = null;
  let timerEl = null;
  let prompt = null;    // 自分が選ぶ問い合わせ（選ぶ人だけ）
  let deadline = null;
  let localPick = null; // 押したカード（サーバーから選んだ結果が届くまで光らせておく）

  function cardFace(cid) {
    const face = document.createElement('div');
    face.className = `monty__face monty__face--${cid ? 'front' : 'back'}`;
    face.appendChild(SM.Cards.el(cid, { size: 'mini', detail: false }));
    return face;
  }

  function build(m) {
    const box = $('monty');
    box.innerHTML = '';
    boardId = m.id;
    const inner = document.createElement('div');
    inner.className = 'monty__box';
    const src = document.createElement('div');
    src.className = 'prompt__source is-clickable';
    const def = (window.SM_CARDS || []).find((c) => c.name === 'モンティホール問題');
    src.textContent = '《モンティホール問題》';
    if (def) src.addEventListener('click', () => SM.Cards.showDetail(def.id));
    inner.appendChild(src);
    titleEl = document.createElement('div');
    titleEl.className = 'monty__title';
    inner.appendChild(titleEl);
    const row = document.createElement('div');
    row.className = 'monty__row';
    slots = [0, 1, 2].map((i) => {
      const slot = document.createElement('div');
      slot.className = 'monty__slot';
      const card = document.createElement('div');
      card.className = 'monty__card';
      card.appendChild(cardFace(null));
      slot.appendChild(card);
      const cap = document.createElement('div');
      cap.className = 'monty__cap';
      cap.textContent = LABELS[i];
      slot.appendChild(cap);
      slot.addEventListener('click', () => pick(i));
      row.appendChild(slot);
      return { slot, card, front: null, cap, cid: null };
    });
    inner.appendChild(row);
    timerEl = document.createElement('div');
    timerEl.className = 'prompt__timer';
    inner.appendChild(timerEl);
    box.appendChild(inner);
    box.hidden = false;
  }

  /** めくる（初めて表示した時は回転させずに表向きで出す） */
  function setFace(i, cid, animate) {
    const s = slots[i];
    if (!cid || s.cid === cid) return;
    s.cid = cid;
    if (s.front) s.front.remove();
    s.front = cardFace(cid);
    s.card.appendChild(s.front);
    if (!animate) s.card.classList.add('no-anim');
    // 表の面を置いてから回す（同じフレームだと回転が始まらないことがある）
    requestAnimationFrame(() => {
      s.card.classList.add('is-flipped');
      if (!animate) requestAnimationFrame(() => s.card.classList.remove('no-anim'));
    });
  }

  function pick(i) {
    if (!prompt) return;
    const it = (prompt.items || [])[i];
    if (!it || it.disabled) return;
    const p = prompt;
    prompt = null;
    localPick = i;
    SM.Prompt.sendAnswer(p, { pick: [i] });
    render(lastGame);
  }

  let lastGame = null;
  function render(game) {
    const m = game && game.monty;
    if (!m) return;
    const mine = prompt;
    const picked = localPick !== null ? localPick : m.picked;
    titleEl.textContent = mine ? mine.title : m.text;
    slots.forEach((s, i) => {
      const it = mine && mine.items ? mine.items[i] : null;
      s.slot.classList.toggle('is-pickable', Boolean(it && !it.disabled));
      // めくった《ヤギ》は選べないので灰色（2回目の選択の時）
      s.slot.classList.toggle('is-disabled', Boolean(m.flipped.includes(i) && picked !== i));
      s.slot.classList.toggle('is-picked', picked === i);
      s.cap.textContent = it && it.caption ? it.caption : LABELS[i] + (picked === i ? '（選択中）' : '');
    });
  }

  /** 卓の情報を受け取るたびに呼ぶ */
  function update(game) {
    lastGame = game;
    const m = game && game.monty;
    const box = $('monty');
    if (!m) {
      if (!box.hidden) { box.hidden = true; box.innerHTML = ''; }
      boardId = null;
      prompt = null;
      deadline = null;
      return;
    }
    const fresh = boardId !== m.id;
    if (fresh) { build(m); localPick = null; }
    // 選んだ結果がサーバーから届いたら、押したカードの印はそちらに任せる
    if (localPick !== null && m.picked !== null && (m.picked === localPick || m.flipped.includes(m.picked))) localPick = null;
    m.cards.forEach((cid, i) => setFace(i, cid, !fresh));
    const p = game.prompt && game.prompt.kind === 'choose' && game.prompt.monty ? game.prompt : null;
    if (p && (!prompt || prompt.id !== p.id) && !SM.Prompt.isAnswered(p)) {
      prompt = p;
      localPick = null;
      deadline = game.timeLeft !== null && game.timeLeft !== undefined ? performance.now() + game.timeLeft : null;
    } else if (!p) {
      prompt = null;
      deadline = null;
    }
    render(game);
  }

  function tick() {
    if (!timerEl) return;
    timerEl.textContent = prompt && deadline !== null ? `残り ${Math.max(0, Math.ceil((deadline - performance.now()) / 1000))}秒` : '';
  }

  function init() { setInterval(tick, 250); }

  SM.Monty = { init, update };
})();
