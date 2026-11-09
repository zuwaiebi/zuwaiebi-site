// ミッションモード（画面）: ロビーの「ミッション」タブ（デイリーミッション・挑戦できるミッション・成功回数/挑戦回数・デッキを選んで挑戦）、
// 終局画面のミッションの結果、ミッションをクリアして解放したもの（ネームドCPU・Cカード）、待機室の「CPUを変更」。
// ミッションのデータは js/sm_missions_data.js（自動生成）。ミッションは id（成功・挑戦の回数と実績で覚えるID。変わらない）と
// no（一覧の並び順。画面の「ミッション○」。ミッション一覧.txt で付け直されることがある）を持つ。成功・挑戦の回数はサーバーが統計の記録として
// 送ってくる（SM.Achievements.stats() の mission:clear:<ID>・mission:try:<ID>）。最初は3つまで挑戦でき、1つクリアするたびに1つ増える
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);
  const DATA = window.SM_MISSIONS || { missions: [], cpus: {}, iconFiles: {} };
  const MISSIONS = DATA.missions.slice().sort((a, b) => a.no - b.no);
  const BY_ID = new Map(MISSIONS.map((m) => [m.id, m]));
  const FIRST_OPEN = 3;   // 最初から挑戦できるミッションの数
  const DECK_KEY = 'super_mahjong_mission_deck';   // ミッション・デイリーミッションのデッキを選ぶ欄の保存キー（SM.Decks.pickedIn）
  const CARD_BY_KEY = new Map((window.SM_CARDS || []).map((c) => [c.key, c]));
  const LENGTH = { ikkyoku: '一局戦', tonpuu: '東風戦', hanchan: '半荘戦' };
  // 自分だけに働くルール（ミッションの「自分だけ〇〇状態で」）の説明で、全員のルールの説明（SM.Lobby.CUSTOM_FLAGS）と違うもの
  const SELF_DESC = { yagi: '自分の場にヤギがある状態で局が始まる' };

  let open = null;          // 開いているミッションのID
  let last = null;          // 最後に挑戦したミッション { id, deckId }（終局画面の「もう一度挑戦」）
  const finals = new Map(); // 終局画面: `部屋コード:対局の番号` -> 初めてのクリアで解放したもの（描き直しても消えないように）

  // ---- 成功・挑戦の回数と解放 ----
  function progress(id) {
    const s = SM.Achievements ? SM.Achievements.stats() : {};
    return { clear: s[`mission:clear:${id}`] || 0, tries: s[`mission:try:${id}`] || 0 };
  }
  const isCleared = (id) => progress(id).clear > 0;
  const clearedCount = () => MISSIONS.filter((m) => isCleared(m.id)).length;
  /** 番号の小さい順に挑戦できるミッションの数（3 + クリアした数） */
  const openCount = () => FIRST_OPEN + clearedCount();
  /**
   * 挑戦できるミッション（番号の小さい順に、3 + クリアした数だけ。それ以外は出さない）。クリアしたもの・挑戦したことがあるものは、
   * 一覧の並びが変わって後ろになってもそのまま出す
   */
  const visible = () => MISSIONS.filter((m, i) => {
    if (i < openCount()) return true;
    const p = progress(m.id);
    return p.clear > 0 || p.tries > 0;
  });
  /** 挑戦する前に自分のデッキを選ぶミッションか（オールフォーワンなどは対局の初めに選ぶ。サーバーの missions.js の needsDeck と同じ） */
  const needsDeck = (m) => !m.custom || m.custom.deck === 'duelist';
  /** ミッションに出てくるネームドCPU（鏡のCPUは入らない） */
  const cpusOf = (m) => [...new Set(m.seats.filter((s) => s.cpu).map((s) => s.cpu))];
  /** CPUたちが使うCカード */
  const cCardsOf = (names) => [...new Set(names.flatMap((n) => (DATA.cpus[n] && DATA.cpus[n].cCards) || []))]
    .map((k) => CARD_BY_KEY.get(k)).filter(Boolean);
  /** クリアしたミッションのCPU（通常の部屋の「CPUを変更」で選べる） */
  const unlockedCpus = () => [...new Set(MISSIONS.filter((m) => isCleared(m.id)).flatMap(cpusOf))];
  // 部屋のコード「CMPLT」（全開放）を使った: どのネームドCPUのデッキにも入っていないCカードも解放する（2026-10-31 相談して決めた）
  const UNLOCK_ALL_KEY = 'super_mahjong_unlock_all';
  const unlockedAll = () => SM.Net && SM.Net.store.get(UNLOCK_ALL_KEY) === '1';
  /** どのネームドCPUのデッキにも入っていないCカード（ミッションでは解放されない） */
  const orphanCCards = () => {
    const inDecks = new Set(Object.values(DATA.cpus).flatMap((c) => c.cCards || []));
    return (window.SM_CARDS || []).filter((c) => c.c === true && !inDecks.has(c.key));
  };
  /** 解放したCカードのID（そのCPUたちが使うCカード。CMPLTを使っていれば、どのデッキにも入っていないCカードも） */
  const unlockedCIds = () => [
    ...cCardsOf(unlockedCpus()).map((c) => c.id),
    ...(unlockedAll() ? orphanCCards().map((c) => c.id) : []),
  ];
  /** ネームドCPUのアイコンのID（サーバーと同じ「n:アイコン名」） */
  const cpuIcon = (name) => `n:${(DATA.cpus[name] && DATA.cpus[name].icons[0]) || name}`;
  const bgmOf = (id) => (BY_ID.get(id) ? BY_ID.get(id).bgm.file : null);
  const myName = () => ($('lobby-name').value.trim() || SM.Net.getName() || '名無し').slice(0, 12);

  /** ミッション m を初めてクリアした時に解放するもの（次のミッション・CPU・Cカード）。今の記録（クリア前）から計算する */
  function unlocksOf(m) {
    const before = unlockedCpus();
    const cpus = cpusOf(m).filter((n) => !before.includes(n));
    const had = new Set(unlockedCIds());
    // 次のミッションは、番号の順に挑戦できる数が1つ増えて出てくるもの（クリア・挑戦したことがあって、もう出ているものなら無し）
    const shown = new Set(visible().map((x) => x.id));
    const next = MISSIONS[openCount()] || null;
    return {
      next: next && !shown.has(next.id) ? next : null,
      cpus,
      cards: cCardsOf(cpus).filter((c) => !had.has(c.id)),
    };
  }

  // ---- ミッションの一覧（ロビーの「ミッション」タブ） ----
  function render() {
    const ul = $('mission-list');
    if (!ul) return;
    renderDaily();
    ul.innerHTML = '';
    const list = visible();
    $('mission-count').textContent = `クリア ${clearedCount()}`;
    for (const m of list) ul.appendChild(item(m));
    if (list.length < MISSIONS.length) {
      const li = document.createElement('li');
      li.className = 'mission mission--more';
      li.textContent = 'ミッションをクリアすると、挑戦できるミッションが1つ増えます。';
      ul.appendChild(li);
    }
  }

  const span = (cls, text) => {
    const e = document.createElement('span');
    e.className = cls;
    e.textContent = text;
    return e;
  };

  function item(m) {
    const p = progress(m.id);
    const li = document.createElement('li');
    li.className = `mission${p.clear ? ' is-cleared' : ''}${open === m.id ? ' is-open' : ''}`;
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'mission__head';
    head.setAttribute('aria-expanded', String(open === m.id));
    head.append(span('mission__no', `ミッション${m.no}`), span('mission__title', m.title));
    const score = span('mission__score', `${p.clear ? '✓ ' : ''}${p.clear}/${p.tries}`);
    score.title = '成功回数/挑戦回数';
    head.appendChild(score);
    head.addEventListener('click', () => { open = open === m.id ? null : m.id; render(); });
    const body = document.createElement('div');
    body.className = 'mission__body';
    // 一覧に出すのは番号・名前・条件・人数と長さ・ルールだけ（相手のCPUや曲は挑戦するまで見せない）
    body.append(
      span('mission__cond', `条件: ${m.cond}`),
      span('mission__meta', `${m.players === 3 ? '三麻（3人）' : '四麻（4人）'}・${LENGTH[m.length] || ''}`),
    );
    const rules = missionRulesList(m);
    if (rules) body.appendChild(rules);
    if (m.early) body.appendChild(span('mission__hint', '条件を満たした時点で、対局の途中でやめても成功になります（点滅する「退出」から）。'));
    li.append(head, body);
    if (open === m.id) li.appendChild(goBox(m));
    return li;
  }

  /** ルールの一覧（[種類, [キー, 名前, 説明, 赤文字]] の並び。赤のルールは赤文字）。デイリーミッションと同じ形 */
  function rulesList(rows) {
    const ul = document.createElement('ul');
    ul.className = 'daily__rules';
    for (const [kind, def] of rows) {
      if (!def) continue;
      const [, name, desc, red] = def;
      const li = document.createElement('li');
      li.className = `daily__rule${red ? ' is-red' : ''}`;
      li.append(span('daily__rule-kind', kind), span('daily__rule-name', name), span('daily__rule-desc', desc));
      ul.appendChild(li);
    }
    return ul;
  }

  /** ミッションのルール（全員に働くカスタムモードのルールと、自分だけに働くルール。どちらも無ければ null） */
  function missionRulesList(m) {
    const rows = [];
    if (m.custom) {
      rows.push(['デッキ', SM.Lobby.CUSTOM_DECKS.find(([k]) => k === m.custom.deck)]);
      for (const f of SM.Lobby.CUSTOM_FLAGS.filter(([k]) => m.custom[k])) rows.push(['ルール', f]);
    }
    for (const key of m.selfRules || []) {
      const f = SM.Lobby.CUSTOM_FLAGS.find(([k]) => k === key);
      if (f) rows.push(['自分だけ', [f[0], f[1], SELF_DESC[key] || f[2], f[3]]]);
    }
    return rows.length ? rulesList(rows) : null;
  }

  /** デッキの検査のルール rule（'recommended' 推奨ルール / 'zero' 殿堂ゼロ）に合うか */
  const deckOk = (d, rule = 'recommended') => !SM.Decks.check(d, rule).problems.length;
  /** ミッションで使うデッキ（「自分のデッキ」「サンプルデッキ」の今の出どころで rule に合うもの。前に選んだもの、無ければ最初のもの） */
  function deckPick(rule = 'recommended') {
    const ok = SM.Decks.listIn(SM.Decks.srcIn(DECK_KEY)).filter((d) => deckOk(d, rule));
    const cur = SM.Decks.pickedIn(DECK_KEY);
    return (cur && ok.includes(cur) ? cur : null) || ok[0] || null;
  }

  /**
   * デッキを選ぶ欄を box に足す（「自分のデッキ」「サンプルデッキ」を切り替えて、rule に合うものだけ選べる）。選んでいるデッキを返す関数を返す。
   * 合うデッキが無ければ「デッキ構築へ」を出して null
   */
  function deckField(box, rule, ruleName) {
    box.appendChild(SM.Decks.srcTabs(DECK_KEY, () => render()));
    const pick = deckPick(rule);
    if (!pick) {
      box.appendChild(span('mission__nodeck', `${ruleName}に合うデッキがありません。「デッキ構築」でデッキを作るか、「サンプルデッキ」から選んでください。`));
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sub-button';
      b.textContent = 'デッキ構築へ';
      b.addEventListener('click', () => SM.Lobby.showTab('decks'));
      box.appendChild(b);
      return null;
    }
    const list = SM.Decks.listIn(SM.Decks.srcIn(DECK_KEY));
    const label = document.createElement('label');
    label.className = 'mission__deck';
    label.append('デッキ ');
    const sel = document.createElement('select');
    for (const d of list) {
      const o = document.createElement('option');
      const { total } = SM.Decks.check(d, rule);
      o.value = d.id;
      o.textContent = `${deckOk(d, rule) ? '✓' : '✗'} ${d.name}（${total}枚）`;
      o.disabled = !deckOk(d, rule);
      sel.appendChild(o);
    }
    sel.value = pick.id;
    sel.addEventListener('change', () => SM.Decks.setPickedIn(DECK_KEY, list.find((d) => d.id === sel.value) || null));
    label.appendChild(sel);
    box.appendChild(label);
    return () => list.find((d) => d.id === sel.value);
  }

  const goButton = (onClick) => {
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'main-button';
    go.textContent = '挑戦する';
    go.addEventListener('click', onClick);
    return go;
  };

  /** 開いたミッションの、デッキを選んで挑戦する欄（自分のデッキを使わないミッションは「挑戦する」だけ） */
  function goBox(m) {
    const box = document.createElement('div');
    box.className = 'mission__go';
    if (!needsDeck(m)) {
      box.append(goButton(() => start(m.id, null)), span('mission__hint', 'このミッションでは自分のデッキを使いません（対局の初めに選びます）。'));
      return box;
    }
    const deck = deckField(box, 'recommended', '推奨ルール');
    if (!deck) return box;
    box.append(goButton(() => start(m.id, deck())), span('mission__hint', 'デッキは推奨ルールに合うものだけ使えます。'));
    return box;
  }

  /** ミッション（ID）に挑戦する（サーバーが一人用の部屋を作って、すぐ始める）。自分のデッキを使わないミッションは deck が null */
  function start(id, deck) {
    const m = BY_ID.get(id);
    const own = !m || needsDeck(m);
    if (own && (!deck || !deckOk(deck))) { SM.Main.toast('推奨ルールに合うデッキを選んでください'); return; }
    if (own) SM.Decks.setPickedIn(DECK_KEY, deck);
    SM.Net.setName(myName());
    last = { id, deckId: own ? deck.id : null };
    SM.Net.send({ type: 'startMission', mission: id, deck: own ? SM.Decks.toServer(deck) : null });
  }

  /** 終局画面の「もう一度挑戦」: 同じミッションに同じデッキで（デッキが無くなっていたら、選べるデッキで） */
  function retry(room) {
    if (room && room.daily) { retryDaily(room); return; }
    const id = (last && last.id) || (room && room.mission && room.mission.id);
    if (!id) return;
    if (BY_ID.has(id) && !needsDeck(BY_ID.get(id))) { start(id, null); return; }
    const prev = last && SM.Decks.byId(last.deckId);
    const d = (prev && deckOk(prev) ? prev : null) || deckPick();
    if (!d) { SM.Main.toast('推奨ルールに合うデッキがありません'); return; }
    start(id, d);
  }

  // ---- デイリーミッション ----
  // 毎日（日本時間の0時で）切り替わる、全員に同じカスタムモードの対局。中身はサーバーが日付から決めて送ってくる（'daily'。
  // { date, players, length, custom, cpus: [{ name, icon }] }）。条件は無く、その日1回目の挑戦の順位・点数を記録としてその日のあいだ出す
  // （途中でやめても1回目。2回目以降も挑戦できるが記録しない）。記録は DAILY_KEY に1日分だけ:
  // { date, game: '部屋コード:対局の番号', done, label: ルールの文, ranking: [{ rank, name, icon, score, you }], at,
  //   v: 2（ランキング機能の追加後の記録）, proof（デイリーランキングに登録する証明書。サーバーもその日1回目と認めた時だけ）, ranked（登録した） }。
  // done でなければ途中退出
  const DAILY_KEY = 'super_mahjong_daily';
  let daily = null;        // 今日のデイリーミッション
  let dailyAsked = '';     // サーバーに問い合わせた日付（何度も送らない）
  let dailyDeckId = null;  // 最後に挑戦した時のデッキ（デュエリスト。終局画面の「もう一度挑戦」）
  /** 日本時間の今日の日付（サーバーと同じ '2026-10-13'） */
  const jstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const dateLabel = (date) => { const [, m, d] = date.split('-').map(Number); return `${m}月${d}日`; };
  const deckRuleOf = (d) => (d.custom.zero ? 'zero' : 'recommended');

  function recordOf(date) {
    try {
      const r = JSON.parse(SM.Net.store.get(DAILY_KEY) || 'null');
      return r && r.date === date ? r : null;
    } catch { return null; }
  }
  const saveRecord = (r) => SM.Net.store.set(DAILY_KEY, JSON.stringify(r));
  /** この部屋の対局が、その日1回目の挑戦（記録する対局）か */
  function isFirstDaily(room) {
    const rec = room && room.daily ? recordOf(room.daily.date) : null;
    return Boolean(rec && rec.game === `${room.code}:${room.gameNo}`);
  }

  /** 人数・長さとルールの名前の並び（「三麻・東風戦／ドラフト・殿堂ゼロ・青天井・ヤギ」） */
  function dailyRulesText(d) {
    const c = d.custom;
    const deck = SM.Lobby.CUSTOM_DECKS.find(([k]) => k === c.deck);
    const names = [deck ? deck[1] : '', ...SM.Lobby.CUSTOM_FLAGS.filter(([k]) => c[k]).map(([, name]) => name)];
    return `${d.players === 3 ? '三麻' : '四麻'}・${LENGTH[d.length] || ''}／${names.join('・')}`;
  }

  /** 今日のデイリーミッションをサーバーに問い合わせる（まだ無いか、日付が変わった時） */
  function askDaily(force) {
    const today = jstToday();
    if (!force && ((daily && daily.date === today) || dailyAsked === today)) return;
    dailyAsked = today;
    SM.Net.send({ type: 'getDaily' });
  }

  /**
   * 部屋の知らせ（'room'。終局画面を描くより先に届く）: デイリーミッションの部屋で、その日の記録がまだ無ければ、この対局を1回目として覚え、
   * 終局したら順位・点数を入れる
   */
  function trackDaily(m) {
    const room = m.room;
    if (!room || !room.daily || room.you < 0 || room.state === 'waiting') return;
    const game = `${room.code}:${room.gameNo}`;
    let rec = recordOf(room.daily.date);
    if (!rec) {
      rec = { date: room.daily.date, game, done: false, label: dailyRulesText(room.daily), at: Date.now(), v: 2 };
      saveRecord(rec);
    }
    if (rec.game !== game || rec.done || room.state !== 'finished' || !m.ranking) return;
    rec.done = true;
    rec.ranking = m.ranking.map((r) => {
      const s = room.seats[r.seat] || {};
      return { rank: r.rank, score: r.score, name: s.name || '', icon: s.icon || null, you: r.seat === room.you };
    });
    rec.at = Date.now();
    rec.proof = room.dailyProof || null;
    saveRecord(rec);
  }

  /** デイリーランキングに登録した印を保存する（同じ証明書の記録の時だけ） */
  function markRanked(date, proof) {
    const cur = recordOf(date);
    if (!cur || !proof || cur.proof !== proof) return;
    cur.ranked = true;
    saveRecord(cur);
  }

  /** 今日の記録 rec の「ランキングに登録」と、登録できない時の説明（「Xで共有」の横。ボタンは押すたびに保存した記録を読み直す） */
  const rankButton = (rec) => SM.Ranking.button('daily',
    () => { const r = recordOf(rec.date); return r && r.game === rec.game ? r : null; },
    (proof) => markRanked(rec.date, proof),
    rec.v ? 'サーバーで今日1回目の挑戦と確かめられなかったため、この記録はランキングに登録できません。'
      : 'この記録はランキング機能の追加前のものなので、ランキングに登録できません。');

  function shareDaily(rec) {
    const me = rec.ranking.find((r) => r.you);
    if (!me) return;
    SM.Stats.postToX(`スーパー麻雀のデイリーミッション（${dateLabel(rec.date)}）で${me.rank}位（${SM.Main.points(me.score)}点）でした！\n${rec.label}\n#スーパー麻雀`);
  }

  /** 今日の記録（終局画面と同じ順位の表と「Xで共有」。途中でやめた時は「途中退出」） */
  function recordBlock(rec) {
    const box = document.createElement('div');
    box.className = 'daily__record';
    box.appendChild(span('daily__record-title', '今日の記録'));
    if (!rec.done) {
      box.appendChild(span('daily__record-none', '途中退出'));
      return box;
    }
    const ol = document.createElement('ol');
    ol.className = 'ranking daily__ranking';
    // 自分の名前は中国語の表示でも訳さない（CPU の名前は辞書で訳す）
    SM.I18n.setNames('daily', rec.ranking.filter((r) => r.you).map((r) => r.name));
    for (const r of rec.ranking) {
      const li = document.createElement('li');
      if (r.you) li.classList.add('is-you');
      const name = span('name', '');
      name.dataset.i18nNames = '';
      name.append(SM.Icons.el(r.icon), r.name, r.you ? '（あなた）' : '');
      li.append(span('rank', `${r.rank}位`), name, span('score', SM.Main.points(r.score)));
      ol.appendChild(li);
    }
    box.appendChild(ol);
    const foot = document.createElement('div');
    foot.className = 'stats-best__foot';
    const t = new Date(rec.at);
    foot.appendChild(span('stats-best__date', `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')} に終局`));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'main-button stats-share';
    btn.textContent = 'Xで共有';
    btn.addEventListener('click', () => shareDaily(rec));
    const rank = rankButton(rec);
    const buttons = span('share-buttons', '');
    buttons.append(btn, rank.btn);
    foot.append(buttons, rank.note);
    box.appendChild(foot);
    return box;
  }

  /** ロビーの「ミッション」タブのデイリーミッションの欄 */
  function renderDaily() {
    const box = $('daily-mission');
    if (!box) return;
    askDaily();
    box.innerHTML = '';
    $('daily-date').textContent = daily ? dateLabel(daily.date) : '';
    if (!daily) {
      box.appendChild(span('daily__loading', 'サーバーから今日のデイリーミッションを読み込んでいます…'));
      return;
    }
    box.appendChild(span('daily__meta', `${daily.players === 3 ? '三麻（3人）' : '四麻（4人）'}・${LENGTH[daily.length] || ''}・カスタム`));
    // ルール: デッキの決め方1つ・黒のルール2つ・赤のルール1つ（名前と説明。赤のルールは赤文字）
    box.appendChild(rulesList([
      ['デッキ', SM.Lobby.CUSTOM_DECKS.find(([k]) => k === daily.custom.deck)],
      ...SM.Lobby.CUSTOM_FLAGS.filter(([k]) => daily.custom[k]).map((f) => ['ルール', f]),
    ]));
    // 対戦相手のCPU（通常のミッションと違い、誰が出るかも見せる）
    const cpus = document.createElement('div');
    cpus.className = 'daily__cpus';
    cpus.appendChild(span('daily__cpus-label', '対戦相手'));
    for (const c of daily.cpus) {
      const e = span('daily__cpu', '');
      e.append(SM.Icons.el(c.icon), c.name);
      cpus.appendChild(e);
    }
    box.appendChild(cpus);
    const rec = recordOf(daily.date);
    if (rec) box.appendChild(recordBlock(rec));
    // 挑戦する（デュエリストは自分のデッキを選ぶ。殿堂ゼロなら60枚以上・同名3枚まで）
    const go = document.createElement('div');
    go.className = 'mission__go daily__go';
    const duelist = daily.custom.deck === 'duelist';
    const deck = duelist ? deckField(go, deckRuleOf(daily), daily.custom.zero ? '殿堂ゼロのルール（60枚以上・同名カード3枚まで）' : '推奨ルール') : null;
    if (!duelist || deck) {
      go.appendChild(goButton(() => startDaily(deck ? deck() : null)));
      go.appendChild(span('mission__hint', rec
        ? '今日の記録は保存済みです。2回目以降も挑戦できますが、記録は変わりません。'
        : `今日1回目の挑戦の順位と点数が、今日の記録になります（途中でやめても1回目です）。${duelist ? 'デッキの決め方がデュエリストなので、自分のデッキを使います。' : ''}`));
    }
    box.appendChild(go);
  }

  /** デイリーミッションに挑戦する（サーバーが一人用の部屋を作って、すぐ始める） */
  function startDaily(deck) {
    if (!daily) return;
    const duelist = daily.custom.deck === 'duelist';
    if (duelist && (!deck || !deckOk(deck, deckRuleOf(daily)))) { SM.Main.toast('デイリーミッションのルールに合うデッキを選んでください'); return; }
    if (deck) SM.Decks.setPickedIn(DECK_KEY, deck);
    dailyDeckId = deck ? deck.id : null;
    SM.Net.setName(myName());
    SM.Net.send({ type: 'startDaily', date: daily.date, deck: deck ? SM.Decks.toServer(deck) : null, cUnlocked: unlockedCIds() });
  }

  /** 終局画面の「もう一度挑戦」（日付が変わっていたら、新しいデイリーミッションはロビーから） */
  function retryDaily(room) {
    if (!daily || daily.date !== room.daily.date) { SM.Main.toast('日付が変わったため、デイリーミッションが新しくなりました'); askDaily(true); return; }
    let deck = null;
    if (daily.custom.deck === 'duelist') {
      const rule = deckRuleOf(daily);
      const prev = SM.Decks.byId(dailyDeckId);
      deck = (prev && deckOk(prev, rule) ? prev : null) || deckPick(rule);
      if (!deck) { SM.Main.toast('デイリーミッションのルールに合うデッキがありません'); return; }
    }
    startDaily(deck);
  }

  /** 終局画面のデイリーミッションの知らせ（1回目なら記録したこと、2回目以降なら記録しないこと） */
  function dailyFinal(room) {
    const box = document.createElement('div');
    box.className = 'mission-final is-daily';
    box.appendChild(span('mission-final__title', 'デイリーミッション'));
    box.appendChild(span('mission-final__name', `${dateLabel(room.daily.date)}　${dailyRulesText(room.daily)}`));
    const first = isFirstDaily(room);
    // 成功回数の欄（mission-final__score）は描き直されるので、別の名前にする
    box.appendChild(span('mission-final__note', first
      ? '今日1回目の挑戦なので、この結果を今日の記録にしました（今日のあいだ、ミッションの画面に出ます）。'
      : '2回目以降の挑戦なので、記録されません。'));
    const rec = first ? recordOf(room.daily.date) : null;
    if (rec && rec.done) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'main-button stats-share';
      btn.textContent = 'Xで共有';
      btn.addEventListener('click', () => shareDaily(rec));
      const rank = rankButton(rec);
      const buttons = span('share-buttons mission-final__share', '');
      buttons.append(btn, rank.btn);
      box.append(buttons, rank.note);
    }
    return box;
  }

  // ---- 終局画面 ----
  /** ミッションの結果（クリア・失敗、成功/挑戦の回数、初めてのクリアで解放したもの） */
  function finalBlock(room) {
    if (room.daily) return dailyFinal(room);
    const m = room.mission && BY_ID.get(room.mission.id);
    if (!m) return null;
    const res = room.missionResult;
    const key = `${room.code}:${room.gameNo}`;
    // 終局の部屋の情報は成功回数の記録より先に届くので、ここでまだクリアしていなければ初めてのクリア
    if (!finals.has(key)) finals.set(key, res && res.cleared && !isCleared(m.id) ? unlocksOf(m) : null);
    const unlocks = finals.get(key);
    const box = document.createElement('div');
    box.className = `mission-final ${res && res.cleared ? 'is-clear' : 'is-fail'}`;
    box.appendChild(span('mission-final__title', !res ? 'ミッション中断' : res.cleared ? 'ミッションクリア！' : 'ミッション失敗'));
    box.appendChild(span('mission-final__name', `ミッション${m.no}「${m.title}」${res && res.stage === 2 ? '（2回戦）' : ''}　条件: ${m.cond}`));
    // 終局を待たずに条件を満たして、途中でやめた時・次の対局に進まなかった時
    if (res && res.quit) box.appendChild(span('mission-final__note', '条件を満たしたので、対局の途中でやめました（順位と点数はやめた時のものです）。'));
    if (res && res.declined) box.appendChild(span('mission-final__note', '「いいえ」を選んだので、ミッション失敗になりました。'));
    box.appendChild(span('mission-final__score', ''));
    if (unlocks) {
      const ul = document.createElement('ul');
      ul.className = 'mission-final__unlocks';
      const add = (label, fill) => {
        const li = document.createElement('li');
        li.appendChild(span('mission-final__label', label));
        fill(li);
        ul.appendChild(li);
      };
      if (unlocks.next) add('新しいミッション', (li) => li.append(`ミッション${unlocks.next.no}「${unlocks.next.title}」`));
      // CPU・Cカードは1つずつ縦に並べる
      if (unlocks.cpus.length) {
        add('CPU（「CPUを変更」で選べます）', (li) => {
          for (const n of unlocks.cpus) {
            const row = span('mission-final__row', '');
            row.append(SM.Icons.el(cpuIcon(n)), span('mission-final__cpu', n));
            li.appendChild(row);
          }
        });
      }
      if (unlocks.cards.length) {
        add('Cカード', (li) => {
          for (const c of unlocks.cards) {
            const row = span('mission-final__row', '');
            SM.Cards.linkify(row, `《${c.name}》`);
            li.appendChild(row);
          }
        });
      }
      box.appendChild(ul);
    }
    refreshScore(box, m.id);
    return box;
  }

  function refreshScore(box, id) {
    const el = (box || document).querySelector('.mission-final__score');
    if (!el) return;
    const p = progress(id || (SM.Main.state.room && SM.Main.state.room.mission && SM.Main.state.room.mission.id));
    el.textContent = `成功 ${p.clear}回 / 挑戦 ${p.tries}回`;
  }

  // ---- 次の対局に進むかを聞く暗転した画面 ----
  // 2回戦のあるミッションで1回戦の条件を満たして終局すると、部屋が 'interlude' になる。見せる文・ゆっくり見せる部分・選択肢は
  // サーバーが部屋情報の interlude（{ message: { lines, slow }, choices }）で送る。黒地に白の明朝体で1文字ずつ出し、
  // 出し終えたら選択肢（選んでいる方を橙のかっこで囲む。既定は最後）。1つ目なら次の対局、それ以外ならやめる（missionChoice）
  const TYPE_MS = 110;        // 1文字
  const LINE_MS = 400;        // 改行
  const BLANK_MS = 1000;      // 空行
  const SLOW_PAUSE_MS = 1200; // ゆっくり見せる部分の前
  const SLOW_MS = 560;        // ゆっくり見せる部分の1文字
  const CHOICE_MS = 700;      // 文を出し終えてから選択肢を出すまで
  let interKey = null;        // 出している暗転（`部屋コード:対局の番号`。同じ知らせが何度届いても始めから出し直さない）
  let interTimer = null;
  let interPick = 0;
  let interDone = null;       // 文を最後まですぐ出す（押した時）

  /** 文を1文字ずつ出す手順 [{ ch, wait }]（wait はその文字を出すまでの待ち） */
  function typeSteps({ lines = [], slow = '' }) {
    const steps = [];
    lines.forEach((line, i) => {
      if (i > 0) steps.push({ ch: '\n', wait: line ? LINE_MS : 0 });
      if (!line) { steps.push({ ch: '', wait: BLANK_MS }); return; }
      const at = slow ? line.indexOf(slow) : -1;
      [...line].forEach((ch, j) => {
        const inSlow = at >= 0 && j >= at && j < at + slow.length;
        steps.push({ ch, wait: j === at ? SLOW_PAUSE_MS : inSlow ? SLOW_MS : TYPE_MS });
      });
    });
    return steps;
  }

  function showInterlude(room) {
    const key = `${room.code}:${room.gameNo}`;
    if (interKey === key) return;
    interKey = key;
    clearTimeout(interTimer);
    const info = room.interlude || {};
    const text = $('interlude-text');
    const box = $('interlude-choices');
    text.textContent = '';
    box.hidden = true;
    box.innerHTML = '';
    const steps = typeSteps(info.message || {});
    const choices = info.choices && info.choices.length ? info.choices : ['はい', 'いいえ'];
    interPick = choices.length - 1;
    const buttons = choices.map((label, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'interlude__choice';
      b.textContent = label;
      b.addEventListener('mouseenter', () => markChoice(i));
      b.addEventListener('focus', () => markChoice(i));
      b.addEventListener('click', () => choose(i));
      return b;
    });
    box.append(...buttons);
    markChoice(interPick);
    const showChoices = () => {
      interDone = null;
      box.hidden = false;
      buttons[interPick].focus({ preventScroll: true });
    };
    let i = 0;
    const next = () => {
      if (i >= steps.length) { interTimer = setTimeout(showChoices, CHOICE_MS); return; }
      const step = steps[i++];
      interTimer = setTimeout(() => { text.textContent += step.ch; next(); }, step.wait);
    };
    // 文の途中で押すと、最後まですぐ出す
    interDone = () => {
      clearTimeout(interTimer);
      text.textContent = steps.map((x) => x.ch).join('');
      showChoices();
    };
    next();
  }

  function markChoice(i) {
    interPick = i;
    document.querySelectorAll('#interlude-choices .interlude__choice').forEach((b, j) => b.classList.toggle('is-on', j === i));
  }

  function choose(i) {
    const box = $('interlude-choices');
    if (box.hidden || box.dataset.sent === interKey) return;
    box.dataset.sent = interKey;
    for (const b of box.querySelectorAll('button')) b.disabled = true;
    SM.Net.send({ type: 'missionChoice', yes: i === 0 });
  }

  function interludeKeys(e) {
    if (!$('screen-interlude').classList.contains('active')) return;
    const box = $('interlude-choices');
    if (box.hidden) {
      if ((e.key === 'Enter' || e.key === ' ') && interDone) { e.preventDefault(); interDone(); }
      return;
    }
    const n = box.querySelectorAll('button').length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); markChoice((interPick + n - 1) % n); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); markChoice((interPick + 1) % n); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(interPick); }
  }

  // ---- 結果の画面の後に見せる画像 ----
  // ミッションの結果に treasure（{ img, text }。サーバーから。2回戦をクリアした時）があれば、結果の画面から出る時（ミッション一覧へ・
  // もう一度挑戦）に、画面に収まる一番大きな大きさの画像と、余った所に文を見せる。押すと閉じて続ける（同じ対局では1回だけ）
  const treasureShown = new Set();
  let treasureThen = null;

  function afterResult(room, then) {
    const t = room && room.missionResult && room.missionResult.treasure;
    const key = room ? `${room.code}:${room.gameNo}` : '';
    if (!t || treasureShown.has(key)) { then(); return; }
    treasureShown.add(key);
    treasureThen = then;
    const img = $('treasure-img');
    $('treasure-text').textContent = t.text || '';
    img.onload = layoutTreasure;
    img.src = t.img;
    $('treasure').hidden = false;
    layoutTreasure();
  }

  function closeTreasure() {
    if ($('treasure').hidden) return;
    $('treasure').hidden = true;
    const then = treasureThen;
    treasureThen = null;
    if (then) then();
  }

  /** 画像を画面に収まる一番大きな大きさにし、余った向き（横か縦）に文を置く。余りが狭すぎる時は文の分だけ画像を小さくする */
  function layoutTreasure() {
    const box = $('treasure');
    const img = $('treasure-img');
    const text = $('treasure-text');
    if (box.hidden || !img.naturalWidth) return;
    const W = box.clientWidth;
    const H = box.clientHeight;
    const MIN_TEXT = 0.2;   // 文に残す、画面の幅（高さ）の割合の最小
    const side = W / H > img.naturalWidth / img.naturalHeight;   // 横に余る
    const scale = side
      ? Math.min(H / img.naturalHeight, (W * (1 - MIN_TEXT)) / img.naturalWidth)
      : Math.min(W / img.naturalWidth, (H * (1 - MIN_TEXT)) / img.naturalHeight);
    img.style.width = `${Math.floor(img.naturalWidth * scale)}px`;
    img.style.height = `${Math.floor(img.naturalHeight * scale)}px`;
    box.classList.toggle('is-column', !side);
    // 文は余った所に収まる一番大きな文字に
    const room = side ? { w: W - img.naturalWidth * scale, h: H } : { w: W, h: H - img.naturalHeight * scale };
    let size = Math.min(room.w / 4, room.h / 2, 64);
    text.style.padding = `${Math.round(Math.min(room.w, room.h) * 0.06)}px`;
    for (let i = 0; i < 30 && size > 10; i++) {
      text.style.fontSize = `${size}px`;
      if (text.scrollWidth <= text.clientWidth + 1 && text.scrollHeight <= text.clientHeight + 1) break;
      size *= 0.9;
    }
  }

  // ---- 待機室の「CPUを変更」 ----
  let pickSeat = -1;
  function openCpuPicker(seat, current) {
    pickSeat = seat;
    const ul = $('cpu-picker-list');
    ul.innerHTML = '';
    const add = (label, icon, cpu) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `cpu-picker__item${(current || null) === cpu ? ' is-current' : ''}`;
      if (icon) b.appendChild(SM.Icons.el(icon));
      b.append(label);
      b.addEventListener('click', () => {
        SM.Net.send({ type: 'setCpu', seat: pickSeat, cpu });
        $('cpu-picker').hidden = true;
      });
      li.appendChild(b);
      ul.appendChild(li);
    };
    add('既定のCPU', null, null);
    const cpus = unlockedCpus();
    for (const n of cpus) add(n, cpuIcon(n), n);
    $('cpu-picker-empty').hidden = cpus.length > 0;
    $('cpu-picker').hidden = false;
  }

  function init() {
    $('cpu-picker-close').addEventListener('click', () => { $('cpu-picker').hidden = true; });
    $('cpu-picker').addEventListener('click', (e) => { if (e.target.id === 'cpu-picker') $('cpu-picker').hidden = true; });
    const shown = () => !$('mission-list').closest('.tab-panel').hidden;
    // 成功・挑戦の回数が届いたら描き直す（ロビーの一覧と、終局画面の回数）
    SM.Achievements.onApply(() => {
      if (shown()) render();
      refreshScore();
    });
    // デッキを編集したら、一覧（とデイリーミッション）のデッキの選択肢も変わる
    SM.Decks.onChange(() => { if (shown()) render(); });
    // デイリーミッション: つながったら今日の分を問い合わせ、届いたら描き直す。部屋の知らせで1回目の挑戦を記録する
    SM.Net.on('welcome', () => askDaily(true));
    SM.Net.on('daily', (m) => {
      daily = m.daily || null;
      if (shown()) render();
    });
    SM.Net.on('room', trackDaily);
    // 次の対局に進むかを聞く暗転した画面: 文の途中で押すと最後まで出す。キーでも選べる
    $('interlude-text').addEventListener('click', () => { if (interDone) interDone(); });
    document.addEventListener('keydown', interludeKeys);
    // 結果の画面の後の画像: 押すと閉じる
    $('treasure').addEventListener('click', closeTreasure);
    document.addEventListener('keydown', (e) => { if (!$('treasure').hidden && ['Enter', ' ', 'Escape'].includes(e.key)) { e.preventDefault(); closeTreasure(); } });
    window.addEventListener('resize', layoutTreasure);
  }

  SM.Missions = {
    init, render, visible, progress, isCleared, unlockedCpus, unlockedCIds, cpuIcon, bgmOf, finalBlock, retry, openCpuPicker, isFirstDaily,
    showInterlude, afterResult,
    get: (id) => BY_ID.get(id) || null,
    /** すべてのミッションのID（部屋のコード「CMPLT」で、すべてクリア済みにする時） */
    allIds: () => MISSIONS.map((m) => m.id),
    /** 部屋のコード「CMPLT」: どのネームドCPUのデッキにも入っていないCカードも解放する */
    unlockOrphans: () => SM.Net.store.set(UNLOCK_ALL_KEY, '1'),
    /** 読み込んだ今日のデイリーミッション（ランキングの画面に出す日付とルールの文。まだ届いていなければ null） */
    dailyInfo: () => (daily ? { date: daily.date, label: dailyRulesText(daily) } : null),
  };
})();
