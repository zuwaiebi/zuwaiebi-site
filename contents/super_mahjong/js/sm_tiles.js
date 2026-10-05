// 牌の表示。SVGで自作描画し、data/tile_img/<名前>.png があればそちらに差し替える。
// 名前: 1m..9m, 1p..9p, 1s..9s, 1z..7z(東南西北白發中), 赤5は 0m/0p/0s, 裏面は back
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});

  const SUITS = ['m', 'p', 's', 'z'];
  // サーバーから届く「牌IDと牌種がずれている牌」（カードで変化した牌・ゲーム外の牌）
  let overrides = {};
  const kindOf = (id) => (overrides[id] !== undefined ? overrides[id] : id >> 2);
  const isRedId = (id) => overrides[id] === undefined && (id === 16 || id === 52 || id === 88);
  // ドラになる牌種、カードの効果でドラになっている牌（ワイマール憲法の1・9など）、
  // カードの効果で別の牌として扱っている牌 { 牌ID: 牌種 / 'J'（オールマイティ牌） }
  let doraKinds = new Set();
  let doraTiles = new Set();
  let asKinds = {};
  // 光沢・切り替えの周期。描き直した牌どうしでも動きがそろうよう、周期の途中から始める
  const SHINE_MS = 3600;
  const FADE_MS = 4000;
  const phase = (period) => `${-(Date.now() % period)}ms`;

  function nameOf(id, useRed) {
    const k = kindOf(id);
    if (k >= 34) return `${k - 33}f`;
    if (k >= 27) return `${k - 26}z`;
    const suit = SUITS[Math.floor(k / 9)];
    if (useRed && isRedId(id)) return `0${suit}`;
    return `${(k % 9) + 1}${suit}`;
  }
  function kindName(k) { return k >= 27 ? `${k - 26}z` : `${(k % 9) + 1}${SUITS[Math.floor(k / 9)]}`; }

  const KANJI_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const HONOR = ['東', '南', '西', '北', '白', '發', '中'];
  const FLOWER = ['春', '夏', '秋', '冬'];
  const LABEL = (name) => {
    if (name === 'mask') return '？';
    const n = Number(name[0]), s = name[1];
    if (s === 'f') return FLOWER[n - 1];
    if (s === 'z') return HONOR[n - 1];
    return `${n === 0 ? 5 : n}${{ m: '萬', p: '筒', s: '索' }[s]}${n === 0 ? '(赤)' : ''}`;
  };

  const RED = '#c8262f', BLUE = '#1f4e9c', GREEN = '#1c7a3e', INK = '#1d1d1d';

  const PIN = {
    1: [[30, 40]], 2: [[30, 21], [30, 59]], 3: [[15, 16], [30, 40], [45, 64]],
    4: [[18, 22], [42, 22], [18, 58], [42, 58]],
    5: [[17, 19], [43, 19], [30, 40], [17, 61], [43, 61]],
    6: [[19, 15], [41, 15], [19, 40], [41, 40], [19, 65], [41, 65]],
    7: [[14, 12], [30, 21], [46, 30], [19, 50], [41, 50], [19, 68], [41, 68]],
    8: [[19, 12], [41, 12], [19, 31], [41, 31], [19, 49], [41, 49], [19, 68], [41, 68]],
    9: [[14, 16], [30, 16], [46, 16], [14, 40], [30, 40], [46, 40], [14, 64], [30, 64], [46, 64]],
  };
  const COLOR = { R: RED, G: GREEN, B: BLUE };
  const PIN_COL = { 1: 'R', 2: 'GG', 3: 'BRG', 4: 'BGGB', 5: 'BGRGB', 6: 'GGRRRR', 7: 'GGGRRRR', 8: 'BBBBBBBB', 9: 'BBBRRRGGG' };
  const SOU = {
    2: [[30, 21], [30, 59]], 3: [[30, 21], [17, 59], [43, 59]],
    4: [[18, 21], [42, 21], [18, 59], [42, 59]],
    5: [[15, 21], [45, 21], [30, 40], [15, 59], [45, 59]],
    6: [[14, 21], [30, 21], [46, 21], [14, 59], [30, 59], [46, 59]],
    7: [[30, 13], [14, 40], [30, 40], [46, 40], [14, 66], [30, 66], [46, 66]],
    8: [[12, 21], [24, 21], [36, 21], [48, 21], [12, 59], [24, 59], [36, 59], [48, 59]],
    9: [[14, 15], [30, 15], [46, 15], [14, 40], [30, 40], [46, 40], [14, 65], [30, 65], [46, 65]],
  };

  function face(name) {
    const n = Number(name[0]), s = name[1];
    const red = n === 0;
    const num = red ? 5 : n;
    let g = '';
    if (s === 'm') {
      g += `<text x="30" y="34" font-size="27" text-anchor="middle" fill="${red ? RED : INK}" font-weight="700">${KANJI_NUM[num]}</text>`;
      g += `<text x="30" y="68" font-size="28" text-anchor="middle" fill="${RED}" font-weight="700">萬</text>`;
    } else if (s === 'p') {
      const pts = PIN[num];
      const r = num === 1 ? 17 : num >= 7 ? 7 : num >= 5 ? 8.5 : 9.5;
      pts.forEach(([x, y], i) => {
        const col = red ? RED : COLOR[PIN_COL[num][i]];
        g += `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${col}" stroke-width="2.6"/>`;
        g += `<circle cx="${x}" cy="${y}" r="${r * 0.42}" fill="${col}"/>`;
      });
    } else if (s === 's') {
      if (num === 1) {
        g += `<ellipse cx="30" cy="30" rx="12" ry="14" fill="${GREEN}"/>`;
        g += `<circle cx="34" cy="24" r="3" fill="#fff"/><circle cx="34" cy="24" r="1.6" fill="${INK}"/>`;
        g += `<path d="M18 40 Q30 72 42 40 Z" fill="${RED}"/><path d="M26 44 L30 70 L34 44 Z" fill="${BLUE}"/>`;
      } else {
        const h = num >= 7 ? 15 : 17;
        SOU[num].forEach(([x, y], i) => {
          let col = GREEN;
          if (red || (num === 5 && i === 2) || (num === 7 && i === 0) || (num === 9 && i % 3 === 1)) col = RED;
          g += `<rect x="${x - 3.2}" y="${y - h / 2}" width="6.4" height="${h}" rx="3" fill="${col}"/>`;
          g += `<line x1="${x - 3.2}" y1="${y}" x2="${x + 3.2}" y2="${y}" stroke="#fff" stroke-width="1.2"/>`;
        });
      }
    } else if (s === 'f') {
      const col = ['#d1477a', '#2a8c4a', '#c86b1e', '#3d6fb8'][n - 1];
      g += `<circle cx="30" cy="40" r="20" fill="none" stroke="${col}" stroke-width="3"/>`;
      g += `<text x="30" y="52" font-size="30" text-anchor="middle" fill="${col}" font-weight="700">${FLOWER[n - 1]}</text>`;
    } else {
      if (n === 5) {
        g += `<rect x="12" y="14" width="36" height="52" rx="4" fill="none" stroke="${BLUE}" stroke-width="2.4"/>`;
      } else {
        const col = n === 6 ? GREEN : n === 7 ? RED : INK;
        g += `<text x="30" y="53" font-size="36" text-anchor="middle" fill="${col}" font-weight="700">${HONOR[n - 1]}</text>`;
      }
    }
    return g;
  }

  const svgCache = new Map();
  function svg(name) {
    if (svgCache.has(name)) return svgCache.get(name);
    let body;
    if (name === 'mask') {
      body = '<rect x="1" y="1" width="58" height="78" rx="7" fill="#e9e4d6" stroke="#b9ad92" stroke-width="2"/>'
        + '<text x="30" y="54" font-size="38" text-anchor="middle" fill="#8a826f" font-weight="700">？</text>';
    } else if (name === 'joker') {
      // オールマイティ牌（どの牌としても扱える）
      body = '<rect x="1" y="1" width="58" height="78" rx="7" fill="#fbf7ec" stroke="#b9ad92" stroke-width="2"/>'
        + ['#e74c3c', '#f39c12', '#27ae60', '#2980b9'].map((c, i) => `<circle cx="30" cy="43" r="${21 - i * 4.5}" fill="none" stroke="${c}" stroke-width="3"/>`).join('')
        + '<text x="30" y="51" font-size="20" text-anchor="middle" fill="#8e44ad" font-weight="700">★</text>'
        + '<text x="30" y="17" font-size="11" text-anchor="middle" fill="#8e44ad" font-weight="700" font-family="sans-serif">ALL</text>';
    } else if (name === 'back') {
      body = '<rect x="1" y="1" width="58" height="78" rx="7" fill="#e58a2c" stroke="#9b5513" stroke-width="2"/>'
        + '<rect x="7" y="7" width="46" height="66" rx="4" fill="none" stroke="#ffd29a" stroke-width="1.5"/>';
    } else {
      body = '<rect x="1" y="1" width="58" height="78" rx="7" fill="#fbf7ec" stroke="#b9ad92" stroke-width="2"/>' + face(name);
    }
    const s = `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" font-family="'Yu Mincho','Hiragino Mincho ProN',serif">${body}</svg>`;
    svgCache.set(name, s);
    return s;
  }

  // 画像差し替え: 1m.png が読めたら画像で表示する。画像が無い牌（読めなかった牌）だけ自作SVGに戻す
  // ファイル名: 1m〜9s.png、赤5は 5mr/5pr/5sr.png、字牌は 東南西北白發中.png、花牌は 春夏秋冬.png、裏は 裏.png
  // （以前の名前 0m.png・1z.png・back.png でもよい）
  let useImages = false;
  const IMG_DIR = 'data/tile_img/';
  const missing = new Set();
  function imageFiles(name) {
    if (name === 'back') return ['裏.png', 'back.png'];
    const n = Number(name[0]), s = name[1];
    if (s === 'z') return [`${HONOR[n - 1]}.png`, `${name}.png`];
    if (s === 'f') return [`${FLOWER[n - 1]}.png`];
    if (n === 0) return [`5${s}r.png`, `${name}.png`];
    return [`${name}.png`];
  }
  function probeImages(onDone) {
    const img = new Image();
    img.onload = () => { useImages = true; onDone && onDone(); };
    img.onerror = () => { useImages = false; };
    img.src = `${IMG_DIR}1m.png`;
  }

  /** 牌の面を画像で描く。読めなければ次の候補、どれも無ければSVG */
  function imageFace(inner, name) {
    const files = imageFiles(name).filter((f) => !missing.has(f));
    if (!files.length) { inner.innerHTML = svg(name); return; }
    const img = document.createElement('img');
    img.alt = name === 'back' ? '裏' : LABEL(name);
    img.draggable = false;
    let i = 0;
    img.onerror = () => {
      missing.add(files[i]);
      i += 1;
      if (i < files.length) img.src = IMG_DIR + encodeURIComponent(files[i]);
      else inner.innerHTML = svg(name);
    };
    img.src = IMG_DIR + encodeURIComponent(files[0]);
    inner.appendChild(img);
  }

  /**
   * 牌要素を作る
   * @param {number|null} id 牌ID（null で裏向き）
   * @param {object} o { red:boolean, size, sideways, cls, mask, plain, treat }
   *   plain: ドラの光沢・別の牌として扱う表示を付けない（ドラ表示牌など）
   *   treat: 和了画面などで決まった扱い { kind: この牌種として見せる（無ければ元の牌）, dora: カードの効果でドラ }。
   *          卓の情報（別の牌として扱う表示・カードの効果のドラ）の代わりに使う
   */
  function el(id, o = {}) {
    const known = !o.mask && id !== null && id !== undefined;
    const useRed = o.red !== false;
    const fixed = known && !o.plain && o.treat ? o.treat : null;
    const shown = fixed && typeof fixed.kind === 'number' ? fixed.kind : null;
    const name = o.mask ? 'mask' : !known ? 'back' : shown !== null ? shownName(id, shown, useRed) : nameOf(id, useRed);
    const as = known && !o.plain && !fixed ? asKinds[id] : undefined;
    const asName = as === undefined ? null : as === 'J' ? 'joker' : kindNameOf(as);
    const d = build(name, { ...o, as: asName });
    if (id !== null && id !== undefined) {
      d.dataset.id = id;
      // 同じ牌を光らせる時の目印（赤5も普通の5と同じ牌種。？の牌は牌種を持たせない）。カーソルを合わせても文字は出さない
      if (known) d.dataset.k = shown !== null ? shown : kindOf(id);
    }
    // ドラの牌（扱っている牌種で判定。赤5は赤ドラありの時。カードの効果でドラになっている牌も）
    const k = shown !== null ? shown : typeof as === 'number' ? as : kindOf(id);
    const cardDora = fixed ? Boolean(fixed.dora) : doraTiles.has(id);
    if (known && !o.plain && ((useRed && isRedId(id)) || doraKinds.has(k) || cardDora)) {
      d.classList.add('is-dora');
      d.style.setProperty('--shine-delay', phase(SHINE_MS));
    }
    return d;
  }

  /** 牌 id を牌種 k として見せる時の名前（赤5を別の色の5として扱うなら、その色の赤5） */
  function shownName(id, k, useRed) {
    if (useRed && isRedId(id) && k < 27 && k % 9 === 4) return `0${SUITS[Math.floor(k / 9)]}`;
    return kindNameOf(k);
  }

  /** 牌種から牌要素を作る（宣言した牌の種類など。牌IDの差し替えの影響を受けない） */
  function kindEl(k, o = {}) {
    const name = kindNameOf(k);
    const d = build(name, o);
    d.dataset.k = k;
    return d;
  }

  function build(name, o) {
    const d = document.createElement('div');
    d.className = 'tile' + (o.size ? ` tile--${o.size}` : '') + (o.sideways ? ' tile--side' : '') + (o.cls ? ` ${o.cls}` : '');
    d.appendChild(faceEl(name));
    if (o.as) {
      // 別の牌として扱っている牌: 元の牌と扱っている牌（オールマイティ牌）をフェードで切り替える
      const alt = faceEl(o.as);
      alt.classList.add('tile__face--as');
      d.appendChild(alt);
      d.classList.add('is-as');
      d.style.setProperty('--fade-delay', phase(FADE_MS));
    }
    return d;
  }

  function faceEl(name) {
    const inner = document.createElement('div');
    inner.className = 'tile__face';
    if (useImages && name !== 'mask' && name !== 'joker') {
      inner.classList.add('is-image');
      imageFace(inner, name);
    } else inner.innerHTML = svg(name);
    return inner;
  }

  // ---- 同じ牌を光らせる ----
  // PC: 牌にカーソルを乗せている間。スマホ: 手牌以外の牌はタップで切り替え、手牌は選んでいる牌（sm_input から）
  // 描き直された牌にも効くよう、牌種を指定したスタイルを差し替える
  let hlKind = null;
  let hlStyle = null;
  let lastPointer = 'mouse';
  function highlight(k) {
    const kind = k === null || k === undefined || k === '' ? null : Number(k);
    if (kind === hlKind) return;
    hlKind = kind;
    if (!hlStyle) {
      hlStyle = document.createElement('style');
      document.head.appendChild(hlStyle);
    }
    hlStyle.textContent = kind === null ? ''
      : `.tile[data-k="${kind}"] { outline: 2px solid var(--glow); outline-offset: 0; border-radius: calc(var(--w) * 0.12); }`
      + `.tile[data-k="${kind}"] .tile__face { filter: brightness(1.1) drop-shadow(0 0 3px var(--glow)) drop-shadow(0 0 5px var(--glow)) !important; }`;
  }

  function initHighlight() {
    const tileOf = (e) => (e.target && e.target.closest ? e.target.closest('.tile[data-k]') : null);
    document.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType || 'mouse'; }, true);
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const t = tileOf(e);
      highlight(t ? t.dataset.k : null);
    });
    document.addEventListener('pointerout', (e) => { if (e.pointerType === 'mouse' && !e.relatedTarget) highlight(null); });
    document.addEventListener('click', (e) => {
      if (lastPointer === 'mouse') return;
      // 手牌は選んでいる牌に合わせる（sm_input）。押した牌は描き直しで外れていることがあるので経路で判定する
      if (e.composedPath().some((n) => n.id === 'my-hand')) return;
      const t = tileOf(e);
      highlight(t && Number(t.dataset.k) !== hlKind ? t.dataset.k : null);
    });
  }

  /** 手牌で選んだ牌（スマホ）。PCではホバーに任せる */
  function highlightSelected(id) {
    if (lastPointer === 'mouse') return;
    highlight(id === null || id === undefined ? null : kindOf(id));
  }

  function kindNameOf(k) { return k >= 34 ? `${k - 33}f` : kindName(k); }
  SM.Tiles = {
    el, kindEl, nameOf, kindName, kindOf, probeImages, HONOR, initHighlight, highlight, highlightSelected,
    label: (id, red) => LABEL(nameOf(id, red)),
    kindLabel: (k) => LABEL(kindNameOf(k)),
    setOverrides(map) { overrides = map || {}; },
    /** 卓の情報から、ドラの牌種・カードの効果でドラになっている牌・別の牌として扱っている牌を受け取る */
    setView(game) {
      overrides = game.tiles || {};
      doraKinds = new Set(game.doraKinds || []);
      doraTiles = new Set(game.doraTiles || []);
      asKinds = game.asKinds || {};
    },
  };
})();
