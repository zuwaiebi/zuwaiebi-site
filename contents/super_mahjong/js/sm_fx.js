// 演出: サイコロを投げる・じゃんけんでお互いに何を出したか
// 画面の操作の邪魔をしないよう、クリックは下に通す（#fx-layer は pointer-events: none）
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);

  let timer = null;
  let rollTimer = null;
  function show(node, ms) {
    const layer = $('fx-layer');
    clearTimeout(timer);
    clearInterval(rollTimer);
    layer.innerHTML = '';
    layer.appendChild(node);
    layer.hidden = false;
    timer = setTimeout(() => { layer.hidden = true; layer.innerHTML = ''; }, ms);
  }

  function caption(seat, text) {
    const cap = document.createElement('div');
    cap.className = 'fx-caption';
    cap.appendChild(SM.Icons.nameTag(seat));
    cap.append(text);
    return cap;
  }

  // ---- サイコロ ----
  const PIPS = {
    1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]],
    6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
  };
  const face = (v) => '<svg viewBox="0 0 100 100" aria-hidden="true">'
    + '<rect x="4" y="4" width="92" height="92" rx="18" fill="#fdfdfd" stroke="#2a2a2a" stroke-width="3"/>'
    + PIPS[v].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${v === 1 ? 14 : 9}" fill="${v === 1 ? '#d0202e' : '#222'}"/>`).join('')
    + '</svg>';

  /** サイコロを投げる演出（転がりながら目が変わり、最後に結果で止まる） */
  function dice(seat, values, label) {
    const box = document.createElement('div');
    box.className = 'fx-box fx-dice';
    box.appendChild(caption(seat, `のサイコロ${label ? `（${label}）` : ''}`));
    const row = document.createElement('div');
    row.className = 'fx-dice__row';
    const dies = values.map((v, i) => {
      const d = document.createElement('div');
      d.className = 'fx-die';
      d.style.animationDelay = `${i * 0.08}s`;
      d.innerHTML = face(1 + Math.floor(Math.random() * 6));
      row.appendChild(d);
      return d;
    });
    box.appendChild(row);
    const total = document.createElement('div');
    total.className = 'fx-dice__total';
    box.appendChild(total);
    show(box, 1700);
    const start = performance.now();
    rollTimer = setInterval(() => {
      if (performance.now() - start < 650) {
        for (const d of dies) d.innerHTML = face(1 + Math.floor(Math.random() * 6));
        return;
      }
      clearInterval(rollTimer);
      dies.forEach((d, i) => { d.innerHTML = face(values[i]); d.classList.add('is-landed'); });
      total.textContent = values.length > 1 ? `${values.join(' + ')} = ${values.reduce((a, b) => a + b, 0)}` : `${values[0]}`;
    }, 70);
  }

  // ---- じゃんけん ----
  const HAND = { g: '✊', c: '✌️', p: '✋' };
  const HAND_NAME = { g: 'グー', c: 'チョキ', p: 'パー' };
  const beats = (x, y) => (x === 'g' && y === 'c') || (x === 'c' && y === 'p') || (x === 'p' && y === 'g');

  /** じゃんけんでお互いに何を出したかと、勝ち負け */
  function rps(a, b, ha, hb) {
    const box = document.createElement('div');
    box.className = 'fx-box fx-rps';
    const title = document.createElement('div');
    title.className = 'fx-rps__title';
    title.textContent = 'じゃんけん';
    box.appendChild(title);
    const row = document.createElement('div');
    row.className = 'fx-rps__row';
    const side = (seat, hand, cls, win) => {
      const s = document.createElement('div');
      s.className = `fx-rps__side ${cls}${win ? ' is-win' : ''}`;
      const h = document.createElement('div');
      h.className = 'fx-rps__hand';
      h.textContent = HAND[hand];
      s.appendChild(h);
      const n = document.createElement('div');
      n.className = 'fx-rps__name';
      n.appendChild(SM.Icons.nameTag(seat));
      s.appendChild(n);
      const hn = document.createElement('div');
      hn.className = 'fx-rps__handname';
      hn.textContent = HAND_NAME[hand];
      s.appendChild(hn);
      return s;
    };
    const aw = beats(ha, hb);
    const bw = beats(hb, ha);
    row.appendChild(side(a, ha, 'is-left', aw));
    const vs = document.createElement('div');
    vs.className = 'fx-rps__vs';
    vs.textContent = 'VS';
    row.appendChild(vs);
    row.appendChild(side(b, hb, 'is-right', bw));
    box.appendChild(row);
    const result = document.createElement('div');
    result.className = 'fx-rps__result';
    result.textContent = aw ? `${SM.Main.seatName(a)}の勝ち！` : bw ? `${SM.Main.seatName(b)}の勝ち！` : 'あいこ';
    box.appendChild(result);
    show(box, 1800);
  }

  // ---- 切った牌を比べる（勝利宣言鬼丸「覇」） ----
  /** 誰がどの牌を切ったかを並べ、主役（e.seat）の牌を目立たせて結果を出す */
  function compare(e, red) {
    const box = document.createElement('div');
    box.className = 'fx-box fx-compare';
    const title = document.createElement('div');
    title.className = 'fx-rps__title';
    title.textContent = e.title || '';
    box.appendChild(title);
    const row = document.createElement('div');
    row.className = 'fx-compare__row';
    e.entries.forEach((x, i) => {
      const col = document.createElement('div');
      col.className = `fx-compare__entry${x.seat === e.seat ? ' is-main' : ''}`;
      col.style.animationDelay = `${i * 0.15}s`;
      const tile = document.createElement('div');
      tile.className = 'fx-compare__tile';
      if (x.tile === null || x.tile === undefined) tile.textContent = '—';
      else tile.appendChild(SM.Tiles.el(x.tile, { red, size: 'hand' }));
      col.appendChild(tile);
      const num = document.createElement('div');
      num.className = 'fx-compare__num';
      const isNum = x.kind !== null && x.kind !== undefined && x.kind < 27;
      num.textContent = isNum ? String((x.kind % 9) + 1) : '数牌でない';
      if (!isNum) num.classList.add('is-none');
      col.appendChild(num);
      const name = document.createElement('div');
      name.className = 'fx-rps__name';
      name.appendChild(SM.Icons.nameTag(x.seat));
      col.appendChild(name);
      row.appendChild(col);
    });
    box.appendChild(row);
    const result = document.createElement('div');
    result.className = `fx-rps__result${e.win ? '' : ' is-lose'}`;
    result.textContent = e.text || '';
    box.appendChild(result);
    show(box, 2600);
  }

  SM.Fx = { dice, rps, compare };
})();
