// カードの効果などによる選択ウィンドウ（選ぶ・割り込み・じゃんけん）とフルパワー選択画面
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);

  let current = null;      // 表示中の問い合わせ
  let answeredId = null;
  let selected = new Set();
  let deadline = null;
  let peeking = false;     // 手牌・手札を確かめるために一時的に隠している

  function send(prompt, answer) {
    if (answeredId === prompt.id) return;
    answeredId = prompt.id;
    SM.Net.send({ type: 'answer', promptId: prompt.id, answer });
    hide();
  }

  function hide() {
    $('prompt-box').hidden = true;
    current = null;
    setPeek(false);
  }

  /** 選択ウィンドウを一時的に隠す／戻す（隠している間は画面上部に「戻る」ボタン） */
  function setPeek(on) {
    peeking = Boolean(on && current);
    if (current) $('prompt-box').hidden = peeking;
    const pill = $('prompt-peek');
    pill.hidden = !peeking;
    if (peeking) pill.querySelector('.prompt-peek__label').textContent = `${sourceLine(current) || '選択'}に戻る`;
  }

  function sourceLine(p) {
    const name = p.source && p.source.name ? p.source.name : '';
    if (!name) return '';
    return name.startsWith('《') || name === '割り込み' || name === 'フルパワー選択' ? name : `《${name}》の効果`;
  }

  function itemEl(p, it, i, onPick) {
    let e;
    if (it.cid !== undefined) {
      e = SM.Cards.el(it.cid, { size: 'mini', onClick: () => onPick(i, e) });
      if (it.label && it.owner !== undefined) {
        const wrap = document.createElement('div');
        wrap.className = 'prompt-item prompt-item--card';
        wrap.appendChild(e);
        const cap = document.createElement('div');
        cap.className = 'prompt-item__cap';
        cap.textContent = it.label;
        wrap.appendChild(cap);
        wrap.addEventListener('click', () => onPick(i, wrap));
        return wrap;
      }
      e.classList.add('prompt-item');
      return e;
    }
    if (it.tile !== undefined) {
      e = SM.Tiles.el(it.tile, { size: 'hand', mask: it.tile === null, red: SM.Main.state.game ? SM.Main.state.game.red : true });
      e.classList.add('prompt-item', 'prompt-item--tile');
      e.addEventListener('click', () => onPick(i, e));
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
    e.addEventListener('click', () => onPick(i, e));
    return e;
  }

  function show(p) {
    if (!p || answeredId === p.id) return;
    if (current && current.id === p.id) return;
    current = p;
    selected = new Set();
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
    if (p.source && p.source.cid) {
      src.classList.add('is-clickable');
      src.addEventListener('click', () => SM.Cards.showDetail(p.source.cid));
    }
    body.appendChild(src);
    const title = document.createElement('div');
    title.className = 'prompt__title';
    title.textContent = p.title || '';
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
    if (!prompt || prompt.kind === 'turn' || prompt.kind === 'call') {
      if (current) hide();
      return;
    }
    deadline = timeLeft !== null && timeLeft !== undefined ? performance.now() + timeLeft : null;
    show(prompt);
  }

  function tick() {
    const el = $('prompt-timer');
    if (!el) return;
    const text = deadline === null || !current ? '' : `残り ${Math.max(0, Math.ceil((deadline - performance.now()) / 1000))}秒`;
    el.textContent = text;
    $('prompt-peek').querySelector('.prompt-peek__timer').textContent = text;
  }

  // ---- フルパワー選択 ----
  function showPregame(pg, room) {
    const grid = $('fp-grid');
    const wait = $('fp-wait');
    const p = pg.prompt;
    const names = (pg.waitingFor || []).map((s) => (room.seats[s] ? room.seats[s].name : '?')).join('、');
    if (!p || answeredId === p.id) {
      grid.innerHTML = '';
      wait.textContent = names ? `他のプレイヤーの選択を待っています（${names}）` : '対局を準備しています…';
      return;
    }
    wait.textContent = 'カードを押すと詳しく見られます。';
    if (grid.dataset.pid === String(p.id)) return;
    grid.dataset.pid = String(p.id);
    grid.innerHTML = '';
    p.items.forEach((it, i) => {
      const e = SM.Cards.el(it.cid, {
        size: 'mini',
        onClick: () => SM.Cards.showDetail(it.cid, { actions: [{ label: 'これに決める', onClick: () => { answeredId = null; send(p, { pick: [i] }); showPregame({ prompt: null, waitingFor: pg.waitingFor }, room); } }] }),
      });
      grid.appendChild(e);
    });
  }

  function init() {
    setInterval(tick, 250);
    $('prompt-peek').addEventListener('click', () => setPeek(false));
  }

  SM.Prompt = { init, update, hide, showPregame, sendAnswer: send };
})();
