// プレイヤーアイコン（カードのイラストから選ぶ）と、カードの演出などに出す「誰が何を選んだか」
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);
  const IMG_DIR = 'data/card_img/';
  const ICON_KEY = 'super_mahjong_icon';

  // 選べるアイコン: 同じ絵のカードは1つにまとめ、最初のカードのIDで表す（サーバーと同じ）
  const LIST = [];
  const IMG = new Map();
  {
    const seen = new Set();
    for (const c of window.SM_CARDS || []) {
      if (!c.img) continue;
      IMG.set(c.id, c.img);
      if (seen.has(c.img)) continue;
      seen.add(c.img);
      LIST.push({ id: c.id, img: c.img, name: c.name });
    }
  }

  /** 自分のアイコン。初めての時はランダムに決めて覚える */
  function mine() {
    let id = SM.Net.store.get(ICON_KEY);
    if (!id || !IMG.has(id)) {
      id = LIST[Math.floor(Math.random() * LIST.length)].id;
      SM.Net.store.set(ICON_KEY, id);
    }
    return id;
  }

  /** アイコン要素（id が無ければ空の枠） */
  function el(id, cls) {
    const span = document.createElement('span');
    span.className = `picon${cls ? ` ${cls}` : ''}`;
    const img = id ? IMG.get(id) : null;
    if (img) {
      const i = document.createElement('img');
      i.src = IMG_DIR + encodeURIComponent(img);
      i.alt = '';
      i.loading = 'lazy';
      i.draggable = false;
      span.appendChild(i);
    }
    return span;
  }

  /** 席のアイコンと名前 */
  function nameTag(seat) {
    const wrap = document.createElement('span');
    wrap.className = 'name-tag';
    wrap.appendChild(el(SM.Main.seatIcon(seat)));
    const n = document.createElement('span');
    n.textContent = SM.Main.seatName(seat);
    wrap.appendChild(n);
    return wrap;
  }

  const ownerText = (x) => (x.owner !== null && x.owner !== undefined ? `${SM.Main.seatName(x.owner)}の` : '');

  /** 選んだもの1つ分（プレイヤー / カード / 牌 / 文字） */
  function shownEl(x) {
    if (x.seat !== undefined) return nameTag(x.seat);
    const span = document.createElement('span');
    span.className = 'shown-item';
    if (x.cid !== undefined) {
      const d = x.cid ? SM.Cards.def(x.cid) : null;
      span.textContent = `${ownerText(x)}${d ? `《${d.name}》` : 'カード'}`;
    } else if (x.kind !== undefined) {
      if (x.owner !== null && x.owner !== undefined) span.append(`${ownerText(x)}河の`);
      span.appendChild(SM.Tiles.kindEl(x.kind, { size: 'sm' }));
    } else {
      span.textContent = x.label || '';
    }
    return span;
  }

  function shownText(x) {
    if (x.seat !== undefined) return SM.Main.seatName(x.seat);
    if (x.cid !== undefined) {
      const d = x.cid ? SM.Cards.def(x.cid) : null;
      return `${ownerText(x)}${d ? `《${d.name}》` : 'カード'}`;
    }
    if (x.kind !== undefined) return `${x.owner !== null && x.owner !== undefined ? `${ownerText(x)}河の` : ''}${SM.Tiles.kindLabel(x.kind)}`;
    return x.label || '';
  }

  const listOf = (shown, reactTo) => (shown && shown.length ? shown : reactTo ? [reactTo] : []);

  /** 「使用者 >>> 選んだもの」の行（選んだものが無ければ、割り込んだ相手を出す。どちらも無ければ null） */
  function targetLine(seat, shown, reactTo) {
    const list = listOf(shown, reactTo);
    if (!list.length) return null;
    const line = document.createElement('div');
    line.className = 'target-line';
    line.appendChild(nameTag(seat));
    const arrow = document.createElement('span');
    arrow.className = 'target-line__arrow';
    arrow.textContent = '>>>';
    line.appendChild(arrow);
    list.forEach((x, i) => {
      if (i) line.append('・');
      line.appendChild(shownEl(x));
    });
    return line;
  }

  /** ログ用 */
  function targetText(shown, reactTo) {
    const list = listOf(shown, reactTo);
    return list.length ? `>>> ${list.map(shownText).join('・')}` : '';
  }

  // ---- アイコンを選ぶ画面 ----
  let onPicked = null;
  function renderPicker() {
    const grid = $('icon-grid');
    const q = $('icon-filter').value.trim();
    const current = mine();
    grid.innerHTML = '';
    for (const it of LIST) {
      if (q && !it.name.includes(q)) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `icon-choice${it.id === current ? ' is-current' : ''}`;
      b.title = it.name;
      b.appendChild(el(it.id));
      const cap = document.createElement('span');
      cap.className = 'icon-choice__name';
      cap.textContent = it.name;
      b.appendChild(cap);
      b.addEventListener('click', () => pick(it.id));
      grid.appendChild(b);
    }
    if (!grid.children.length) grid.textContent = '見つかりません';
  }

  function pick(id) {
    SM.Net.store.set(ICON_KEY, id);
    $('icon-picker').hidden = true;
    if (onPicked) onPicked(id);
  }

  function openPicker(cb) {
    onPicked = cb;
    $('icon-filter').value = '';
    renderPicker();
    $('icon-picker').hidden = false;
    $('icon-grid').scrollTop = 0;
  }

  function init() {
    $('icon-filter').addEventListener('input', renderPicker);
    $('icon-random').addEventListener('click', () => pick(LIST[Math.floor(Math.random() * LIST.length)].id));
    $('icon-close').addEventListener('click', () => { $('icon-picker').hidden = true; });
    $('icon-picker').addEventListener('click', (e) => { if (e.target.id === 'icon-picker') $('icon-picker').hidden = true; });
  }

  SM.Icons = { init, mine, el, nameTag, targetLine, targetText, openPicker, LIST };
})();
