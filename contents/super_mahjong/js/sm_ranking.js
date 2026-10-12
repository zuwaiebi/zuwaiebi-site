// ランキング（ロビーの「ランキング」タブ）: 最高翻数和了ランキング（5位まで）とデイリーランキング（今日の3位まで）。
// ランキングはサーバーが持つ（'getRanking' で問い合わせ、'ranking' で届く。自分の登録には mine が付く）。
// 登録は、データタブの「いちばん翻数の高い和了」とミッションタブの今日の記録・デイリーミッションの終局画面の「ランキングに登録」から
// （'submitRanking'。和了した時・終局した時にサーバーがくれた証明書 proof を送る。名前とアイコンは登録した時のもの。結果は 'rankingResult'）。
// 証明書が無い記録（ランキング機能の追加前のもの）は登録できない。並べ方・1人1枠などはサーバー（src/ranking.js）が決める
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);
  const TITLE = { best: '最高翻数和了ランキング', daily: 'デイリーランキング' };
  const WAIT_MS = 10000;   // 登録の結果を待つ時間（返事が無ければ押せるように戻す）
  let data = null;         // 最後に届いたランキング { best: [...], daily: { date, entries: [...] } }
  const pending = {};      // kind -> 登録の結果を待っている { done, timer }
  // 出している「ランキングに登録」のボタン（結果が届いたら描き直す。待っている間に画面が描き直されて、別のボタンになっていることがある）
  const live = new Set();

  const span = (cls, text) => {
    const e = document.createElement('span');
    e.className = cls;
    e.textContent = text;
    return e;
  };
  /** ロビーでランキングのタブを開いているか（対局・チュートリアルの間は問い合わせない） */
  const shown = () => {
    const ol = $('ranking-best');
    return Boolean(ol && !ol.closest('.tab-panel').hidden && $('screen-lobby').classList.contains('active'));
  };
  const myName = () => ($('lobby-name').value.trim() || SM.Net.getName() || '名無し').slice(0, 12);
  const dateText = (t) => new Date(t).toLocaleDateString('ja-JP');
  const timeText = (t) => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const dayLabel = (date) => { const [, m, d] = String(date).split('-').map(Number); return m && d ? `${m}月${d}日` : ''; };

  // ---- 登録 ----
  /**
   * 「ランキングに登録」のボタンと、登録できない時の説明（「Xで共有」の横に置く）。
   * current(): 保存している今の記録（proof: サーバーの証明書、ranked: 登録した・すでに登録されていた。無ければ null）、
   * markRanked(proof): その証明書の記録に登録した印を保存する、why: 証明書が無い時の説明
   */
  function button(kind, current, markRanked, why) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'main-button rank-submit';
    const note = span('rank-submit__note', why);
    const paint = () => {
      const rec = current() || {};
      const busy = Boolean(pending[kind]);
      btn.textContent = rec.ranked ? '登録済み' : busy ? '登録中…' : 'ランキングに登録';
      btn.disabled = !rec.proof || Boolean(rec.ranked) || busy;
      note.hidden = Boolean(rec.proof);
    };
    btn.addEventListener('click', () => {
      const rec = current();
      if (!rec || !rec.proof || rec.ranked || pending[kind]) return;
      const name = myName();
      if (!window.confirm(`「${name}」の名前で${TITLE[kind]}に登録しますか？\n（名前とアイコンは、ランキングを見た人すべてに表示されます）`)) return;
      submit(kind, rec.proof, name, (res) => { if (res.ok || res.dup) markRanked(rec.proof); });
      repaint();
    });
    paint();
    live.add({ btn, paint });
    return { btn, note };
  }

  /** 出しているボタンを描き直す（画面から外れたものは忘れる） */
  function repaint() {
    for (const b of live) {
      if (b.btn.isConnected) b.paint();
      else live.delete(b);
    }
  }

  /** 登録を送る（今の名前を送り直してから）。done(res) は結果が届いた時（返事が無ければ失敗として） */
  function submit(kind, proof, name, done) {
    SM.Net.setName(name);
    const timer = setTimeout(() => finish(kind, { ok: false, message: 'サーバーから返事がありませんでした。もう一度試してください' }), WAIT_MS);
    pending[kind] = { done, timer };
    if (!SM.Net.send({ type: 'submitRanking', kind, proof })) finish(kind, { ok: false, message: 'サーバーにつながっていません。つながってから試してください' });
  }

  function finish(kind, res) {
    const p = pending[kind];
    if (!p) return;
    clearTimeout(p.timer);
    delete pending[kind];
    SM.Main.toast(res.ok ? `${TITLE[kind]}の${res.rank}位に登録しました` : res.message || '登録できませんでした');
    p.done(res);
    repaint();
  }

  // ---- ランキングの画面 ----
  /** タブを開いた時: 届いているものを描き、新しいものを問い合わせる */
  function render() {
    paint();
    SM.Net.send({ type: 'getRanking' });
  }

  function paint() {
    paintBest();
    paintDaily();
  }

  const emptyRow = (text) => {
    const li = document.createElement('li');
    li.className = 'rankboard__empty';
    li.textContent = text;
    return li;
  };

  function rankEl(rank) {
    const e = span('rankboard__rank', `${rank}位`);
    if (rank <= 3) e.classList.add(`is-${rank}`);
    return e;
  }

  function whoEl(e) {
    const who = span('rankboard__name', '');
    who.append(SM.Icons.el(e.icon), `${e.name}${e.mine ? '（あなた）' : ''}`);
    return who;
  }

  /** 翻数と上限の名前（統計の「Xで共有」と同じ書き方） */
  const valueText = (r) => (r.han >= 13 && r.limit ? `${r.han}翻 ${r.limit}` : `${r.fu}符${r.han}翻${r.limit ? ` ${r.limit}` : ''}`);

  function paintBest() {
    const ol = $('ranking-best');
    if (!ol) return;
    ol.innerHTML = '';
    if (!data) { ol.appendChild(emptyRow('サーバーからランキングを読み込んでいます…')); return; }
    if (!data.best.length) { ol.appendChild(emptyRow('まだ登録がありません。データタブの「いちばん翻数の高い和了」から登録できます。')); return; }
    for (const e of data.best) ol.appendChild(bestItem(e));
  }

  /** 最高翻数和了の1件（押すと、結果の画面と同じ形で和了を見せる） */
  function bestItem(e) {
    const r = e.win.result;
    const li = document.createElement('li');
    li.className = `rankboard__item${e.mine ? ' is-you' : ''}`;
    const box = document.createElement('details');
    box.className = 'rankboard__box';
    const head = document.createElement('summary');
    head.className = 'rankboard__head';
    head.append(rankEl(e.rank), whoEl(e), span('rankboard__value', valueText(r)));
    head.append(span('rankboard__sub', r.yaku.filter((y) => !y.dora).map((y) => y.name).join('・')), span('rankboard__points', `${SM.Main.points(e.points)}点`));
    box.appendChild(head);
    box.addEventListener('toggle', () => {
      if (!box.open || box.querySelector('.rankboard__hand')) return;
      const hand = document.createElement('div');
      hand.className = 'rankboard__hand stats-best__hand';
      SM.Stats.drawWin(hand, e.win, e.name);
      box.append(hand, span('rankboard__date', `${dateText(e.wonAt)} に和了・${dateText(e.at)} に登録`));
    });
    li.appendChild(box);
    return li;
  }

  function paintDaily() {
    const ol = $('ranking-daily');
    if (!ol) return;
    ol.innerHTML = '';
    const date = data ? data.daily.date : '';
    $('ranking-daily-date').textContent = dayLabel(date);
    // その日のデイリーミッションのルール（ミッションタブで読み込んであれば）
    const info = SM.Missions && SM.Missions.dailyInfo();
    const rules = $('ranking-daily-rules');
    rules.hidden = !(info && info.date === date);
    rules.textContent = info && info.date === date ? info.label : '';
    if (!data) { ol.appendChild(emptyRow('サーバーからランキングを読み込んでいます…')); return; }
    if (!data.daily.entries.length) { ol.appendChild(emptyRow('今日はまだ登録がありません。ミッションタブの「今日の記録」から登録できます。')); return; }
    for (const e of data.daily.entries) {
      const li = document.createElement('li');
      li.className = `rankboard__item${e.mine ? ' is-you' : ''}`;
      const head = document.createElement('div');
      head.className = 'rankboard__head';
      head.append(rankEl(e.rank), whoEl(e), span('rankboard__value', `${SM.Main.points(e.score)}点`));
      head.append(span('rankboard__sub', `対局の順位 ${e.place}位・${timeText(e.at)} に登録`));
      li.appendChild(head);
      ol.appendChild(li);
    }
  }

  function init() {
    SM.Net.on('ranking', (m) => {
      data = { best: Array.isArray(m.best) ? m.best : [], daily: m.daily || { date: '', entries: [] } };
      if (shown()) paint();
    });
    SM.Net.on('rankingResult', (m) => finish(m.kind, m));
    // つなぎ直した時・デイリーミッションの中身が届いた時は、開いていれば描き直す
    SM.Net.on('welcome', () => { if (shown()) SM.Net.send({ type: 'getRanking' }); });
    SM.Net.on('daily', () => { if (shown()) paintDaily(); });
  }

  SM.Ranking = { init, render, button };
})();
