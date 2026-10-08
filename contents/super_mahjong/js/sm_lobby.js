// ロビー（名前・部屋作成・参加）と待機室
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);

  const TIME_OPTIONS = [[0, '無制限'], [10, '10秒'], [15, '15秒'], [20, '20秒'], [30, '30秒'], [60, '60秒']];
  const BANK_OPTIONS = [[0, 'なし'], [30, '30秒'], [60, '60秒'], [120, '120秒'], [300, '300秒']];

  // 山札のカード枚数（既定と違う分だけ）。部屋を作る時の設定は覚えておき、待機室では部屋の設定を使う
  const counts = { create: {}, room: {} };

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
      perTurn: Number(f('perturn').value),
      bank: Number(f('bank').value),
      cardCounts: counts[prefix],
      mode: f('mode').value,
      deckRule: f('deckrule').value,
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
    f('perturn').value = String(r.perTurn);
    f('bank').value = String(r.bank);
    f('mode').value = r.mode === 'deck' ? 'deck' : 'normal';
    f('deckrule').value = r.deckRule === 'free' ? 'free' : 'recommended';
    applyMode(prefix);
  }

  /** 対戦形式に合わせて項目を出し分ける（デッキ構築戦はデッキの制限を選び、カード枚数設定は使わない） */
  function applyMode(prefix) {
    const deck = $(`${prefix}-mode`).value === 'deck';
    $(`${prefix}-deckrule-label`).hidden = !deck;
    $(`${prefix}-card-counts`).parentElement.hidden = deck;
  }

  function showCountsText(prefix) {
    $(`${prefix}-card-counts-text`).textContent = SM.Deck.summary(counts[prefix], readRules(prefix));
  }

  function setupRuleForm(prefix, onChange) {
    fillSelect($(`${prefix}-perturn`), TIME_OPTIONS);
    fillSelect($(`${prefix}-bank`), BANK_OPTIONS);
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
    const t = r.perTurn ? `1手${r.perTurn}秒${r.bank ? `+持ち時間${r.bank}秒` : ''}` : '時間無制限';
    const deckMode = r.mode === 'deck' && r.cards !== false;
    return [
      ...(deckMode ? [`デッキ構築戦（${r.deckRule === 'free' ? '制限なし' : '推奨ルール'}）`] : []),
      `${r.players === 3 ? '三麻（チーなし・北抜きあり・ツモ損）' : '四麻'}`,
      { ikkyoku: '一局戦', tonpuu: '東風戦', hanchan: '半荘戦' }[r.length] || '半荘戦',
      `${r.startPoints}点持ち`,
      r.red ? '赤あり' : '赤なし',
      r.kuitan ? '喰いタンあり' : '喰いタンなし',
      r.tobi ? '飛びあり' : '飛びなし',
      r.renchan ? '連荘あり' : '連荘なし',
      t,
      ...(deckMode ? [] : [r.cards === false ? 'カードなし' : SM.Deck.summary(r.cardCounts, r)]),
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
      SM.Net.setName(nameInput.value.trim().slice(0, 12));
      SM.Net.send({ type: 'joinRoom', code });
    };
    $('btn-join').addEventListener('click', join);
    $('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

    const q = new URLSearchParams(location.search).get('room');
    if (q) $('join-code').value = q.toUpperCase();
    // メニュー: 前に開いていたものを開く（招待リンクで来た時は対戦）
    for (const b of document.querySelectorAll('.menu-tab')) b.addEventListener('click', () => showTab(b.dataset.tab));
    showTab(q ? 'play' : SM.Net.store.get(TAB_KEY) || 'play');

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
      if (!lastRoom || !room || room.state !== 'waiting' || !isDeckMode(room.rules)) return;
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
    if (open === 'decks') SM.Decks.renderList();
    if (open === 'achievements') SM.Achievements.render();
    if (open === 'cards') SM.CardList.show();
    if (open === 'stats') SM.Stats.render();
  }

  const isDeckMode = (r) => r.mode === 'deck' && r.cards !== false;
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
    box.hidden = !isDeckMode(room.rules) || room.you < 0;
    if (box.hidden) return;
    const mine = room.seats[room.you];
    const list = SM.Decks.list();
    let pick = SM.Decks.picked();
    // まだ選んでいなければ、部屋のルールで使えるデッキを選んでおく
    if (!pick) {
      pick = list.find((d) => !SM.Decks.check(d, room.rules.deckRule).problems.length) || null;
      if (pick) SM.Decks.setPicked(pick.id);
    }
    const opts = (pick ? [] : [['', list.length ? '（デッキを選ぶ）' : '（デッキがありません）']]).concat(list.map((d) => {
      const { total, problems } = SM.Decks.check(d, room.rules.deckRule);
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
    const deckMode = isDeckMode(room.rules);
    lastRules = room.rules;
    counts.room = room.rules.cardCounts || {};
    $('room-form').hidden = !host;
    $('room-card-counts-view').hidden = host || room.rules.cards === false || deckMode;
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
      li.appendChild(main);
      if (host) {
        if (!s) {
          const b = document.createElement('button');
          b.className = 'small-button';
          b.textContent = 'CPUを入れる';
          b.onclick = () => SM.Net.send({ type: 'addCpu', seat: i });
          li.appendChild(b);
        } else if (i !== room.you) {
          const b = document.createElement('button');
          b.className = 'small-button';
          b.textContent = s.kind === 'cpu' ? 'CPUを外す' : '退出させる';
          b.onclick = () => SM.Net.send({ type: 'kick', seat: i });
          li.appendChild(b);
        }
      }
      list.appendChild(li);
    });
  }

  SM.Lobby = { init, renderRoom, rulesText };
})();
