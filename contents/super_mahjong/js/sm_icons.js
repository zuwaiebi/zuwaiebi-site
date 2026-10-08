// プレイヤーアイコン（カードのイラスト・実績の報酬から選ぶ）と、カードの演出などに出す「誰が何を選んだか」
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);
  const IMG_DIR = 'data/card_img/';
  const ICON_KEY = 'super_mahjong_icon';

  // 選べるアイコン: 同じ絵のカードは1つにまとめ、最初のカードのIDで表す（サーバーと同じ）。
  // 実績の報酬のアイコンは「a + 実績の番号」（SM.Achievements。手に入れたものだけ選べる）
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
  const rewardOf = (id) => (typeof id === 'string' && /^a\d+$/.test(id) && SM.Achievements
    ? SM.Achievements.rewardIcons().find((x) => x.id === id) || null : null);

  /** 自分のアイコン。初めての時（と、手に入れていない報酬のアイコンだった時）はランダムに決めて覚える */
  function mine() {
    let id = SM.Net.store.get(ICON_KEY);
    const reward = rewardOf(id);
    if (!id || !(IMG.has(id) || (reward && reward.got))) {
      id = LIST[Math.floor(Math.random() * LIST.length)].id;
      SM.Net.store.set(ICON_KEY, id);
    }
    return id;
  }

  /** アイコン要素（id が無ければ空の枠。画像がまだ無い報酬のアイコンは名前の1文字目） */
  function el(id, cls) {
    const span = document.createElement('span');
    span.className = `picon${cls ? ` ${cls}` : ''}`;
    const reward = id && !IMG.has(id) ? rewardOf(id) : null;
    const src = id && IMG.has(id) ? IMG_DIR + encodeURIComponent(IMG.get(id)) : reward && reward.src;
    if (src) {
      const i = document.createElement('img');
      i.src = src;
      i.alt = '';
      i.loading = 'lazy';
      i.draggable = false;
      span.appendChild(i);
    } else if (reward) {
      span.classList.add('picon--text');
      span.textContent = [...reward.name][0] || '?';
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
    const choice = (id, name, locked) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `icon-choice${id === current ? ' is-current' : ''}${locked ? ' is-locked' : ''}`;
      b.appendChild(el(id));
      const cap = document.createElement('span');
      cap.className = 'icon-choice__name';
      cap.textContent = locked ? `🔒${name}` : name;
      b.appendChild(cap);
      if (locked) {
        b.disabled = true;
        b.title = `実績「${locked}」を達成すると選べます`;
      } else b.addEventListener('click', () => pick(id));
      grid.appendChild(b);
    };
    const heading = (text) => {
      const h = document.createElement('div');
      h.className = 'icon-grid__head';
      h.textContent = text;
      grid.appendChild(h);
    };
    // 実績の報酬（手に入れていないものは灰色で選べない）
    const rewards = SM.Achievements ? SM.Achievements.rewardIcons().filter((x) => !q || x.name.includes(q)) : [];
    if (rewards.length) {
      heading('実績の報酬');
      for (const x of rewards) choice(x.id, x.name, x.got ? null : x.ach.name);
      heading('カード');
    }
    const cards = LIST.filter((it) => !q || it.name.includes(q));
    for (const it of cards) choice(it.id, it.name, null);
    if (!rewards.length && !cards.length) grid.textContent = '見つかりません';
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
