// 表示の言語（日本語・繁體中文）。<head> で読み込み、ほかのスクリプトより先に言語を決める。
// 画面の文はすべて日本語のまま書き、中国語の時だけ「日本語の文 → 中国語の文」の辞書（js/sm_i18n_zh.js）で画面に出る文を置き換える。
// 置き換えるのは画面に出る文だけ（サーバーに送るもの・保存するもの・コードで比べるものは日本語のまま）:
//   - 静的な HTML: <body> の最後で applyStatic() が置き換える（<b>・<a> などを含む段落は段落ごと（html）、ほかは文字の塊ごと）
//   - 後から足される文（画面のコード・サーバーから届く文）: MutationObserver で、足された文字の塊と一部の属性を置き換える
//     （完全一致（exact）→ 「{0}の{1}開始！」のような型（patterns）→ 文の中の《カード名》）
//   - カード名・テキスト: js/sm_cards_zh_data.js（super_mahjong_cards_list_zh.csv から build-cards.mjs が作る）を card() で引く
// カードの効果が数える「名前の文字数」は日本語の名前のまま（中国語のカードには日本語の名前と文字数を小さく添える）。
// 置き換えたくない所（日本語の名前・和歌など）は translate="no" か .notranslate を付ける。
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const KEY = 'super_mahjong_lang';
  const LANGS = { ja: '日本語', zh: '繁體中文' };

  function detect() {
    try {
      // ?lang=zh / ?lang=ja で切り替えて覚える（共有した URL でもその言語で開く）
      const q = new URLSearchParams(location.search).get('lang');
      if (q) {
        const l = /^zh/i.test(q) ? 'zh' : /^ja/i.test(q) ? 'ja' : null;
        if (l) { localStorage.setItem(KEY, l); return l; }
      }
      const saved = localStorage.getItem(KEY);
      if (saved && LANGS[saved]) return saved;
    } catch { /* 保存できない環境 */ }
    // 初めて開いた時は、ブラウザの言語が中国語なら繁體中文
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    return /^zh/i.test(nav) ? 'zh' : 'ja';
  }

  const lang = detect();
  const zh = lang === 'zh';

  if (zh) {
    const html = document.documentElement;
    html.lang = 'zh-Hant';
    // 置き換え終わるまで本文を隠す（日本語が一瞬見えないように。applyStatic で外す）
    html.classList.add('i18n-pending');
    // 繁體字の字形のフォント（日本語のフォントに無い字が混ざらないように）と、辞書・カードの訳
    document.write('<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&display=swap" rel="stylesheet" media="print" onload="this.media=\'all\'">');
    document.write('<script src="js/sm_i18n_zh.js"><\/script><script src="js/sm_cards_zh_data.js"><\/script>');
  }

  // ---------- 辞書 ----------
  // 仮名（訳せていない日本語の目印）。中国語の文にも使う「・」「ー」は入れない
  const KANA = /[ぁ-ゖァ-ヺｦ-ﾝ]/;
  const CJK = /[ぁ-ヿ㐀-鿿ｦ-ﾟ]/;
  const normKey = (s) => s.replace(/\s+/g, ' ').trim();
  // カード名の表記ゆれ（空白・中黒）は無視して探す（sm_cards.js の norm と同じ）
  const normName = (s) => String(s).normalize('NFKC').replace(/[\s･・·]/g, '');
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let dict = null;
  function load() {
    if (dict) return dict;
    const z = window.SM_I18N_ZH || {};
    const exact = new Map();
    for (const [k, v] of Object.entries(z.exact || {})) exact.set(normKey(k), v);
    const html = new Map();
    for (const [k, v] of Object.entries(z.html || {})) html.set(normKey(k), v);
    // カード: 日本語の名前 → 中国語の名前（完全一致と《》の中に使う）
    const cardsZh = window.SM_CARDS_ZH || {};
    const cardName = new Map();
    for (const c of window.SM_CARDS || []) {
      const t = cardsZh[c.key];
      if (!t || !t.name) continue;
      cardName.set(normName(c.name), t.name);
      if (!exact.has(c.name)) exact.set(c.name, t.name);
    }
    dict = { exact, html, cardName, cardsZh, patterns: compile(z.patterns || []) };
    return dict;
  }

  /**
   * 型: ['{0}の{1}開始！', '{0}的{1}開始！'] の {0}… は、画面のコード・サーバーの `${…}` の所（現れた順に 0, 1, …）。
   * 中国語の側では順番を入れ替えてよい。決まった文字の多い型から試す。
   * 決まった文字が2字以下の型（「{0}の{1}」など）は、{…} の所がすべて訳せる時（または日本語でない時）だけ使う
   */
  function compile(list) {
    const out = [];
    for (const [ja, zhText] of list) {
      const parts = ja.split(/\{(\d+)\}/);
      let src = '^';
      let weight = 0;
      let anchor = '';
      parts.forEach((p, i) => {
        if (i % 2 === 0) {
          src += escRe(p);
          weight += p.length;
          if (p.length > anchor.length) anchor = p;
        } else src += '([\\s\\S]*?)';
      });
      if (!weight) continue;
      out.push({ re: new RegExp(`${src}$`), zh: zhText, anchor, weight, strict: weight <= 2 });
    }
    return out.sort((a, b) => b.weight - a.weight);
  }

  const cache = new Map();
  const produced = new Set();
  const missing = new Set();
  let depth = 0;   // 型の {0} の所を訳している深さ（訳せなかった文として覚えるのは、画面に出る文そのものだけ）

  function byPattern(s, d) {
    for (const p of d.patterns) {
      if (p.anchor && !s.includes(p.anchor)) continue;
      const m = p.re.exec(s);
      if (!m) continue;
      depth++;
      let groups;
      try { groups = m.slice(1).map((g) => tr(g)); } finally { depth--; }
      if (p.strict && m.slice(1).some((g, i) => KANA.test(g) && groups[i] === g)) continue;
      return p.zh.replace(/\{(\d+)\}/g, (all, i) => groups[Number(i)] ?? '');
    }
    return undefined;
  }

  /**
   * 「立直・平和・ドラ」のように区切った並びは、区切りごとに訳す
   * （どれかが訳せて、訳せない所に仮名が無い時だけ。名前の中の「・」で切って訳を崩さないように）
   */
  function byList(s) {
    for (const sep of ['・', '、', ' / ', '／', '　']) {
      if (!s.includes(sep)) continue;
      const parts = s.split(sep);
      depth++;
      let out;
      try { out = parts.map((p) => tr(p)); } finally { depth--; }
      if (out.some((o, i) => o !== parts[i]) && out.every((o, i) => o !== parts[i] || !KANA.test(parts[i]))) return out.join(sep);
    }
    return undefined;
  }

  /**
   * 「名無し（あなた）」「🔒 曲名（実績「…」で解放）」のように、訳せる文を括弧・コロン・空白などでつないだもの:
   * いちばん外側の括弧の中はまとめて訳し（だめなら括弧ごと。「（あなた）」など）、括弧の外は空白・・・：などで区切って訳す。
   * 仮名のある所がすべて訳せる時だけ使う
   */
  const OPEN = '「『（(【［';
  const CLOSE = '」』）)】］';
  const SEP = /([\s・·：:、，,／/]+)/;
  function bySegments(s) {
    if (!KANA.test(s)) return undefined;
    // いちばん外側の括弧の組で分ける（[外, 括弧, 外, 括弧, …]。括弧は {o, inner, c}）
    const pieces = [];
    const stack = [];
    let from = 0;
    let start = -1;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (OPEN.includes(ch)) {
        if (!stack.length) { pieces.push(s.slice(from, i)); start = i; }
        stack.push(CLOSE[OPEN.indexOf(ch)]);
      } else if (CLOSE.includes(ch)) {
        if (stack.pop() !== ch) return undefined;
        if (!stack.length) { pieces.push({ o: s[start], inner: s.slice(start + 1, i), c: ch }); from = i + 1; }
      }
    }
    if (stack.length) return undefined;
    pieces.push(s.slice(from));
    let changed = false;
    const ok = (orig, v) => { if (v !== orig) changed = true; return v !== orig || !KANA.test(orig); };
    depth++;
    try {
      const out = [];
      for (const p of pieces) {
        if (typeof p === 'string') {
          const toks = p.split(SEP);
          for (let i = 0; i < toks.length; i++) {
            const v = i % 2 === 0 && CJK.test(toks[i]) ? tr(toks[i]) : toks[i];
            if (!ok(toks[i], v)) return undefined;
            out.push(v);
          }
        } else {
          const v = CJK.test(p.inner) ? tr(p.inner) : p.inner;
          if (ok(p.inner, v)) { out.push(p.o, v, p.c); continue; }
          const whole = `${p.o}${p.inner}${p.c}`;
          const w = tr(whole);
          if (!ok(whole, w)) return undefined;
          out.push(w);
        }
      }
      return changed ? out.join('') : undefined;
    } finally { depth--; }
  }

  /** 文の中の《日本語のカード名》を《中国語のカード名》にする */
  function cardRefs(s, d) {
    return s.replace(/《([^《》]+)》/g, (all, name) => {
      const v = d.cardName.get(normName(name));
      return v ? `《${v}》` : all;
    });
  }

  function translate(s) {
    const d = load();
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    const core = m[2];
    let v = d.exact.get(core);
    if (v === undefined && /\s/.test(core)) v = d.exact.get(normKey(core));
    if (v === undefined) v = byPattern(core, d);
    if (v === undefined) v = byList(core);
    if (v === undefined) v = bySegments(core);
    if (v === undefined) {
      v = cardRefs(core, d);
      if (!depth && KANA.test(v) && missing.size < 1000) missing.add(core);
    }
    return m[1] + v + m[3];
  }

  const active = new Set();   // 訳している途中の文（同じ文の訳し直しで回り続けないように）

  /** 画面に出す文を今の言語にする（日本語の時はそのまま） */
  function tr(s) {
    if (!zh || typeof s !== 'string' || !CJK.test(s)) return s;
    if (produced.has(s) || active.has(s)) return s;
    const hit = cache.get(s);
    if (hit !== undefined) {
      if (!depth && hit === s && KANA.test(s) && missing.size < 1000) missing.add(s.trim());
      return hit;
    }
    active.add(s);
    let out;
    try { out = translate(s); } finally { active.delete(s); }
    if (cache.size > 8000) { cache.clear(); produced.clear(); }
    cache.set(s, out);
    if (out !== s) produced.add(out);
    return out;
  }

  // ---------- カード ----------
  /**
   * 画面に出すカードの名前・テキスト・タイプ。中国語の時は jname（日本語の名前）と jlen（日本語の名前の文字数。
   * カードの効果が数える文字数）も返す（カードの名前の下に小さく出す）
   */
  function card(def) {
    if (!def) return null;
    if (!zh) return { name: def.name, text: def.text, type: def.type, jname: null, jlen: 0 };
    // 訳のあるカードだけ日本語の名前を添える（デッキの「ランダム」のようなカードでないものは添えない）
    const t = load().cardsZh[def.key];
    return {
      name: (t && t.name) || tr(def.name),
      text: (t && t.text) || tr(def.text || ''),
      type: tr(def.type || ''),
      jname: t ? def.name : null,
      jlen: [...def.name].length,
    };
  }

  /** カードを中国語の名前・テキストでも探せるように（カード一覧・デッキ編集・オールフォーワンの絞り込み） */
  function cardSearchText(def) {
    if (!zh || !def) return '';
    const t = load().cardsZh[def.key];
    return t ? `${t.name}\n${t.text || ''}` : '';
  }

  // ---------- 画面の置き換え ----------
  const SKIP = 'script,style,svg,textarea,[translate="no"],.notranslate';
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const INLINE = new Set(['B', 'A', 'STRONG', 'EM', 'I', 'U', 'SMALL', 'CODE', 'SPAN', 'BR', 'RUBY', 'KBD', 'MARK', 'S', 'SUB', 'SUP']);

  function skipped(el) { return Boolean(el && el.closest && el.closest(SKIP)); }

  function textNode(n) {
    const v = n.nodeValue;
    if (!v || !CJK.test(v)) return;
    const out = tr(v);
    if (out !== v) n.nodeValue = out;
  }

  function attrs(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v || !CJK.test(v)) continue;
      const out = tr(v);
      if (out !== v) el.setAttribute(a, out);
    }
  }

  function walk(root) {
    if (root.nodeType === 3) { if (!skipped(root.parentElement)) textNode(root); return; }
    if (root.nodeType !== 1 || skipped(root)) return;
    attrs(root);
    const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let n;
    while ((n = it.nextNode())) {
      if (n.nodeType === 3) textNode(n);
      else attrs(n);
    }
  }

  /**
   * 段落ごとに置き換える要素: 日本語の文字の塊と、文字を含むインラインの要素（<b>・<a> など）が混ざっているもの。
   * 鍵は空白をまとめた innerHTML（訳も同じ印を同じ属性のまま使う）
   */
  function isMixed(el) {
    let text = false;
    let inline = false;
    for (const c of el.childNodes) {
      if (c.nodeType === 3) { if (CJK.test(c.nodeValue)) text = true; } else if (c.nodeType === 1) {
        if (!INLINE.has(c.tagName)) return false;
        if (c.tagName !== 'BR' && c.textContent.trim()) inline = true;
      }
    }
    return text && inline;
  }

  function mixedBlocks(root) {
    const out = [];
    const visit = (el) => {
      if (el.matches(SKIP)) return;
      if (isMixed(el)) { out.push(el); return; }
      for (const c of el.children) visit(c);
    };
    visit(root);
    return out;
  }

  /** 静的な HTML を置き換える（<body> の最後、ほかのスクリプトが要素を掴む前に呼ぶ） */
  function applyStatic(root = document.body) {
    if (!zh) return;
    const d = load();
    for (const el of mixedBlocks(root)) {
      const v = d.html.get(normKey(el.innerHTML));
      if (v !== undefined) el.innerHTML = v;
    }
    walk(root);
    document.title = tr(document.title);
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = tr(desc.content);
    document.documentElement.classList.remove('i18n-pending');
  }

  /** 後から足される文を置き換え続ける */
  function observe(root = document.body) {
    if (!zh) return;
    const mo = new MutationObserver((recs) => {
      for (const r of recs) {
        if (r.type === 'childList') {
          for (const n of r.addedNodes) walk(n);
        } else if (r.type === 'characterData') {
          if (!skipped(r.target.parentElement)) textNode(r.target);
        } else if (r.type === 'attributes' && !skipped(r.target)) attrs(r.target);
      }
    });
    mo.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  /** 翻訳の材料を集める（開発用: tools の書き出しスクリプトが静的な HTML の鍵を集めるのに使う。置き換えと同じ決まりで分ける） */
  function collect(root) {
    const html = [];
    const text = [];
    const attr = [];
    const mixed = new Set(mixedBlocks(root));
    for (const el of mixed) html.push(normKey(el.innerHTML));
    const visit = (el) => {
      if (el.matches(SKIP) || mixed.has(el)) return;
      for (const a of ATTRS) { const v = el.getAttribute(a); if (v && CJK.test(v)) attr.push(v.trim()); }
      for (const c of el.childNodes) {
        if (c.nodeType === 3 && CJK.test(c.nodeValue)) text.push(normKey(c.nodeValue));
        else if (c.nodeType === 1) visit(c);
      }
    };
    visit(root);
    return { html, text, attr };
  }

  function setLang(l) {
    if (!LANGS[l] || l === lang) return;
    try { localStorage.setItem(KEY, l); } catch { /* 保存できない環境 */ }
    // ?lang= があると開き直した時にそちらが勝つので外す
    const url = new URL(location.href);
    url.searchParams.delete('lang');
    location.replace(url.toString());
  }

  SM.I18n = {
    lang, zh, LANGS, t: tr, card, cardSearchText, applyStatic, observe, collect, setLang,
    /** 中国語の表示で訳が見つからなかった文（開発用: コンソールで SuperMahjong.I18n.missing() ） */
    missing: () => [...missing],
  };
})();
