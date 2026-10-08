// デッキ構築戦のデッキ: 保存・検査・テキストの書き出し/読み込み・デッキ一覧とデッキ編集の画面
// 検査はサーバーの src/game/decks.js と同じ（定数・文言も同じ。変える時は両方を変える）
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);
  // 保存: [{ id, name, fp: カードのkey|null, cards: { カードのkey: 枚数 } }]（CSVの並びが変わっても困らないようkeyで覚える）
  const STORE_KEY = 'super_mahjong_decks';
  const PICK_KEY = 'super_mahjong_deck_pick';   // 待機室で使うデッキの id

  // 推奨ルール（サーバーの decks.js と同じ）
  const DECK_MIN = 60;
  const SAME_NAME_MAX = 3;
  const UNLIMITED_NAMES = ['カチコミ', '目からビーム', '否認'];
  const BANNED_NAMES = ['おばさん'];
  // 作りすぎを防ぐ上限（ルールではない）
  const COPY_MAX = 99;
  const TOTAL_MAX = 999;
  const NAME_MAX = 20;
  const TEXT_HEAD = 'スーパー麻雀デッキ';

  const DECK_TYPES = ['event', 'power', 'happening', 'happeningPower'];
  const ALL = window.SM_CARDS || [];
  const CARDS = ALL.filter((c) => DECK_TYPES.includes(c.typeKey));
  // 「ランダム」: 山札を作るたびに、使用不可のカード・ハプニング・デッキに入れたカード以外からランダムに選ばれる。何枚でも入れられる。
  // id はサーバーの decks.js の RANDOM_ID と同じ。カードと同じ見た目・詳細で出すため SM.Cards に登録する（initで）
  const RANDOM = {
    id: 'random', key: 'ランダム', name: 'ランダム', type: 'ランダム', typeKey: 'random', img: null, copies: 0,
    text: '■山札を作る時、使用不可のカード・ハプニング・このデッキに入れたカードを除いたカードから、ランダムに1枚選ばれる。（同じ山札の中では、ランダム同士で同じカードは出ない）\n■山札を作り直すたびに選び直す。\n■何枚でもデッキに入れられる。',
  };
  // デッキ編集に並べるもの（「ランダム」を先頭に）
  const EDIT_CARDS = [RANDOM, ...CARDS];
  /** 1種類に入れられる枚数の上限（「ランダム」はデッキの合計の上限まで） */
  const copyMax = (c) => (c === RANDOM ? TOTAL_MAX : COPY_MAX);
  // デッキのフルパワーとして選べるもの（《ネクロノミコン》のように、ゲーム開始時のフルパワーとして選べないものは除く）
  const FULLS = ALL.filter((c) => c.typeKey === 'full' && !c.text.includes('ゲーム開始時のフルパワーとして選べない'));
  const BY_ID = new Map([...ALL, RANDOM].map((c) => [c.id, c]));
  const BY_KEY = new Map([...ALL, RANDOM].map((c) => [c.key, c]));
  // 同じ名前のカードが何種類あるか（《プレゼント！》は4種類を合わせて3枚まで）
  const NAME_KINDS = new Map();
  for (const c of CARDS) NAME_KINDS.set(c.name, (NAME_KINDS.get(c.name) || 0) + 1);
  const isBanned = (c) => BANNED_NAMES.includes(c.name);

  // 読み込みでは表記ゆれ（空白・中黒・全角半角）を無視して探す。同じ名前のカードが何種類もある時は key（プレゼント！#2 など）で書く
  const norm = (s) => String(s).normalize('NFKC').replace(/[\s･・·]/g, '');
  const CARD_BY_NORM = new Map(EDIT_CARDS.map((c) => [norm(c.key), c]));
  const FULL_BY_NORM = new Map(FULLS.map((c) => [norm(c.key), c]));

  let decks = [];   // 保存してあるデッキ { id, name, fp: カードID|null, counts: { カードID: 枚数 } }
  const listeners = [];

  const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, NAME_MAX) || 'デッキ';
  const copyDeck = (d) => ({ ...d, counts: { ...d.counts } });
  const totalOf = (d) => Object.values(d.counts).reduce((a, n) => a + n, 0);
  const toast = (msg) => SM.Main.toast(msg);

  // ---- 保存 ----
  function fromStore(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const counts = {};
    for (const [key, v] of Object.entries(raw.cards || {})) {
      const c = BY_KEY.get(key);
      if (!c || !EDIT_CARDS.includes(c)) continue;
      const n = Math.min(copyMax(c), Math.floor(Number(v)));
      if (n > 0) counts[c.id] = n;
    }
    const fp = BY_KEY.get(raw.fp);
    return { id: String(raw.id || newId()), name: cleanName(raw.name), fp: fp && FULLS.includes(fp) ? fp.id : null, counts };
  }

  function toStore(d) {
    const cards = {};
    for (const c of EDIT_CARDS) if (d.counts[c.id] > 0) cards[c.key] = d.counts[c.id];
    return { id: d.id, name: d.name, fp: d.fp ? BY_ID.get(d.fp).key : null, cards };
  }

  function load() {
    try {
      const raw = JSON.parse(SM.Net.store.get(STORE_KEY) || '[]');
      decks = Array.isArray(raw) ? raw.map(fromStore).filter(Boolean) : [];
    } catch { decks = []; }
  }

  function persist() {
    SM.Net.store.set(STORE_KEY, JSON.stringify(decks.map(toStore)));
    for (const f of listeners) f();
  }

  /** 待機室で使うデッキ（消したデッキなら null） */
  function picked() {
    const id = SM.Net.store.get(PICK_KEY);
    return decks.find((d) => d.id === id) || null;
  }
  function setPicked(id) { SM.Net.store.set(PICK_KEY, id || ''); }

  // ---- 検査 ----
  /**
   * デッキの枚数と、部屋のルールで引っかかる所（サーバーの checkDeck と同じ）。problems が空なら使える。
   * rule: 'recommended'（推奨ルール）| 'free'（制限なし。フルパワーだけ見る）
   */
  function check(d, rule = 'recommended') {
    const total = totalOf(d);
    const problems = [];
    if (rule !== 'free') {
      if (total < DECK_MIN) problems.push(`${DECK_MIN}枚以上必要です（あと${DECK_MIN - total}枚）`);
      const byName = new Map();
      const banned = [];
      for (const c of CARDS) {
        const n = d.counts[c.id] || 0;
        if (!n) continue;
        byName.set(c.name, (byName.get(c.name) || 0) + n);
        if (isBanned(c) && !banned.includes(c.name)) banned.push(c.name);
      }
      for (const [name, n] of byName) {
        if (n <= SAME_NAME_MAX || UNLIMITED_NAMES.includes(name)) continue;
        problems.push(`《${name}》は${NAME_KINDS.get(name) > 1 ? '合わせて' : ''}${SAME_NAME_MAX}枚までです（${n}枚）`);
      }
      for (const name of banned) problems.push(`《${name}》は使えません`);
    }
    if (!d.fp) problems.push('フルパワーを選んでください');
    if (total > TOTAL_MAX) problems.push(`デッキは${TOTAL_MAX}枚までです`);
    return { total, problems };
  }

  /** 同じ名前のカードの合計枚数 */
  const sameNameCount = (d, c) => CARDS.reduce((a, x) => a + (x.name === c.name ? d.counts[x.id] || 0 : 0), 0);

  /** 推奨ルールで引っかかっているカードか（使えない・同名の上限を超えている） */
  function isOver(d, c) {
    if (!d.counts[c.id] || c === RANDOM) return false;
    if (isBanned(c)) return true;
    return !UNLIMITED_NAMES.includes(c.name) && sameNameCount(d, c) > SAME_NAME_MAX;
  }

  /** カードの詳細に出す、推奨ルールでの枚数の決まり */
  function limitText(c) {
    if (c === RANDOM) return '何枚でも入れられます（推奨ルールの60枚にも数えます）';
    if (isBanned(c)) return '推奨ルールでは使えません';
    if (UNLIMITED_NAMES.includes(c.name)) return '推奨ルールでも何枚でも入れられます';
    if (NAME_KINDS.get(c.name) > 1) return `推奨ルールでは《${c.name}》を合わせて${SAME_NAME_MAX}枚まで`;
    return `推奨ルールでは${SAME_NAME_MAX}枚まで`;
  }

  /**
   * 既定の山札から推奨ルールで使えないカードを除き、同名カードを推奨ルールの上限までにしたもの。
   * 上限を超える同名カードは番号（key の #n）の小さい方から残す（《プレゼント！》は蛇・正倉院・ロマノグリラ。CPUのデッキはランダムに3種類）
   */
  function defaultCounts() {
    const counts = {};
    for (const c of CARDS) if (!isBanned(c) && c.copies > 0) counts[c.id] = c.copies;
    const no = (c) => Number((/#(\d+)$/.exec(c.key) || [])[1] || 0);
    const groups = new Map();
    for (const c of CARDS) {
      if (!counts[c.id] || UNLIMITED_NAMES.includes(c.name)) continue;
      if (!groups.has(c.name)) groups.set(c.name, []);
      groups.get(c.name).push(c);
    }
    for (const group of groups.values()) {
      let room = SAME_NAME_MAX;
      for (const c of group.slice().sort((a, b) => no(a) - no(b))) {
        const n = Math.min(counts[c.id], room);
        room -= n;
        if (n) counts[c.id] = n;
        else delete counts[c.id];
      }
    }
    return counts;
  }

  /** サーバーに送る形 */
  const toServer = (d) => ({ name: d.name, counts: { ...d.counts }, fp: d.fp });

  // ---- テキストで書き出す・読み込む ----
  function toText(d) {
    const lines = [TEXT_HEAD, `名前: ${d.name}`, `フルパワー: ${d.fp ? BY_ID.get(d.fp).key : 'なし'}`];
    for (const c of EDIT_CARDS) if (d.counts[c.id] > 0) lines.push(`${c.key} ×${d.counts[c.id]}`);
    return lines.join('\n');
  }

  /** 書き出したテキストからデッキを作る。読めなかった行は unknown に入れる */
  function fromText(text) {
    const deck = { id: newId(), name: '読み込んだデッキ', fp: null, counts: {} };
    const unknown = [];
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || norm(line) === norm(TEXT_HEAD)) continue;
      let m = line.match(/^名前\s*[:：]\s*(.*)$/);
      if (m) { deck.name = cleanName(m[1]); continue; }
      m = line.match(/^フルパワー\s*[:：]\s*(.*)$/);
      if (m) {
        const f = FULL_BY_NORM.get(norm(m[1]));
        if (f) deck.fp = f.id;
        else if (m[1].trim() && m[1].trim() !== 'なし') unknown.push(line);
        continue;
      }
      // 「カード名 ×枚数」（× の代わりに x・* でもよい。枚数が無ければ1枚）
      m = line.normalize('NFKC').match(/^(.+?)\s*[×xX*✕]\s*(\d+)$/);
      const c = CARD_BY_NORM.get(norm(m ? m[1] : line));
      if (!c) { unknown.push(line); continue; }
      const n = m ? Number(m[2]) : 1;
      if (n > 0) deck.counts[c.id] = Math.min(copyMax(c), (deck.counts[c.id] || 0) + n);
    }
    return { deck, unknown };
  }

  // ---- デッキ一覧 ----
  function openList() {
    renderList();
    $('decks').hidden = false;
  }

  function smallButton(label, onClick, cls = 'small-button') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  /** デッキの一覧（ロビーの「デッキ構築」と、待機室から開くデッキ一覧の画面の両方） */
  function renderList() {
    for (const ul of document.querySelectorAll('[data-decks-list]')) fillList(ul);
  }

  function fillList(ul) {
    ul.innerHTML = '';
    if (!decks.length) {
      const li = document.createElement('li');
      li.className = 'deck-row deck-row--empty';
      li.textContent = 'まだデッキがありません。「新しいデッキ」か「既定の山札から作る」で作れます。';
      ul.appendChild(li);
    }
    for (const d of decks) {
      const { total, problems } = check(d);
      const li = document.createElement('li');
      li.className = 'deck-row';
      if (d.fp) li.appendChild(SM.Cards.el(d.fp, { size: 'mini', cls: 'deck-row__fp' }));
      else {
        const none = document.createElement('div');
        none.className = 'deck-row__fp deck-row__fp--none';
        none.textContent = 'フルパワー未選択';
        li.appendChild(none);
      }
      const info = document.createElement('div');
      info.className = 'deck-row__info';
      const name = document.createElement('div');
      name.className = 'deck-row__name';
      name.textContent = d.name;
      const sub = document.createElement('div');
      sub.className = 'deck-row__sub';
      sub.textContent = `${total}枚 / フルパワー: ${d.fp ? BY_ID.get(d.fp).name : 'なし'}`;
      const st = document.createElement('div');
      st.className = `deck-row__status ${problems.length ? 'is-ng' : 'is-ok'}`;
      st.textContent = problems.length ? `推奨ルールに合いません: ${problems.join(' / ')}` : '推奨ルールOK';
      const acts = document.createElement('div');
      acts.className = 'deck-row__actions';
      acts.append(
        smallButton('編集', () => openEdit(copyDeck(d))),
        smallButton('複製', () => duplicate(d)),
        smallButton('書き出す', () => openText('export', d)),
        smallButton('削除', () => remove(d)),
      );
      info.append(name, sub, st, acts);
      li.appendChild(info);
      ul.appendChild(li);
    }
  }

  function duplicate(d) {
    const c = copyDeck(d);
    c.id = newId();
    c.name = cleanName(`${d.name}のコピー`);
    decks.splice(decks.indexOf(d) + 1, 0, c);
    persist();
    renderList();
  }

  function remove(d) {
    if (!window.confirm(`デッキ「${d.name}」を削除しますか？`)) return;
    decks = decks.filter((x) => x !== d);
    persist();
    renderList();
  }

  // ---- デッキ編集 ----
  let edit = null;   // { deck: 編集中のコピー, dirty }

  /** デッキ編集を開く。msg は上に出しておく知らせ（読み込めなかった行など） */
  function openEdit(deck, msg = '') {
    edit = { deck, dirty: false };
    $('deck-edit-msg').textContent = msg;
    $('deck-edit-msg').hidden = !msg;
    $('deck-edit-name').value = deck.name;
    $('deck-edit-filter').value = '';
    $('deck-edit-only').checked = totalOf(deck) > 0;
    renderGrid();
    renderSummary();
    $('deck-edit').hidden = false;
    $('deck-edit-grid').scrollTop = 0;
  }

  function closeEdit() {
    $('deck-edit').hidden = true;
    $('deck-fp').hidden = true;
    edit = null;
  }

  function saveEdit() {
    if (!edit) return;
    const d = copyDeck(edit.deck);
    d.name = cleanName($('deck-edit-name').value);
    const i = decks.findIndex((x) => x.id === d.id);
    if (i >= 0) decks[i] = d;
    else decks.push(d);
    persist();
    closeEdit();
    renderList();
    toast(`デッキ「${d.name}」を保存しました`);
  }

  function cancelEdit() {
    if (edit && edit.dirty && !window.confirm('変更を保存せずに閉じますか？')) return;
    closeEdit();
  }

  /** カードの枚数を変える（0〜上限。合計も上限まで） */
  function setCount(c, n) {
    if (!edit) return;
    const d = edit.deck;
    const cur = d.counts[c.id] || 0;
    const room = TOTAL_MAX - (totalOf(d) - cur);
    const v = Math.max(0, Math.min(copyMax(c), room, n));
    if (v === cur) return;
    if (v) d.counts[c.id] = v;
    else delete d.counts[c.id];
    edit.dirty = true;
    repaintGrid();
    renderSummary();
  }

  function renderGrid() {
    const grid = $('deck-edit-grid');
    grid.innerHTML = '';
    const q = norm($('deck-edit-filter').value);
    const only = $('deck-edit-only').checked;
    for (const c of EDIT_CARDS) {
      if (only && !edit.deck.counts[c.id]) continue;
      if (q && !norm(c.name).includes(q)) continue;
      grid.appendChild(gridItem(c));
    }
    if (!grid.childNodes.length) {
      const p = document.createElement('p');
      p.className = 'deck-edit__empty';
      p.textContent = only && !q ? 'まだカードを入れていません。「入れたカードだけ」を外すと、すべてのカードから選べます。' : '見つかりません';
      grid.appendChild(p);
    }
    repaintGrid();
  }

  function gridItem(c) {
    const box = document.createElement('div');
    box.className = 'card-count deck-card';
    box.dataset.cid = c.id;
    box.appendChild(SM.Cards.el(c.id, { size: 'mini', onClick: () => detail(c) }));
    if (isBanned(c)) {
      const tag = document.createElement('span');
      tag.className = 'deck-card__tag';
      tag.textContent = '使用不可';
      box.appendChild(tag);
    }
    const ctrl = document.createElement('div');
    ctrl.className = 'deck-card__ctrl';
    const minus = smallButton('−', () => setCount(c, (edit.deck.counts[c.id] || 0) - 1), 'deck-card__step');
    minus.dataset.step = '-1';
    const num = document.createElement('span');
    num.className = 'card-count__n';
    const plus = smallButton('＋', () => setCount(c, (edit.deck.counts[c.id] || 0) + 1), 'deck-card__step');
    plus.dataset.step = '1';
    ctrl.append(minus, num, plus);
    box.appendChild(ctrl);
    return box;
  }

  /** 一覧の枚数・色だけを描き直す（並びは変えないので、押している途中にカードが動かない） */
  function repaintGrid() {
    if (!edit) return;
    const d = edit.deck;
    const full = totalOf(d) >= TOTAL_MAX;
    for (const box of $('deck-edit-grid').querySelectorAll('.deck-card')) {
      const c = BY_ID.get(box.dataset.cid);
      const n = d.counts[c.id] || 0;
      box.classList.toggle('is-zero', n === 0);
      box.classList.toggle('is-over', isOver(d, c));
      box.querySelector('.card-count__n').textContent = `${n}枚`;
      box.querySelector('[data-step="-1"]').disabled = n <= 0;
      box.querySelector('[data-step="1"]').disabled = n >= copyMax(c) || full;
    }
  }

  function renderSummary() {
    const d = edit.deck;
    const { total, problems } = check(d);
    const by = { event: 0, power: 0, happening: 0 };
    for (const c of CARDS) {
      const n = d.counts[c.id] || 0;
      if (c.typeKey === 'event') by.event += n;
      else if (c.typeKey === 'power') by.power += n;
      else by.happening += n;
    }
    const random = d.counts[RANDOM.id] || 0;
    $('deck-edit-total').textContent = `${total}枚`;
    $('deck-edit-types').textContent = `イベント${by.event}・パワー${by.power}・ハプニング${by.happening}${random ? `・ランダム${random}` : ''}`;
    const st = $('deck-edit-check');
    st.className = `deck-edit__check ${problems.length ? 'is-ng' : 'is-ok'}`;
    st.textContent = problems.length ? `推奨ルールに合いません: ${problems.join(' / ')}` : '推奨ルールOK';
    const fp = $('deck-edit-fp');
    fp.innerHTML = '';
    if (d.fp) {
      fp.appendChild(SM.Cards.el(d.fp, { size: 'tiny', detail: false }));
      fp.append(`フルパワー: ${BY_ID.get(d.fp).name}`);
    } else fp.textContent = 'フルパワーを選ぶ';
    fp.classList.toggle('is-none', !d.fp);
    $('deck-edit-zero').disabled = total === 0;
  }

  /** カード（テキスト付き）を大きく出し、その下の −・＋ で枚数を変える */
  function detail(c) {
    const box = document.createElement('div');
    box.className = 'card-count-edit';
    const show = () => {
      box.innerHTML = '';
      if (!edit) return;
      const n = edit.deck.counts[c.id] || 0;
      const minus = smallButton('−', () => { setCount(c, n - 1); show(); }, 'card-count-edit__step');
      minus.disabled = n <= 0;
      const num = document.createElement('span');
      num.className = 'card-count-edit__n';
      num.textContent = `${n}枚`;
      const plus = smallButton('＋', () => { setCount(c, n + 1); show(); }, 'card-count-edit__step');
      plus.disabled = n >= copyMax(c) || totalOf(edit.deck) >= TOTAL_MAX;
      const note = document.createElement('div');
      note.className = `card-count-edit__def${isOver(edit.deck, c) ? ' is-over' : ''}`;
      note.textContent = limitText(c);
      box.append(minus, num, plus, note);
    };
    show();
    SM.Cards.showDetail(c.id, { extra: box });
  }

  // ---- フルパワーを選ぶ ----
  function openFp() {
    const grid = $('deck-fp-grid');
    grid.innerHTML = '';
    for (const c of FULLS) {
      const el = SM.Cards.el(c.id, {
        size: 'mini',
        cls: edit && edit.deck.fp === c.id ? 'is-current' : '',
        onClick: () => SM.Cards.showDetail(c.id, { actions: [{ label: 'これに決める', onClick: () => chooseFp(c.id) }] }),
      });
      grid.appendChild(el);
    }
    $('deck-fp').hidden = false;
  }

  function chooseFp(cid) {
    if (!edit) return;
    edit.deck.fp = cid;
    edit.dirty = true;
    $('deck-fp').hidden = true;
    renderSummary();
  }

  // ---- テキストで書き出す・読み込む ----
  let textMode = null;   // 'export' | 'import'

  function openText(mode, d) {
    textMode = mode;
    const area = $('deck-text-area');
    if (mode === 'export') {
      $('deck-text-title').textContent = `デッキ「${d.name}」を書き出す`;
      $('deck-text-note').textContent = 'このテキストを送ると、受け取った人は「読み込む」で同じデッキを作れます。';
      area.value = toText(d);
      area.readOnly = true;
      $('deck-text-ok').textContent = 'コピーする';
    } else {
      $('deck-text-title').textContent = 'デッキを読み込む';
      $('deck-text-note').textContent = '書き出したデッキのテキストを貼り付けてください（「カード名 ×枚数」を1行ずつ）。';
      area.value = '';
      area.readOnly = false;
      $('deck-text-ok').textContent = '読み込む';
    }
    $('deck-text').hidden = false;
  }

  function copyText() {
    const area = $('deck-text-area');
    const fallback = () => {
      area.focus();
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      toast(ok ? 'コピーしました' : 'テキストを選んでコピーしてください');
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(area.value).then(() => toast('コピーしました'), fallback);
    else fallback();
  }

  function importText() {
    const { deck, unknown } = fromText($('deck-text-area').value);
    if (!totalOf(deck) && !deck.fp) {
      toast('デッキのテキストが読み取れませんでした');
      return;
    }
    $('deck-text').hidden = true;
    openEdit(deck, unknown.length ? `読み込めなかった行（${unknown.length}行）: ${unknown.join('、')}` : '読み込みました。確かめて「保存」を押してください。');
    edit.dirty = true;
  }

  /** 対局が始まった時など: 開いている画面を閉じる（編集中の変更は保存しておく） */
  function close() {
    if (edit && edit.dirty) saveEdit();
    closeEdit();
    $('decks').hidden = true;
    $('deck-text').hidden = true;
  }

  function init() {
    SM.Cards.register(RANDOM);
    load();
    $('decks-close').addEventListener('click', () => { $('decks').hidden = true; });
    $('decks').addEventListener('click', (e) => { if (e.target.id === 'decks') $('decks').hidden = true; });
    // 新しいデッキ・既定の山札から作る・読み込む（ロビーの「デッキ構築」とデッキ一覧の画面の両方のボタン）
    const acts = {
      new: () => openEdit({ id: newId(), name: '新しいデッキ', fp: null, counts: {} }),
      'new-default': () => openEdit({ id: newId(), name: '既定の山札', fp: null, counts: defaultCounts() }),
      import: () => openText('import'),
    };
    for (const b of document.querySelectorAll('[data-deck-act]')) b.addEventListener('click', () => acts[b.dataset.deckAct]());
    $('deck-edit-save').addEventListener('click', saveEdit);
    $('deck-edit-cancel').addEventListener('click', cancelEdit);
    $('deck-edit-name').addEventListener('input', () => { if (edit) edit.dirty = true; });
    $('deck-edit-filter').addEventListener('input', renderGrid);
    $('deck-edit-only').addEventListener('change', renderGrid);
    $('deck-edit-fp').addEventListener('click', openFp);
    $('deck-edit-zero').addEventListener('click', () => {
      if (!edit || !window.confirm('デッキのカードをすべて0枚にしますか？')) return;
      edit.deck.counts = {};
      edit.dirty = true;
      $('deck-edit-only').checked = false;
      renderGrid();
      renderSummary();
    });
    $('deck-fp-close').addEventListener('click', () => { $('deck-fp').hidden = true; });
    $('deck-fp').addEventListener('click', (e) => { if (e.target.id === 'deck-fp') $('deck-fp').hidden = true; });
    $('deck-text-cancel').addEventListener('click', () => { $('deck-text').hidden = true; });
    $('deck-text').addEventListener('click', (e) => { if (e.target.id === 'deck-text') $('deck-text').hidden = true; });
    $('deck-text-ok').addEventListener('click', () => (textMode === 'export' ? copyText() : importText()));
    renderList();
  }

  SM.Decks = {
    init, openList, renderList, close, check, picked, setPicked, toServer, toText, fromText,
    list: () => decks.slice(),
    onChange: (f) => listeners.push(f),
  };
})();
