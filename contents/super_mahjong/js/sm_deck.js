// 部屋のルールの「カード枚数設定」: 山札に入れるカードと枚数を選ぶ画面
// ルールでは既定と違う枚数のカードだけを { カードID: 枚数 } で持つ（サーバーの sanitizeCardCounts と同じ）
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = 'super_mahjong_card_counts';   // 部屋を作る時の設定（CSVの並びが変わっても困らないようカードのkeyで覚える）
  const MAX = 30;
  const DECK_TYPES = ['event', 'power', 'happening', 'happeningPower'];
  const CARDS = (window.SM_CARDS || []).filter((c) => DECK_TYPES.includes(c.typeKey));
  const BY_ID = new Map(CARDS.map((c) => [c.id, c]));

  const countOf = (counts, c) => (counts && counts[c.id] !== undefined ? counts[c.id] : c.copies);

  /** 既定と同じ枚数のものを除き、0〜上限に収める */
  function clean(counts) {
    const out = {};
    for (const [id, v] of Object.entries(counts || {})) {
      const c = BY_ID.get(id);
      const n = Math.min(MAX, Math.max(0, Math.floor(Number(v))));
      if (c && Number.isFinite(n) && n !== c.copies) out[id] = n;
    }
    return out;
  }

  /** 山札の合計枚数（一局戦では四季折々は入らない） */
  function total(counts, rules) {
    return CARDS.reduce((a, c) => a + (c.name === '四季折々' && rules && rules.length === 'ikkyoku' ? 0 : countOf(counts, c)), 0);
  }

  /** ルールの一行説明用 */
  function summary(counts, rules) {
    const changed = Object.keys(counts || {}).length;
    return `山札${total(counts, rules)}枚${changed ? `（${changed}種類を変更）` : '（既定）'}`;
  }

  // 部屋を作る時の設定は覚えておく
  function loadSaved() {
    try {
      const raw = JSON.parse(SM.Net.store.get(STORE_KEY) || '{}');
      const out = {};
      for (const c of CARDS) if (raw[c.key] !== undefined) out[c.id] = raw[c.key];
      return clean(out);
    } catch { return {}; }
  }
  function save(counts) {
    const out = {};
    for (const [id, n] of Object.entries(counts)) out[BY_ID.get(id).key] = n;
    SM.Net.store.set(STORE_KEY, JSON.stringify(out));
  }

  // ---- 一覧の画面 ----
  let view = null;   // { counts, editable, onChange(counts), rules }

  /**
   * 一覧を開く。editable なら枚数を変えられ、変えるたびに onChange(既定と違う分だけの設定) を呼ぶ
   */
  function open(counts, o = {}) {
    view = { counts: { ...(counts || {}) }, editable: Boolean(o.editable), onChange: o.onChange || null, rules: o.rules || null };
    $('card-counts-filter').value = '';
    $('card-counts-reset').hidden = !view.editable;
    $('card-counts-zero').hidden = !view.editable;
    $('card-counts-note').textContent = view.editable
      ? 'カードを押すと、テキストを見ながら枚数を変えられます。0枚のカードは山札に入らず、ランダムにカードが出る効果でも出ません。'
      : '今の部屋の山札です（変えられるのはホストだけです）。';
    render();
    $('card-counts').hidden = false;
  }

  function close() {
    $('card-counts').hidden = true;
    view = null;
  }

  /** 見るだけで開いている時に、部屋の設定が変わったら描き直す */
  function refresh(counts, rules) {
    if (!view || view.editable) return;
    view.counts = { ...(counts || {}) };
    view.rules = rules || view.rules;
    render();
  }

  function set(c, n) {
    const v = Math.min(MAX, Math.max(0, n));
    if (v === c.copies) delete view.counts[c.id];
    else view.counts[c.id] = v;
    view.counts = clean(view.counts);
    if (view.onChange) view.onChange({ ...view.counts });
    render();
  }

  function render() {
    if (!view) return;
    const grid = $('card-counts-grid');
    grid.innerHTML = '';
    const q = $('card-counts-filter').value.trim();
    for (const c of CARDS) {
      if (q && !c.name.includes(q)) continue;
      const n = countOf(view.counts, c);
      const item = document.createElement('div');
      item.className = `card-count${n === 0 ? ' is-zero' : ''}${n !== c.copies ? ' is-changed' : ''}`;
      item.appendChild(SM.Cards.el(c.id, { size: 'mini', onClick: () => detail(c) }));
      const label = document.createElement('div');
      label.className = 'card-count__n';
      label.textContent = `${n}枚`;
      item.appendChild(label);
      grid.appendChild(item);
    }
    $('card-counts-total').textContent = summary(view.counts, view.rules);
    // すべて0枚の時だけ「すべて1枚にする」に切り替える
    $('card-counts-zero').textContent = allZero(view.counts) ? 'すべて1枚にする' : 'すべて0枚にする';
  }

  /** 山札に入るカードがすべて0枚か */
  function allZero(counts) {
    return CARDS.every((c) => countOf(counts, c) === 0);
  }

  /** すべてのカードを n 枚にする */
  function setAll(n) {
    if (!view || !view.editable) return;
    const out = {};
    for (const c of CARDS) out[c.id] = n;
    view.counts = clean(out);
    if (view.onChange) view.onChange({ ...view.counts });
    render();
  }

  /** カード（テキスト付き）を大きく出し、その下の −・＋ で枚数を変える */
  function detail(c) {
    const box = document.createElement('div');
    box.className = 'card-count-edit';
    const show = () => {
      box.innerHTML = '';
      const n = countOf(view.counts, c);
      if (!view.editable) {
        box.textContent = `山札に${n}枚`;
        return;
      }
      const minus = document.createElement('button');
      minus.className = 'card-count-edit__step';
      minus.textContent = '−';
      minus.disabled = n <= 0;
      minus.addEventListener('click', () => { set(c, n - 1); show(); });
      const num = document.createElement('span');
      num.className = 'card-count-edit__n';
      num.textContent = `${n}枚`;
      const plus = document.createElement('button');
      plus.className = 'card-count-edit__step';
      plus.textContent = '＋';
      plus.disabled = n >= MAX;
      plus.addEventListener('click', () => { set(c, n + 1); show(); });
      box.append(minus, num, plus);
      const def = document.createElement('div');
      def.className = 'card-count-edit__def';
      def.textContent = `既定は${c.copies}枚`;
      box.appendChild(def);
    };
    show();
    SM.Cards.showDetail(c.id, { extra: box });
  }

  function init() {
    $('card-counts-close').addEventListener('click', close);
    $('card-counts').addEventListener('click', (e) => { if (e.target.id === 'card-counts') close(); });
    $('card-counts-filter').addEventListener('input', render);
    $('card-counts-reset').addEventListener('click', () => {
      if (!view || !view.editable) return;
      view.counts = {};
      if (view.onChange) view.onChange({});
      render();
    });
    // すべて0枚にする（すべて0枚の時は、すべて1枚にする）
    $('card-counts-zero').addEventListener('click', () => {
      if (!view || !view.editable) return;
      setAll(allZero(view.counts) ? 1 : 0);
    });
  }

  SM.Deck = { init, open, close, refresh, summary, total, clean, loadSaved, save, MAX };
})();
