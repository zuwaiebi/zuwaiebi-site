// ミッションモード（画面）: ロビーの「ミッション」タブ（デイリーミッション・挑戦できるミッション・成功回数/挑戦回数・デッキを選んで挑戦）、
// 終局画面のミッションの結果、ミッションをクリアして解放したもの（ネームドCPU・Cカード）、待機室の「CPUを変更」。
// ミッションのデータは js/sm_missions_data.js（自動生成）。成功・挑戦の回数はサーバーが統計の記録として送ってくる
// （SM.Achievements.stats() の mission:clear:<番号>・mission:try:<番号>）。最初は3つまで挑戦でき、1つクリアするたびに1つ増える
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);
  const DATA = window.SM_MISSIONS || { missions: [], cpus: {}, iconFiles: {} };
  const MISSIONS = DATA.missions.slice().sort((a, b) => a.id - b.id);
  const BY_ID = new Map(MISSIONS.map((m) => [m.id, m]));
  const FIRST_OPEN = 3;   // 最初から挑戦できるミッションの数
  const DECK_KEY = 'super_mahjong_mission_deck';   // ミッションで使うデッキの id
  const CARD_BY_KEY = new Map((window.SM_CARDS || []).map((c) => [c.key, c]));
  const LENGTH = { ikkyoku: '一局戦', tonpuu: '東風戦', hanchan: '半荘戦' };

  let open = null;          // 開いているミッションの番号
  let last = null;          // 最後に挑戦したミッション { id, deckId }（終局画面の「もう一度挑戦」）
  const finals = new Map(); // 終局画面: `部屋コード:対局の番号` -> 初めてのクリアで解放したもの（描き直しても消えないように）

  // ---- 成功・挑戦の回数と解放 ----
  function progress(id) {
    const s = SM.Achievements ? SM.Achievements.stats() : {};
    return { clear: s[`mission:clear:${id}`] || 0, tries: s[`mission:try:${id}`] || 0 };
  }
  const isCleared = (id) => progress(id).clear > 0;
  const clearedCount = () => MISSIONS.filter((m) => isCleared(m.id)).length;
  /** 挑戦できるミッション（番号の小さい順に、3 + クリアした数だけ。それ以外は出さない） */
  const visible = () => MISSIONS.slice(0, FIRST_OPEN + clearedCount());
  /** ミッションに出てくるネームドCPU（鏡のCPUは入らない） */
  const cpusOf = (m) => [...new Set(m.seats.filter((s) => s.cpu).map((s) => s.cpu))];
  /** CPUたちが使うCカード */
  const cCardsOf = (names) => [...new Set(names.flatMap((n) => (DATA.cpus[n] && DATA.cpus[n].cCards) || []))]
    .map((k) => CARD_BY_KEY.get(k)).filter(Boolean);
  /** クリアしたミッションのCPU（通常の部屋の「CPUを変更」で選べる） */
  const unlockedCpus = () => [...new Set(MISSIONS.filter((m) => isCleared(m.id)).flatMap(cpusOf))];
  /** 解放したCカードのID（そのCPUたちが使うCカード） */
  const unlockedCIds = () => cCardsOf(unlockedCpus()).map((c) => c.id);
  /** ネームドCPUのアイコンのID（サーバーと同じ「n:アイコン名」） */
  const cpuIcon = (name) => `n:${(DATA.cpus[name] && DATA.cpus[name].icons[0]) || name}`;
  const bgmOf = (id) => (BY_ID.get(id) ? BY_ID.get(id).bgm.file : null);
  const myName = () => ($('lobby-name').value.trim() || SM.Net.getName() || '名無し').slice(0, 12);

  /** ミッション m を初めてクリアした時に解放するもの（次のミッション・CPU・Cカード）。今の記録（クリア前）から計算する */
  function unlocksOf(m) {
    const before = unlockedCpus();
    const cpus = cpusOf(m).filter((n) => !before.includes(n));
    const had = new Set(unlockedCIds());
    return {
      next: MISSIONS[visible().length] || null,
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
    head.append(span('mission__no', `ミッション${m.id}`), span('mission__title', m.title));
    const score = span('mission__score', `${p.clear ? '✓ ' : ''}${p.clear}/${p.tries}`);
    score.title = '成功回数/挑戦回数';
    head.appendChild(score);
    head.addEventListener('click', () => { open = open === m.id ? null : m.id; render(); });
    const body = document.createElement('div');
    body.className = 'mission__body';
    // 一覧に出すのは番号・名前・条件・人数と長さだけ（相手のCPUや曲は挑戦するまで見せない）
    body.append(
      span('mission__cond', `条件: ${m.cond}`),
      span('mission__meta', `${m.players === 3 ? '三麻（3人）' : '四麻（4人）'}・${LENGTH[m.length] || ''}`),
    );
    li.append(head, body);
    if (open === m.id) li.appendChild(goBox(m));
    return li;
  }

  /** デッキの検査のルール rule（'recommended' 推奨ルール / 'zero' 殿堂ゼロ）に合うか */
  const deckOk = (d, rule = 'recommended') => !SM.Decks.check(d, rule).problems.length;
  /** ミッションで使うデッキ（rule に合うもの。前に選んだもの、無ければ最初のもの） */
  function deckPick(rule = 'recommended') {
    const ok = SM.Decks.list().filter((d) => deckOk(d, rule));
    const id = SM.Net.store.get(DECK_KEY);
    return ok.find((d) => d.id === id) || ok[0] || null;
  }

  /**
   * デッキを選ぶ欄を box に足す（rule に合うものだけ選べる）。選んでいるデッキを返す関数を返す。
   * 合うデッキが無ければ「デッキ構築へ」を出して null
   */
  function deckField(box, rule, ruleName) {
    const pick = deckPick(rule);
    if (!pick) {
      box.appendChild(span('mission__nodeck', `${ruleName}に合うデッキがありません。「デッキ構築」でデッキを作ってください。`));
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sub-button';
      b.textContent = 'デッキ構築へ';
      b.addEventListener('click', () => SM.Lobby.showTab('decks'));
      box.appendChild(b);
      return null;
    }
    const list = SM.Decks.list();
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
    sel.addEventListener('change', () => SM.Net.store.set(DECK_KEY, sel.value));
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

  /** 開いたミッションの、デッキを選んで挑戦する欄 */
  function goBox(m) {
    const box = document.createElement('div');
    box.className = 'mission__go';
    const deck = deckField(box, 'recommended', '推奨ルール');
    if (!deck) return box;
    box.append(goButton(() => start(m.id, deck())), span('mission__hint', 'デッキは推奨ルールに合うものだけ使えます。'));
    return box;
  }

  /** ミッションに挑戦する（サーバーが一人用の部屋を作って、すぐ始める） */
  function start(id, deck) {
    if (!deck || !deckOk(deck)) { SM.Main.toast('推奨ルールに合うデッキを選んでください'); return; }
    SM.Net.store.set(DECK_KEY, deck.id);
    SM.Net.setName(myName());
    last = { id, deckId: deck.id };
    SM.Net.send({ type: 'startMission', mission: id, deck: SM.Decks.toServer(deck) });
  }

  /** 終局画面の「もう一度挑戦」: 同じミッションに同じデッキで（デッキが無くなっていたら、選べるデッキで） */
  function retry(room) {
    if (room && room.daily) { retryDaily(room); return; }
    const id = (last && last.id) || (room && room.mission && room.mission.id);
    if (!id) return;
    const d = (last && SM.Decks.list().find((x) => x.id === last.deckId && deckOk(x))) || deckPick();
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
    for (const r of rec.ranking) {
      const li = document.createElement('li');
      if (r.you) li.classList.add('is-you');
      const name = span('name', '');
      name.append(SM.Icons.el(r.icon), `${r.name}${r.you ? '（あなた）' : ''}`);
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
    const rules = document.createElement('ul');
    rules.className = 'daily__rules';
    const rule = (kind, def) => {
      if (!def) return;
      const [, name, desc, red] = def;
      const li = document.createElement('li');
      li.className = `daily__rule${red ? ' is-red' : ''}`;
      li.append(span('daily__rule-kind', kind), span('daily__rule-name', name), span('daily__rule-desc', desc));
      rules.appendChild(li);
    };
    rule('デッキ', SM.Lobby.CUSTOM_DECKS.find(([k]) => k === daily.custom.deck));
    for (const f of SM.Lobby.CUSTOM_FLAGS.filter(([k]) => daily.custom[k])) rule('ルール', f);
    box.appendChild(rules);
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
    if (deck) SM.Net.store.set(DECK_KEY, deck.id);
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
      deck = SM.Decks.list().find((d) => d.id === dailyDeckId && deckOk(d, rule)) || deckPick(rule);
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
    box.appendChild(span('mission-final__name', `ミッション${m.id}「${m.title}」　条件: ${m.cond}`));
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
      if (unlocks.next) add('新しいミッション', (li) => li.append(`ミッション${unlocks.next.id}「${unlocks.next.title}」`));
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
  }

  SM.Missions = {
    init, render, visible, progress, isCleared, unlockedCpus, unlockedCIds, cpuIcon, bgmOf, finalBlock, retry, openCpuPicker, isFirstDaily,
    get: (id) => BY_ID.get(id) || null,
    /** すべてのミッションの番号（部屋のコード「CMPLT」で、すべてクリア済みにする時） */
    allIds: () => MISSIONS.map((m) => m.id),
    /** 読み込んだ今日のデイリーミッション（ランキングの画面に出す日付とルールの文。まだ届いていなければ null） */
    dailyInfo: () => (daily ? { date: daily.date, label: dailyRulesText(daily) } : null),
  };
})();
