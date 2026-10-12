// ロビー（名前・部屋作成・参加）と待機室
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);

  const TIME_OPTIONS = [[0, '無制限'], [10, '10秒'], [15, '15秒'], [20, '20秒'], [30, '30秒'], [60, '60秒']];
  const BANK_OPTIONS = [[0, 'なし'], [30, '30秒'], [60, '60秒'], [120, '120秒'], [300, '300秒']];
  // 部屋のコードにこれを入れて参加すると、実績とミッションをすべて開放する（サーバーの room.js の RESERVED_CODES）
  const UNLOCK_ALL_CODE = 'CMPLT';

  // 山札のカード枚数（既定と違う分だけ）。部屋を作る時の設定は覚えておき、待機室では部屋の設定を使う
  const counts = { create: {}, room: {} };

  // カスタムモードのルール（サーバーの src/game/rules.js の CUSTOM_DECKS・CUSTOM_FLAGS と同じキー）: [キー, 名前, 説明, 赤文字]。
  // デッキの決め方は必ずどれか1つ。中身はガイドの「6. 対戦の形式」とサーバーの docs/card_rules.md の「カスタムモード」。
  // サドンデス〜ヤギは赤文字で出す
  const CUSTOM_DECKS = [
    ['kyouran', '狂乱', '全カードが既定の枚数入ったデッキを使う'],
    ['duelist', 'デュエリスト', '自分のデッキを選んで対局する'],
    ['draft', 'ドラフト', '5枚のフルパワーから1つ選び、3つの5枚セットから1つ選ぶのを8回。選んだカードがデッキ'],
    ['afo', 'オールフォーワン', 'ハプニング以外のカードを1枚選び、そのカードだけのデッキを使う'],
  ];
  const CUSTOM_FLAGS = [
    ['zero', '殿堂ゼロ', '使用不可のカードも使える'],
    ['redout', 'レッドアウト', '使うすべての牌が赤ドラ'],
    ['throttle', 'フルスロットル', '毎手番、上限までカードを引き、何枚でもプレイできる'],
    ['limitBreak', 'リミットブレイク', '手札とパワーの上限が両方8'],
    ['dual', 'デュアルショック', 'すべての牌が8枚ずつ'],
    ['mangan', '満貫全席', '翻数がいつも+4（役にはならない）'],
    ['transparent', '限りなく透明に近い', '白のかわりにオールマイティ牌を使う'],
    ['moronori', 'モロノリ', 'ポン・チーでも新ドラをめくる'],
    ['aotenjou', '青天井', '点数を上限なしで計算する（飛びなし）'],
    ['monju', '文殊の知恵', 'フルパワーを3つ選ぶ'],
    ['suddenDeath', 'サドンデス', '全員0点で開始する', true],
    ['cursed', 'のろわれボディ', 'フルパワーがネクロノミコンになる', true],
    ['shoba', 'ショバ代', '普通に捨牌するたびに200点供託する', true],
    ['iidaku', '唯々諾々', 'カードが打ち消されない', true],
    ['sokudan', '即断即決', '手番やカード処理の制限時間が5秒', true],
    ['yakubi', '厄日', '配牌に面子が来ない。九種九牌もできない', true],
    ['yagi', 'ヤギ', '全員の場にヤギがある状態で局が始まる', true],
  ];
  const customOf = (r) => (r && r.mode === 'custom' && r.cards !== false && r.custom ? r.custom : null);
  /** カスタムモードのルールの名前の並び（デッキの決め方が先） */
  function customNames(c) {
    const deck = CUSTOM_DECKS.find(([k]) => k === c.deck) || CUSTOM_DECKS[0];
    return [deck[1], ...CUSTOM_FLAGS.filter(([k]) => c[k]).map(([, name]) => name)];
  }

  /** カスタムモードのルールのチェックボックスを作る（デッキの決め方は必ず1つ: 押したものだけを選び、選んでいるものは外せない） */
  function buildCustom(prefix) {
    const box = $(`${prefix}-custom`);
    box.innerHTML = '';
    const group = (title, list, attr) => {
      const g = document.createElement('div');
      g.className = 'custom-rules__group';
      const h = document.createElement('div');
      h.className = 'custom-rules__title';
      h.textContent = title;
      g.appendChild(h);
      for (const [key, name, desc, red] of list) {
        const label = document.createElement('label');
        label.className = `custom-rule${red ? ' is-red' : ''}`;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset[attr] = key;
        const text = document.createElement('span');
        text.className = 'custom-rule__text';
        const nm = document.createElement('span');
        nm.className = 'custom-rule__name';
        nm.textContent = name;
        const d = document.createElement('span');
        d.className = 'custom-rule__desc';
        d.textContent = desc;
        text.append(nm, d);
        label.append(cb, text);
        g.appendChild(label);
      }
      box.appendChild(g);
    };
    group('デッキの決め方（どれか1つ）', CUSTOM_DECKS, 'deck');
    group('ルール', CUSTOM_FLAGS, 'flag');
    box.querySelector('[data-deck]').checked = true;
    // フォームの change（ルールを送る）より先に、デッキの決め方を1つにそろえる
    box.addEventListener('change', (e) => {
      const cb = e.target;
      if (!cb.dataset || !cb.dataset.deck) return;
      if (!cb.checked) { cb.checked = true; return; }
      for (const x of box.querySelectorAll('[data-deck]')) if (x !== cb) x.checked = false;
    });
  }

  function readCustom(prefix) {
    const box = $(`${prefix}-custom`);
    const sel = box.querySelector('[data-deck]:checked');
    const c = { deck: sel ? sel.dataset.deck : 'kyouran' };
    for (const cb of box.querySelectorAll('[data-flag]')) c[cb.dataset.flag] = cb.checked;
    return c;
  }

  function writeCustom(prefix, c) {
    const box = $(`${prefix}-custom`);
    const cx = c || {};
    for (const cb of box.querySelectorAll('[data-deck]')) cb.checked = cb.dataset.deck === (cx.deck || 'kyouran');
    for (const cb of box.querySelectorAll('[data-flag]')) cb.checked = Boolean(cx[cb.dataset.flag]);
  }

  function fillSelect(sel, opts) {
    sel.innerHTML = opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  }

  function readRules(prefix) {
    const f = (n) => $(`${prefix}-${n}`);
    return {
      players: Number(f('players').value),
      length: f('length').value,
      red: f('red').checked,
      kuitan: f('kuitan').checked,
      startPoints: Number(f('start').value),
      tobi: f('tobi').checked,
      renchan: f('renchan').checked,
      cFull: f('cfull').checked,
      perTurn: Number(f('perturn').value),
      bank: Number(f('bank').value),
      cardCounts: counts[prefix],
      mode: f('mode').value,
      deckRule: f('deckrule').value,
      // この部屋で使えるCカード: 部屋を作った人（ホスト）がミッションをクリアして解放したもの
      cUnlocked: SM.Missions.unlockedCIds(),
      custom: readCustom(prefix),
    };
  }

  function writeRules(prefix, r) {
    const f = (n) => $(`${prefix}-${n}`);
    f('players').value = String(r.players);
    f('length').value = r.length;
    f('red').checked = r.red;
    f('kuitan').checked = r.kuitan;
    f('start').value = String(r.startPoints);
    f('tobi').checked = r.tobi;
    f('renchan').checked = Boolean(r.renchan);
    f('cfull').checked = Boolean(r.cFull);
    f('perturn').value = String(r.perTurn);
    f('bank').value = String(r.bank);
    f('mode').value = ['deck', 'custom'].includes(r.mode) ? r.mode : 'normal';
    f('deckrule').value = r.deckRule === 'free' ? 'free' : 'recommended';
    writeCustom(prefix, r.custom);
    applyMode(prefix);
  }

  /**
   * 対戦形式に合わせて項目を出し分ける（デッキ構築戦はデッキの制限を選び、カード枚数設定・Cフルパワーの選択は使わない。
   * カスタムはカスタムのルールを選ぶ。青天井は飛びなし、即断即決は1手の時間・持ち時間、レッドアウトは赤ドラ、サドンデスは持ち点の設定を使わない）
   */
  function applyMode(prefix) {
    const mode = $(`${prefix}-mode`).value;
    const deck = mode === 'deck';
    const custom = mode === 'custom';
    $(`${prefix}-deckrule-label`).hidden = !deck;
    $(`${prefix}-cfull-label`).hidden = deck || custom;
    $(`${prefix}-card-counts`).parentElement.hidden = deck || custom;
    $(`${prefix}-custom`).hidden = !custom;
    const c = custom ? readCustom(prefix) : {};
    const tobi = $(`${prefix}-tobi`);
    tobi.disabled = Boolean(c.aotenjou);
    if (c.aotenjou) tobi.checked = false;
    $(`${prefix}-perturn`).disabled = Boolean(c.sokudan);
    $(`${prefix}-bank`).disabled = Boolean(c.sokudan);
    $(`${prefix}-red`).disabled = Boolean(c.redout);
    $(`${prefix}-start`).disabled = Boolean(c.suddenDeath);
  }

  function showCountsText(prefix) {
    $(`${prefix}-card-counts-text`).textContent = SM.Deck.summary(counts[prefix], readRules(prefix));
  }

  function setupRuleForm(prefix, onChange) {
    fillSelect($(`${prefix}-perturn`), TIME_OPTIONS);
    fillSelect($(`${prefix}-bank`), BANK_OPTIONS);
    buildCustom(prefix);
    $(`${prefix}-players`).addEventListener('change', () => {
      $(`${prefix}-start`).value = $(`${prefix}-players`).value === '3' ? '45000' : '35000';
    });
    const form = $(`${prefix}-form`);
    form.addEventListener('change', () => {
      applyMode(prefix);
      showCountsText(prefix);
      if (onChange) onChange(readRules(prefix));
    });
    applyMode(prefix);
    // カード枚数設定: カードの一覧から枚数を変える
    $(`${prefix}-card-counts`).addEventListener('click', () => SM.Deck.open(counts[prefix], {
      editable: true,
      rules: readRules(prefix),
      onChange: (c) => {
        counts[prefix] = c;
        if (prefix === 'create') SM.Deck.save(c);
        showCountsText(prefix);
        if (onChange) onChange(readRules(prefix));
      },
    }));
  }

  function rulesText(r) {
    const cx = customOf(r);
    const t = cx && cx.sokudan ? '制限時間5秒（即断即決）' : r.perTurn ? `1手${r.perTurn}秒${r.bank ? `+持ち時間${r.bank}秒` : ''}` : '時間無制限';
    const deckMode = (r.mode === 'deck' && r.cards !== false) || Boolean(cx);
    return [
      ...(r.mode === 'deck' && r.cards !== false ? [`デッキ構築戦（${r.deckRule === 'free' ? '制限なし' : '推奨ルール'}）`] : []),
      ...(cx ? [`カスタム（${customNames(cx).join('・')}）`] : []),
      `${r.players === 3 ? '三麻（チーなし・北抜きあり・ツモ損）' : '四麻'}`,
      { ikkyoku: '一局戦', tonpuu: '東風戦', hanchan: '半荘戦' }[r.length] || '半荘戦',
      cx && cx.suddenDeath ? '0点持ち（サドンデス）' : `${r.startPoints}点持ち`,
      r.red ? '赤あり' : '赤なし',
      r.kuitan ? '喰いタンあり' : '喰いタンなし',
      r.tobi ? '飛びあり' : '飛びなし',
      r.renchan ? '連荘あり' : '連荘なし',
      t,
      ...(deckMode ? [] : [r.cards === false ? 'カードなし' : SM.Deck.summary(r.cardCounts, r)]),
      ...(deckMode || !r.cFull ? [] : ['Cフルパワーあり']),
    ].join(' / ');
  }

  function init() {
    const nameInput = $('lobby-name');
    nameInput.value = SM.Net.getName();
    nameInput.addEventListener('change', () => SM.Net.setName(nameInput.value.trim().slice(0, 12)));
    // アイコン: カードのイラストから選ぶ（初めての時はランダム）
    const iconBtn = $('lobby-icon');
    const showIcon = () => { iconBtn.innerHTML = ''; iconBtn.appendChild(SM.Icons.el(SM.Icons.mine())); };
    showIcon();
    iconBtn.addEventListener('click', () => SM.Icons.openPicker((id) => { showIcon(); SM.Net.setIcon(id); }));

    counts.create = SM.Deck.loadSaved();
    setupRuleForm('create');
    setupRuleForm('room', (rules) => SM.Net.send({ type: 'setRules', rules }));
    showCountsText('create');
    // ホスト以外は山札のカードを見るだけ
    $('room-card-counts-show').addEventListener('click', () => SM.Deck.open(counts.room, { editable: false, rules: lastRules }));

    $('btn-create').addEventListener('click', () => {
      SM.Net.setName(nameInput.value.trim().slice(0, 12));
      SM.Net.send({ type: 'createRoom', rules: readRules('create') });
    });
    const join = () => {
      const code = $('join-code').value.trim().toUpperCase();
      if (!code) return;
      // 「CMPLT」: 部屋には入らず、実績をすべて達成にし、ミッションをすべてクリア済みにする（ネームドCPU・Cカードも解放される。
      // サーバーはこのコードの部屋を作らない）
      if (code === UNLOCK_ALL_CODE) {
        SM.Achievements.unlockAll(SM.Missions.allIds());
        $('join-code').value = '';
        SM.Main.toast('実績とミッションをすべて開放しました');
        return;
      }
      SM.Net.setName(nameInput.value.trim().slice(0, 12));
      // 自分がミッションで解放したCカードも送る（カスタムモードの殿堂ゼロで、自分が選ぶカード・フルパワーに使う）
      SM.Net.send({ type: 'joinRoom', code, cUnlocked: SM.Missions.unlockedCIds() });
    };
    $('btn-join').addEventListener('click', join);
    $('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

    const q = new URLSearchParams(location.search).get('room');
    if (q) $('join-code').value = q.toUpperCase();
    // メニュー: 前に開いていたものを開く（招待リンクで来た時は対戦）
    for (const b of document.querySelectorAll('.menu-tab')) b.addEventListener('click', () => showTab(b.dataset.tab));
    showTab(q ? 'play' : SM.Net.store.get(TAB_KEY) || 'play');

    $('btn-reset-data').addEventListener('click', resetSavedData);
    // 操作しながら覚えるチュートリアル（ガイドと、対戦タブの案内から）
    for (const b of document.querySelectorAll('[data-tutorial-start]')) b.addEventListener('click', () => SM.Tutorial.start());
    // 対戦タブのチュートリアルの誘導: 一度でも遊んだ人、「非表示にする」を押した人には出さない
    const hintBox = document.querySelector('.tutorial-hint');
    if (SM.Net.store.get('super_mahjong_tutorial_done') || SM.Net.store.get('super_mahjong_tutorial_hint_off')) hintBox.hidden = true;
    $('tutorial-hint-hide').addEventListener('click', () => {
      SM.Net.store.set('super_mahjong_tutorial_hint_off', '1');
      hintBox.hidden = true;
      SM.Main.toast('チュートリアルはガイドからいつでもプレイできます');
    });
    $('btn-leave').addEventListener('click', () => SM.Net.send({ type: 'leaveRoom' }));
    $('btn-start').addEventListener('click', () => SM.Net.send({ type: 'startGame' }));
    // デッキ構築戦: 自分のデッキを選ぶ
    $('room-deck-select').addEventListener('change', (e) => {
      const d = SM.Decks.list().find((x) => x.id === e.target.value) || null;
      SM.Decks.setPicked(d ? d.id : '');
      sendDeck(d);
    });
    $('room-deck-edit').addEventListener('click', () => SM.Decks.openList());
    // 使っているデッキを編集・削除したら、席のデッキも送り直す（待機室にいる時だけ）
    SM.Decks.onChange(() => {
      const room = SM.Main.state.room;
      if (!lastRoom || !room || room.state !== 'waiting' || !usesDeckSelect(room.rules)) return;
      sendDeck(SM.Decks.picked());
      renderRoom(room);
    });
    const leftRoom = () => { lastRoom = null; deckSentKey = null; };
    SM.Net.on('lobby', leftRoom);
    SM.Net.on('kicked', leftRoom);
    $('btn-copy-link').addEventListener('click', () => {
      const url = `${location.origin}${location.pathname}?room=${$('room-code').textContent}`;
      const done = () => SM.Main.toast('招待リンクをコピーしました');
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt('招待リンク', url));
      else prompt('招待リンク', url);
    });
  }

  // ---- メニュー（対戦・デッキ構築・実績…）: 押すと下の中身が切り替わる。準備中のものは HTML で disabled ----
  const TAB_KEY = 'super_mahjong_tab';
  function showTab(name) {
    const tab = document.querySelector(`.menu-tab[data-tab="${name}"]`);
    const open = tab && !tab.disabled ? name : 'play';
    for (const b of document.querySelectorAll('.menu-tab')) {
      b.classList.toggle('is-active', b.dataset.tab === open);
      b.setAttribute('aria-pressed', String(b.dataset.tab === open));
    }
    for (const p of document.querySelectorAll('.tab-panel')) p.hidden = p.dataset.panel !== open;
    SM.Net.store.set(TAB_KEY, open);
    if (open === 'missions') SM.Missions.render();
    if (open === 'decks') SM.Decks.renderList();
    if (open === 'achievements') SM.Achievements.render();
    if (open === 'cards') SM.CardList.show();
    if (open === 'stats') SM.Stats.render();
    if (open === 'ranking') SM.Ranking.render();
    if (open === 'tutorial') linkTutorial();
  }

  /** このブラウザに保存した super_mahjong_ のデータをすべて消して、読み込み直す（最初の状態に戻す） */
  function resetSavedData() {
    if (!confirm('保存しているデータ（名前・アイコン・デッキ・実績・統計・各種設定など）をすべて削除します。元には戻せません。よろしいですか？')) return;
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      for (const k of keys) if (k && k.startsWith('super_mahjong_')) localStorage.removeItem(k);
    } catch { /* 保存できない環境 */ }
    location.href = location.pathname;
  }

  /** チュートリアルの本文の《カード名》を、押すとカード詳細が出る印にする（初めて開いた時だけ） */
  let tutorialLinked = false;
  function linkTutorial() {
    if (tutorialLinked) return;
    tutorialLinked = true;
    const walker = document.createTreeWalker(document.querySelector('[data-panel="tutorial"]'), NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) if (walker.currentNode.nodeValue.includes('《')) texts.push(walker.currentNode);
    for (const t of texts) {
      const span = document.createElement('span');
      SM.Cards.linkify(span, t.nodeValue);
      t.replaceWith(span);
    }
  }

  const isDeckMode = (r) => r.mode === 'deck' && r.cards !== false;
  /** 待機室で自分のデッキを選ぶ部屋か（デッキ構築戦と、カスタムモードのデュエリスト） */
  const usesDeckSelect = (r) => isDeckMode(r) || Boolean(customOf(r) && customOf(r).deck === 'duelist');
  /** デッキの検査のルール（サーバーの decks.js の deckRuleOf と同じ。カスタムモードは殿堂ゼロなら 'zero'、それ以外は推奨ルール） */
  const deckRuleOf = (r) => { const c = customOf(r); if (c) return c.zero ? 'zero' : 'recommended'; return r.deckRule === 'free' ? 'free' : 'recommended'; };
  const sendDeck = (d) => SM.Net.send({ type: 'setDeck', deck: d ? SM.Decks.toServer(d) : null });

  /** 席ごとのデッキの準備（デッキ構築戦。他の人のデッキは名前・枚数・使えるかだけ） */
  function deckLine(s) {
    const el = document.createElement('span');
    el.className = 'seat-row__deck';
    const d = s.deck;
    if (s.kind === 'cpu') el.textContent = `デッキ: ${d ? `${d.name}（${d.total}枚）` : '既定の山札'}`;
    else if (!d) {
      el.textContent = 'デッキ未選択';
      el.classList.add('is-ng');
    } else {
      el.textContent = `デッキ: ${d.name}（${d.total}枚）${d.ok ? ' 準備OK' : ' 部屋のルールに合いません'}`;
      el.classList.add(d.ok ? 'is-ok' : 'is-ng');
    }
    return el;
  }

  // 自分のデッキを選ぶ欄
  let deckOptionsKey = '';
  let deckSentKey = null;   // 自動で送ったデッキ（送っても席に反映されない時に、何度も送らないため）
  function renderMyDeck(room) {
    const box = $('room-deck');
    box.hidden = !usesDeckSelect(room.rules) || room.you < 0;
    if (box.hidden) return;
    const mine = room.seats[room.you];
    const list = SM.Decks.list();
    let pick = SM.Decks.picked();
    // まだ選んでいなければ、部屋のルールで使えるデッキを選んでおく（Cカードは自分が解放したもの。ホストが解放していなくてもよい）
    const checkRoom = (d) => SM.Decks.check(d, deckRuleOf(room.rules));
    if (!pick) {
      pick = list.find((d) => !checkRoom(d).problems.length) || null;
      if (pick) SM.Decks.setPicked(pick.id);
    }
    const opts = (pick ? [] : [['', list.length ? '（デッキを選ぶ）' : '（デッキがありません）']]).concat(list.map((d) => {
      const { total, problems } = checkRoom(d);
      return [d.id, `${problems.length ? '✗' : '✓'} ${d.name}（${total}枚）`];
    }));
    const sel = $('room-deck-select');
    const key = JSON.stringify(opts);
    if (key !== deckOptionsKey) {
      deckOptionsKey = key;
      sel.innerHTML = '';
      for (const [v, t] of opts) {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = t;
        sel.appendChild(o);
      }
    }
    sel.value = pick ? pick.id : '';
    // 席にまだデッキが無ければ、選んであるデッキを送る
    if (mine.deck) deckSentKey = null;
    else if (pick && deckSentKey !== `${room.code}:${pick.id}`) {
      deckSentKey = `${room.code}:${pick.id}`;
      sendDeck(pick);
    }
    const st = $('room-deck-status');
    const d = mine.deck;
    st.className = `room-deck__status ${d && d.ok ? 'is-ok' : 'is-ng'}`;
    if (!list.length && !d) st.textContent = 'デッキがありません。「作る・編集」で作ってください。';
    else if (!d) st.textContent = 'デッキを選んでください';
    else if (d.ok) st.textContent = `「${d.name}」（${d.total}枚）で準備OK`;
    else st.textContent = `部屋のルールに合いません: ${(d.problems || []).join(' / ')}`;
  }

  let lastRules = null;
  let lastRoom = null;
  function renderRoom(room) {
    lastRoom = room;
    $('room-code').textContent = room.code;
    $('room-rules-text').textContent = rulesText(room.rules);
    const host = room.youAreHost;
    const deckMode = usesDeckSelect(room.rules);
    lastRules = room.rules;
    counts.room = room.rules.cardCounts || {};
    $('room-form').hidden = !host;
    $('room-card-counts-view').hidden = host || room.rules.cards === false || deckMode || Boolean(customOf(room.rules));
    if (host && document.activeElement?.closest?.('#room-form') == null) writeRules('room', room.rules);
    if (host) showCountsText('room');
    else SM.Deck.refresh(counts.room, room.rules);
    renderMyDeck(room);
    // デッキ構築戦は、人全員のデッキが部屋のルールで使えるまで始められない
    const notReady = deckMode ? room.seats.filter((s) => s && s.kind === 'human' && !(s.deck && s.deck.ok)) : [];
    $('btn-start').hidden = !host;
    $('btn-start').disabled = room.seats.some((s) => !s) || notReady.length > 0;
    $('room-start-note').hidden = !host || !notReady.length;
    $('room-start-note').textContent = notReady.length ? `デッキの準備ができていない人がいます: ${notReady.map((s) => s.name).join('、')}` : '';
    $('room-wait-msg').hidden = host;

    const list = $('room-seats');
    list.innerHTML = '';
    room.seats.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'seat-row';
      const label = document.createElement('span');
      label.className = 'seat-row__name';
      if (!s) label.textContent = '（空席）';
      else {
        label.appendChild(SM.Icons.el(s.icon));
        label.append(`${s.name}${s.kind === 'cpu' ? '（CPU）' : ''}${s.host ? ' 👑' : ''}${i === room.you ? '（あなた）' : ''}${s.connected ? '' : ' ※切断中'}`);
      }
      const main = document.createElement('div');
      main.className = 'seat-row__main';
      main.appendChild(label);
      if (deckMode && s) main.appendChild(deckLine(s));
      // ミッションのCPU（ネームドCPU）は、通常戦でも自分のデッキから引く
      else if (s && s.cpu) main.appendChild(Object.assign(document.createElement('span'), { className: 'seat-row__deck', textContent: '自分のデッキで戦います' }));
      li.appendChild(main);
      if (host) {
        if (!s) {
          const b = document.createElement('button');
          b.className = 'small-button';
          b.textContent = 'CPUを入れる';
          b.onclick = () => SM.Net.send({ type: 'addCpu', seat: i });
          li.appendChild(b);
        } else if (i !== room.you) {
          const acts = document.createElement('div');
          acts.className = 'seat-row__acts';
          if (s.kind === 'cpu') {
            const c = document.createElement('button');
            c.className = 'small-button';
            c.textContent = 'CPUを変更';
            c.onclick = () => SM.Missions.openCpuPicker(i, s.cpu);
            acts.appendChild(c);
          }
          const b = document.createElement('button');
          b.className = 'small-button';
          b.textContent = s.kind === 'cpu' ? 'CPUを外す' : '退出させる';
          b.onclick = () => SM.Net.send({ type: 'kick', seat: i });
          acts.appendChild(b);
          li.appendChild(acts);
        }
      }
      list.appendChild(li);
    });
  }

  // CUSTOM_DECKS・CUSTOM_FLAGS: デイリーミッションの欄でルールの名前・説明・赤文字かを出す
  SM.Lobby = { init, renderRoom, rulesText, showTab, CUSTOM_DECKS, CUSTOM_FLAGS };
})();
