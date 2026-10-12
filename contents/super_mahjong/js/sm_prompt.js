// カードの効果などによる選択ウィンドウ（選ぶ・割り込み・じゃんけん）とフルパワー選択画面
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);

  let current = null;      // 表示中の問い合わせ
  let answeredId = null;
  let selected = new Set();
  let deadline = null;
  let peeking = false;     // 手牌・手札を確かめるために一時的に隠している
  let hand = null;         // 自分の手牌から選ぶ問い合わせ（ウィンドウを出さず、画面の手牌を押して選ぶ）

  function send(prompt, answer) {
    if (answeredId === prompt.id) return;
    // 接続が切れていて送れなかった時は答えていない扱いにする（つながり直すと同じ問い合わせが届くので、選び直せる）
    if (!SM.Net.send({ type: 'answer', promptId: prompt.id, answer })) return;
    answeredId = prompt.id;
    hide();
  }

  function hide() {
    $('prompt-box').hidden = true;
    current = null;
    setPeek(false);
    endHandPick();
  }

  /** 選択ウィンドウを一時的に隠す／戻す（隠している間は画面上部に「戻る」ボタン。ドラッグで動かした位置があればそこ） */
  function setPeek(on) {
    peeking = Boolean(on && current);
    if (current) $('prompt-box').hidden = peeking;
    const pill = $('prompt-peek');
    if (peeking) pill.querySelector('.prompt-peek__label').textContent = `${sourceLine(current) || '選択'}に戻る`;
    pill.hidden = !peeking;
    if (peeking) placePeek(loadPeekPos());
  }

  // ---- 隠している間の「〜に戻る」のバナー: ドラッグで動かせる（押しただけなら戻る）。位置はこのブラウザに覚える ----
  const PEEK_POS_KEY = 'super_mahjong_peek_pos';
  const DRAG_START_PX = 6;   // これより動かしたらドラッグ（押しただけの揺れは押したことにする）

  function loadPeekPos() {
    try {
      const v = JSON.parse(localStorage.getItem(PEEK_POS_KEY) || 'null');
      return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null;
    } catch (e) { return null; }
  }
  function savePeekPos(pos) {
    try { localStorage.setItem(PEEK_POS_KEY, JSON.stringify(pos)); } catch (e) { /* 保存できなくても、今は動かせる */ }
  }

  /** バナーの左上を (x, y) に置く（画面の外にはみ出さないように収める）。pos が無ければ既定の上の中央 */
  function placePeek(pos) {
    const pill = $('prompt-peek');
    if (!pos) {
      pill.classList.remove('is-moved');
      pill.style.left = '';
      pill.style.top = '';
      return;
    }
    pill.classList.add('is-moved');
    const x = Math.max(4, Math.min(window.innerWidth - pill.offsetWidth - 4, pos.x));
    const y = Math.max(4, Math.min(window.innerHeight - pill.offsetHeight - 4, pos.y));
    pill.style.left = `${x}px`;
    pill.style.top = `${y}px`;
  }

  function initPeekDrag() {
    const pill = $('prompt-peek');
    let drag = null;
    pill.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const rect = pill.getBoundingClientRect();
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, dx: e.clientX - rect.left, dy: e.clientY - rect.top, moved: false };
      pill.setPointerCapture(e.pointerId);
    });
    pill.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < DRAG_START_PX) return;
      drag.moved = true;
      pill.classList.add('is-dragging');
      placePeek({ x: e.clientX - drag.dx, y: e.clientY - drag.dy });
    });
    // 押しただけ（動かさずに離した）なら戻る。タッチで押した時は click が来ないことがあるので、離した時に決める
    const end = (e, canceled) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { moved } = drag;
      drag = null;
      pill.classList.remove('is-dragging');
      if (moved) {
        const rect = pill.getBoundingClientRect();
        savePeekPos({ x: Math.round(rect.left), y: Math.round(rect.top) });
      } else if (!canceled) setPeek(false);
    };
    pill.addEventListener('pointerup', (e) => end(e, false));
    pill.addEventListener('pointercancel', (e) => end(e, true));
    // キーボード（Enter・スペース）で押した時（detail が 0）。マウス・タッチは上の pointerup で戻している
    pill.addEventListener('click', (e) => { if (e.detail === 0) setPeek(false); });
    // 画面の大きさが変わったら（スマホの向きなど）、画面の中に収め直す
    window.addEventListener('resize', () => { if (peeking) placePeek(loadPeekPos()); });
  }

  function sourceLine(p) {
    const name = p.source && p.source.name ? p.source.name : '';
    if (!name) return '';
    const base = name.startsWith('《') || name === '割り込み' || name === 'フルパワー選択' ? name : `《${name}》の効果`;
    // 割り込み: どのカードの処理で出たウィンドウか
    return p.about && p.about.name ? `${base}　《${p.about.name}》の処理` : base;
  }
  /** ウィンドウの見出しを押した時に詳しく見るカード */
  const sourceCid = (p) => (p.source && p.source.cid) || (p.about && p.about.cid) || null;

  function itemEl(p, it, i, onPick) {
    let e;
    if (it.cid !== undefined) {
      // cid が null のカードは裏向き（モンティホール問題のダミーなど）。選べないカードは灰色で見せるだけ
      e = SM.Cards.el(it.cid, it.disabled ? { size: 'mini', detail: false } : { size: 'mini', onClick: () => onPick(i, e) });
      const caption = it.caption !== undefined ? it.caption : it.label && it.owner !== undefined ? it.label : null;
      if (caption !== null) {
        const wrap = document.createElement('div');
        wrap.className = `prompt-item prompt-item--card${it.disabled ? ' is-disabled' : ''}`;
        wrap.appendChild(e);
        const cap = document.createElement('div');
        cap.className = 'prompt-item__cap';
        cap.textContent = caption;
        wrap.appendChild(cap);
        if (!it.disabled) wrap.addEventListener('click', () => onPick(i, wrap));
        return wrap;
      }
      e.classList.add('prompt-item');
      if (it.disabled) e.classList.add('is-disabled');
      return e;
    }
    if (it.tile !== undefined) {
      e = SM.Tiles.el(it.tile, { size: 'hand', mask: it.tile === null || Boolean(SM.Main.state.game && SM.Main.state.game.maskAll), red: SM.Main.state.game ? SM.Main.state.game.red : true });
      e.classList.add('prompt-item', 'prompt-item--tile');
      // 選べない牌は灰色で見せるだけ
      if (it.disabled) e.classList.add('is-disabled');
      else e.addEventListener('click', () => onPick(i, e));
      return e;
    }
    e = document.createElement('button');
    e.className = 'prompt-item prompt-item--label';
    // プレイヤーを選ぶ時は名前の横にアイコン
    if (it.seat !== undefined) {
      e.classList.add('prompt-item--player');
      e.appendChild(SM.Icons.el(SM.Main.seatIcon(it.seat)));
    }
    e.append(it.label);
    // 選べない項目は灰色で見せるだけ
    if (it.disabled) { e.classList.add('is-disabled'); e.disabled = true; } else e.addEventListener('click', () => onPick(i, e));
    return e;
  }

  function show(p) {
    if (!p || answeredId === p.id) return;
    if (current && current.id === p.id) return;
    current = p;
    selected = new Set();
    // 自分の手牌から選ぶ時は、ウィンドウを出さずに画面の手牌から選ばせる
    if (p.handPick) {
      $('prompt-box').hidden = true;
      startHandPick(p);
      return;
    }
    endHandPick();
    const box = $('prompt-box');
    const body = $('prompt-body');
    body.innerHTML = '';
    const hideBtn = document.createElement('button');
    hideBtn.className = 'small-button prompt__hide';
    hideBtn.textContent = '隠す';
    hideBtn.title = '手牌や手札を確かめるために一時的に隠す';
    hideBtn.addEventListener('click', () => setPeek(true));
    body.appendChild(hideBtn);
    const src = document.createElement('div');
    src.className = 'prompt__source';
    src.textContent = sourceLine(p);
    if (sourceCid(p)) {
      src.classList.add('is-clickable');
      src.addEventListener('click', () => SM.Cards.showDetail(sourceCid(p)));
    }
    body.appendChild(src);
    const title = document.createElement('div');
    title.className = 'prompt__title';
    SM.Cards.linkify(title, p.title || '');
    body.appendChild(title);
    // 割り込み: プレイされたカードの使用者が何を選んだか（それを見て使うか決める）
    const line = p.subject ? SM.Icons.targetLine(p.subject.seat, p.subject.shown) : null;
    if (line) body.appendChild(line);

    if (p.kind === 'rps') {
      const row = document.createElement('div');
      row.className = 'prompt__items';
      [['g', '✊ グー'], ['c', '✌ チョキ'], ['p', '✋ パー']].forEach(([h, label]) => {
        const b = document.createElement('button');
        b.className = 'prompt-item prompt-item--label prompt-item--big';
        b.textContent = label;
        b.addEventListener('click', () => send(p, { hand: h }));
        row.appendChild(b);
      });
      body.appendChild(row);
    } else {
      const items = p.items || [];
      const min = p.min ?? 1;
      const max = p.max ?? 1;
      const row = document.createElement('div');
      row.className = 'prompt__items';
      const els = [];
      const confirmBtn = document.createElement('button');
      const refresh = () => {
        els.forEach((e, i) => e.classList.toggle('is-selected', selected.has(i)));
        confirmBtn.disabled = selected.size < min || selected.size > max;
        confirmBtn.textContent = max > 1 ? `決定（${selected.size}/${max}）` : '決定';
      };
      const onPick = (i) => {
        if (p.kind === 'reaction') { send(p, { pick: [i] }); return; }
        if (max === 1 && min <= 1) { send(p, { pick: [i] }); return; }
        if (selected.has(i)) selected.delete(i);
        else if (selected.size < max) selected.add(i);
        refresh();
      };
      items.forEach((it, i) => {
        const e = itemEl(p, it, i, onPick);
        els.push(e);
        row.appendChild(e);
      });
      body.appendChild(row);
      const acts = document.createElement('div');
      acts.className = 'prompt__actions';
      if (p.kind === 'reaction') {
        const no = document.createElement('button');
        no.className = 'sub-button';
        no.textContent = '使わない';
        no.addEventListener('click', () => send(p, { pick: [] }));
        acts.appendChild(no);
      } else if (max === 0) {
        // 選べるものが1つもない（灰色だけ）: 見せるだけ見せて、選ばずに終わる
        const note = document.createElement('div');
        note.className = 'prompt__note';
        note.textContent = '選べるものがありません';
        acts.appendChild(note);
        const end = document.createElement('button');
        end.className = 'main-button';
        end.textContent = '選ばずに終了';
        end.addEventListener('click', () => send(p, { pick: [] }));
        acts.appendChild(end);
      } else {
        if (max > 1 || min === 0) {
          confirmBtn.className = 'main-button';
          confirmBtn.addEventListener('click', () => send(p, { pick: [...selected] }));
          acts.appendChild(confirmBtn);
          refresh();
        }
        if (min === 0 && max === 1) {
          const skip = document.createElement('button');
          skip.className = 'sub-button';
          skip.textContent = '選ばない';
          skip.addEventListener('click', () => send(p, { pick: [] }));
          acts.appendChild(skip);
        }
      }
      body.appendChild(acts);
    }
    const timer = document.createElement('div');
    timer.className = 'prompt__timer';
    timer.id = 'prompt-timer';
    body.appendChild(timer);
    setPeek(false);
    box.hidden = false;
  }

  function update(prompt, timeLeft) {
    // monty: モンティホール問題の盤で選ぶ問い合わせ（sm_monty が受け持つ）
    if (!prompt || prompt.kind === 'turn' || prompt.kind === 'call' || prompt.monty) {
      if (current) hide();
      return;
    }
    deadline = timeLeft !== null && timeLeft !== undefined ? performance.now() + timeLeft : null;
    show(prompt);
  }

  function tick() {
    const text = deadline === null || !current ? '' : `残り ${Math.max(0, Math.ceil((deadline - performance.now()) / 1000))}秒`;
    const ht = $('hand-pick-timer');
    if (ht) ht.textContent = text;
    const el = $('prompt-timer');
    if (!el) return;
    el.textContent = text;
    $('prompt-peek').querySelector('.prompt-peek__timer').textContent = text;
  }

  // ---- 自分の手牌から選ぶ（ウィンドウを出さず、画面の手牌を押して選ぶ） ----
  function startHandPick(p) {
    const byTile = new Map();
    (p.items || []).forEach((it, i) => { if (!it.disabled && it.tile !== null && it.tile !== undefined) byTile.set(it.tile, i); });
    hand = { p, byTile, sel: new Set(), min: p.min ?? 1, max: p.max ?? 1 };
    renderHandPick();
    SM.Table.rerender();
  }

  function endHandPick() {
    if (!hand) return;
    hand = null;
    const bar = $('hand-pick');
    bar.hidden = true;
    bar.innerHTML = '';
    SM.Table.rerender();
  }

  /** 手牌の牌を飾る（sm_input から）。手牌から選んでいる最中でなければ false を返す */
  function decorateHandPick(el, t) {
    if (!hand) return false;
    const i = hand.byTile.get(t);
    if (i === undefined) { el.classList.add('is-disabled'); return true; }
    el.classList.add('is-pickable');
    if (hand.sel.has(i)) el.classList.add('is-selected');
    el.addEventListener('click', () => pickHandTile(i));
    return true;
  }

  function pickHandTile(i) {
    if (!hand) return;
    const { p, sel, min, max } = hand;
    if (max === 1 && min <= 1) {
      // 1枚だけ選ぶ時: ワンクリックの設定なら押した牌で決定、そうでなければ選んだ牌をもう一度押すと決定
      if (sel.has(i) || SM.Input.oneClick()) { send(p, { pick: [i] }); return; }
      sel.clear();
      sel.add(i);
    } else if (sel.has(i)) sel.delete(i);
    else if (sel.size < max) sel.add(i);
    renderHandPick();
    SM.Table.rerender();
  }

  function renderHandPick() {
    const bar = $('hand-pick');
    bar.innerHTML = '';
    const { p, sel, min, max } = hand;
    const single = max === 1 && min <= 1;
    const src = document.createElement('span');
    src.className = 'prompt__source';
    src.textContent = sourceLine(p);
    if (sourceCid(p)) {
      src.classList.add('is-clickable');
      src.addEventListener('click', () => SM.Cards.showDetail(sourceCid(p)));
    }
    bar.appendChild(src);
    const title = document.createElement('span');
    title.className = 'hand-pick__title';
    SM.Cards.linkify(title, `${p.title || '手牌から選んでください'}${max > 1 ? `（${sel.size}/${max}）` : ''}`);
    bar.appendChild(title);
    const hint = document.createElement('span');
    hint.className = 'hand-pick__hint';
    hint.textContent = single && !SM.Input.oneClick() ? '手牌を選んでもう一度押すと決定' : '手牌を押して選ぶ';
    bar.appendChild(hint);
    const timer = document.createElement('span');
    timer.id = 'hand-pick-timer';
    timer.className = 'hand-pick__timer';
    bar.appendChild(timer);
    if (min === 0) {
      const skip = document.createElement('button');
      skip.className = 'sub-button';
      skip.textContent = '選ばない';
      skip.addEventListener('click', () => send(p, { pick: [] }));
      bar.appendChild(skip);
    }
    // 1枚だけ選ぶ時のワンクリックでは押した牌で決まるので、決定ボタンは要らない
    if (!(single && SM.Input.oneClick())) {
      const ok = document.createElement('button');
      ok.className = 'main-button';
      ok.textContent = '決定';
      ok.disabled = sel.size < Math.max(min, 1) || sel.size > max;
      ok.addEventListener('click', () => send(p, { pick: [...sel] }));
      bar.appendChild(ok);
    }
    bar.hidden = false;
    tick();
  }

  // ---- 対局の初めの選択（フルパワー選択。カスタムモードのドラフトのセット・オールフォーワンのカードも） ----
  // 2つ以上選ぶ時（文殊の知恵）に選んでいる項目の番号
  let pregameSel = new Set();

  /** 見出しと説明（問い合わせの出どころで変える） */
  function pregameHeading(p) {
    const src = p.source && p.source.name;
    const title = src === 'ドラフト' ? 'ドラフト' : src === 'オールフォーワン' ? 'オールフォーワン' : 'フルパワーを選ぶ';
    let note;
    if (p.draft) note = `${p.title}。選んだセットの5枚がデッキに入ります。`;
    else if (src === 'オールフォーワン') note = `${p.title}。選んだカードだけのデッキで対局します。`;
    else if ((p.max || 1) > 1) note = `${p.title}。手札とは別に、それぞれ対局中に使えます（カードを押して「選ぶ」）。`;
    else if (src === 'フルパワー選択' && p.title === 'フルパワーを1枚選んでください') note = '相棒になるカードを1枚選んでください。手札とは別に、対局中に使えます。';
    else note = `${p.title}。手札とは別に、対局中に使えます。`;
    $('pregame-title').textContent = title;
    $('pregame-note').textContent = note;
  }

  /**
   * カードを小さく並べた行（決まっているフルパワー・ドラフトで選んだフルパワーとカード）。
   * groups は [見出し, カードIDの並び] の並び（カードの無いものは出さない）。カードを押すと詳しく見られる
   */
  function miniRows(box, groups) {
    box.innerHTML = '';
    const shown = groups.filter(([, cids]) => cids && cids.length);
    box.hidden = !shown.length;
    for (const [label, cids] of shown) {
      const cap = document.createElement('div');
      cap.className = 'pregame-row__label';
      cap.textContent = label;
      const row = document.createElement('div');
      row.className = 'pregame-row';
      for (const cid of cids) row.appendChild(SM.Cards.el(cid, { size: 'mini' }));
      box.append(cap, row);
    }
  }

  /** 答えを送る（送れた時だけ待つ表示にする。接続が切れていて送れなければ、そのまま選び直せる） */
  function sendPregame(p, pick, pg, room) {
    answeredId = null;
    send(p, { pick });
    if (answeredId === p.id) showPregame({ prompt: null, waitingFor: pg.waitingFor }, room);
  }

  function showPregame(pg, room) {
    const grid = $('fp-grid');
    const wait = $('fp-wait');
    const p = pg.prompt;
    const names = (pg.waitingFor || []).map((s) => (room.seats[s] ? room.seats[s].name : '?')).join('、');
    if (!p || answeredId === p.id) {
      grid.innerHTML = '';
      grid.dataset.pid = '';
      $('fp-actions').hidden = true;
      $('fp-filter').hidden = true;
      wait.textContent = names ? `他のプレイヤーの選択を待っています（${names}）` : '対局を準備しています…';
      return;
    }
    wait.textContent = 'カードを押すと詳しく見られます。';
    if (grid.dataset.pid === String(p.id)) return;
    grid.dataset.pid = String(p.id);
    grid.innerHTML = '';
    pregameSel = new Set();
    pregameHeading(p);
    // ドラフトのセット選びでは、選んだフルパワーを選んだカードと一緒に下に出す
    miniRows($('fp-fixed'), [['決まっているフルパワー', p.draft ? null : p.fixed]]);
    miniRows($('draft-picked'), p.draft
      ? [['自分のフルパワー', p.fixed], [`これまでに選んだカード（${p.draft.picked.length}枚）`, p.draft.picked]] : []);
    const filter = $('fp-filter');
    filter.hidden = !p.search;
    filter.value = '';
    const actions = $('fp-actions');
    actions.innerHTML = '';
    actions.hidden = true;
    grid.classList.toggle('is-sets', p.items.some((it) => it.cids));
    // ドラフト: 3つの5枚セットから1つ
    if (p.items.some((it) => it.cids)) {
      p.items.forEach((it, i) => {
        const set = document.createElement('div');
        set.className = 'draft-set';
        const head = document.createElement('div');
        head.className = 'draft-set__head';
        const label = document.createElement('span');
        label.textContent = it.label;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'main-button';
        b.textContent = 'このセットにする';
        b.addEventListener('click', () => sendPregame(p, [i], pg, room));
        head.append(label, b);
        const row = document.createElement('div');
        row.className = 'draft-set__cards';
        for (const cid of it.cids) row.appendChild(SM.Cards.el(cid, { size: 'mini' }));
        set.append(head, row);
        grid.appendChild(set);
      });
      return;
    }
    const max = p.max || 1;
    const multi = max > 1;
    // 2つ以上選ぶ時: カードを押して「選ぶ」を繰り返し、そろったら「決定」
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'main-button';
    const refresh = () => {
      ok.textContent = `決定（${pregameSel.size}/${max}）`;
      ok.disabled = pregameSel.size !== max;
      for (const e of grid.children) e.classList.toggle('is-chosen', pregameSel.has(Number(e.dataset.idx)));
    };
    if (multi) {
      ok.addEventListener('click', () => { if (pregameSel.size === max) sendPregame(p, [...pregameSel], pg, room); });
      actions.appendChild(ok);
      actions.hidden = false;
    }
    p.items.forEach((it, i) => {
      const e = SM.Cards.el(it.cid, {
        size: 'mini',
        onClick: () => {
          const acts = !multi
            ? [{ label: 'これに決める', onClick: () => sendPregame(p, [i], pg, room) }]
            : pregameSel.has(i)
              ? [{ label: '選ぶのをやめる', onClick: () => { pregameSel.delete(i); refresh(); } }]
              : [{ label: '選ぶ', onClick: () => { if (pregameSel.size < max) pregameSel.add(i); refresh(); } }];
          SM.Cards.showDetail(it.cid, { actions: acts });
        },
      });
      e.dataset.idx = String(i);
      grid.appendChild(e);
    });
    if (multi) refresh();
  }

  /** オールフォーワン: カード名・テキストで並んだカードを絞り込む */
  function filterPregame() {
    const q = $('fp-filter').value;
    for (const e of $('fp-grid').children) {
      if (e.dataset.cid) e.hidden = Boolean(q.trim()) && !SM.CardList.matches(e.dataset.cid, q);
    }
  }

  /** 新しい対局が始まった時: 前の対局で答えた問い合わせの覚えを消す（番号が重なっても選べるように） */
  function reset() {
    answeredId = null;
    current = null;
    endHandPick();
    $('prompt-box').hidden = true;
    $('fp-grid').dataset.pid = '';
  }

  function init() {
    setInterval(tick, 250);
    initPeekDrag();
    $('fp-filter').addEventListener('input', filterPregame);
  }

  SM.Prompt = { init, update, hide, reset, showPregame, sendAnswer: send, decorateHandPick, isAnswered: (p) => Boolean(p) && answeredId === p.id };
})();
