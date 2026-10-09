// チュートリアル（操作しながら覚える）。サーバーを使わずに、本物の対局画面を動かして説明する。
// 記録 js/sm_tutorial_data.js は、サーバーの tools/build-tutorial.mjs が台本（tools/tutorial_script.mjs）どおりに本物のエンジンで1局を進めて作ったもの。
// 記録に入っているコマ（卓の状態の差分・出来事・問い合わせ）を、サーバーから届いた時と同じ経路（SM.Net.deliver → onRoom）で流す。
// 自分の操作を待つコマでは再生を止め、SM.Net.send に来た答えが台本どおりかを確かめてから先へ進む（違えば送らず、案内を出す）。
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);
  const DATA_SRC = 'js/sm_tutorial_data.js';
  const DONE_KEY = 'super_mahjong_tutorial_done';
  const MAX_GAP = 1200;   // 操作や説明の後、次のコマが出るまでの最長（読んでいた時間の分、待たせすぎない）
  const DEFAULT_MISMATCH = '光っているところを操作してください。';

  let active = false;
  let data = null;
  let idx = 0;              // 次に流すコマ
  let lastT = 0;            // 最後に流したコマの記録上の時刻
  let timer = null;
  let game = null;          // 復元した卓の状態
  let stateName = 'playing';
  let result = null;
  let ranking = null;
  let scores = null;
  let wait = null;          // 自分の操作を待っているコマの情報
  let pages = [];           // 表示中の説明
  let page = 0;
  let pageDone = null;      // 操作を待たない説明を読み終えた時の続き
  let compact = false;      // カードの詳細を開いている間は、押すボタンだけを案内する
  let flashTimer = null;
  let raf = null;

  // ---------- 記録の復元（サーバーの tools/build-tutorial.mjs の applyDiff と同じ） ----------
  function applyDiff(prev, d) {
    if (!prev) return d;
    const g = { ...prev };
    for (const k of Object.keys(d)) {
      if (k === 'players') g.players = prev.players.map((p, i) => d.players[i] || p);
      else g[k] = d[k];
    }
    return g;
  }

  /** 期待する答え exp の項目がすべて actual と同じか（actual に余分な項目があってもよい） */
  function subset(exp, act) {
    if (exp === act) return true;
    if (Array.isArray(exp)) return Array.isArray(act) && exp.length === act.length && exp.every((x, i) => subset(x, act[i]));
    if (exp && typeof exp === 'object') return Boolean(act) && typeof act === 'object' && Object.keys(exp).every((k) => subset(exp[k], act[k]));
    return false;
  }

  // ---------- 始める・終わる ----------
  function loadData() {
    if (window.SM_TUTORIAL) return Promise.resolve(window.SM_TUTORIAL);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = DATA_SRC;
      s.onload = () => resolve(window.SM_TUTORIAL);
      s.onerror = () => reject(new Error('load'));
      document.head.appendChild(s);
    });
  }

  /** 記録を作った時とカードの ID が同じか（CSV の行が変わって ID がずれていたら、記録を作り直す必要がある） */
  function dataOk(d) {
    if (!d || d.version !== 1 || !Array.isArray(d.frames)) return false;
    const cards = window.SM_CARDS || [];
    return Object.entries(d.cids || {}).every(([key, id]) => (cards.find((c) => c.id === id) || {}).key === key);
  }

  let starting = false;   // データを読み込んでいる間に、続けて押されても二重に始めない
  async function start() {
    if (active || starting) return;
    starting = true;
    let d;
    try { d = await loadData(); } catch { starting = false; SM.Main.toast('チュートリアルのデータを読み込めませんでした'); return; }
    starting = false;
    if (!dataOk(d)) { SM.Main.toast('チュートリアルのデータが今のカードと合いません（管理者向け: サーバーで node tools/build-tutorial.mjs を実行してください）'); return; }
    data = d;
    // 一度でも始めたら、対戦タブの誘導は出さない
    SM.Net.store.set(DONE_KEY, '1');
    const hint = document.querySelector('.tutorial-hint');
    if (hint) hint.hidden = true;
    active = true;
    idx = 0;
    lastT = 0;
    game = null;
    stateName = 'playing';
    result = null;
    ranking = null;
    scores = null;
    wait = null;
    // 前の対局・前の練習で答えた問い合わせの覚えを消す（同じ番号の問い合わせを、答え済みと取り違えないように）
    SM.Prompt.reset();
    SM.Input.reset();
    SM.Log.clear();
    SM.Result.hideRound();
    SM.Cards.hideDetail();
    SM.Net.setLocal(onSend);
    SM.Audio.setQuiet(true);
    timer = setTimeout(play, 0);
  }

  function finish(completed) {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    timer = null;
    wait = null;
    pageDone = null;
    hideCoach();
    SM.Net.setLocal(null);
    // 対局の表示を片付けて、ロビーのガイドへ戻る
    SM.Cards.hideDetail();
    SM.Prompt.hide();
    SM.Monty.update(null);
    SM.Result.hideRound();
    SM.Prompt.reset();
    SM.Input.reset();
    SM.Log.clear();
    for (const id of ['card-play', 'pile-box', 'chooser', 'exit-box']) $(id).hidden = true;
    SM.Main.state.room = null;
    SM.Main.state.game = null;
    SM.Main.show('screen-lobby');
    SM.Audio.setQuiet(false);
    SM.Lobby.showTab('tutorial');
    window.scrollTo(0, 0);
    if (completed) {
      SM.Net.store.set(DONE_KEY, '1');
      SM.Main.toast('チュートリアルおつかれさまでした！');
    } else SM.Main.toast('チュートリアルをやめました');
  }

  // ---------- 記録を流す ----------
  function roomMsg() {
    const name = ($('lobby-name').value || '').trim().slice(0, 12) || SM.Net.getName() || data.room.seats[0].name;
    const seats = data.room.seats.map((s, i) => (i === 0 ? { ...s, name, icon: SM.Icons.mine() } : { ...s }));
    return { ...data.room, seats, state: stateName };
  }

  function play() {
    timer = null;
    if (!active) return;
    const f = data.frames[idx];
    if (!f) { finish(true); return; }
    idx++;
    lastT = f.t;
    if (f.s) stateName = f.s;
    if (f.g) game = applyDiff(game, f.g);
    if (f.rs) result = f.rs;
    if (f.rk) { ranking = f.rk; scores = f.sc; }
    const m = { type: 'room', room: roomMsg() };
    if (f.pg) m.pregame = f.pg;
    else if (game) { m.game = game; m.events = f.ev || []; }
    if (stateName === 'result' && result) m.result = result;
    if (stateName === 'finished') { m.ranking = ranking; m.scores = scores; }
    SM.Net.deliver(m);
    // 部屋のホストが操作する案内は、練習には要らない
    if (stateName === 'finished') $('final-wait').hidden = true;
    if (f.wait) { wait = f.wait; showCoach(f.wait.coach); return; }
    if (f.coach) { pageDone = () => next(true); showCoach(f.coach); return; }
    next(false);
  }

  /** 次のコマを、記録上の間隔で流す（操作や説明の後は、間隔が長すぎる時だけ詰める） */
  function next(paused) {
    const n = data.frames[idx];
    if (!n) { timer = setTimeout(() => finish(true), 600); return; }
    let gap = n.t - lastT;
    if (paused) gap = Math.min(gap, MAX_GAP);
    timer = setTimeout(play, Math.max(0, gap));
  }

  // ---------- 自分の操作 ----------
  /** SM.Net.send の代わり: 台本どおりの操作だけを通す。通したら true（画面は送れたとして進む） */
  function onSend(msg) {
    if (!active) return false;
    if (!wait) return false;
    const w = wait;
    let ok = false;
    let end = false;
    if (msg.type === 'answer') ok = w.kind === 'answer' && msg.promptId === w.promptId && subset(w.expect, msg.answer);
    else if (w.kind === 'send' && msg.type === w.expect.type) { ok = true; end = msg.type === 'leaveRoom'; }
    if (!ok) {
      flash(w.mismatch || DEFAULT_MISMATCH);
      return false;
    }
    wait = null;
    pageDone = null;
    hideCoach();
    if (end) finish(true);
    else next(true);
    return true;
  }

  // ---------- 説明の吹き出しと、光らせる枠 ----------
  function renderText(el, text) {
    el.innerHTML = '';
    for (const para of String(text).split('\n')) {
      const p = document.createElement('p');
      p.innerHTML = para.split('**').map((seg, i) => (i % 2 ? `<b>${SM.Cards.linkHtml(seg)}</b>` : SM.Cards.linkHtml(seg))).join('');
      el.appendChild(p);
    }
  }

  function showCoach(list) {
    pages = list && list.length ? list : [{ text: DEFAULT_MISMATCH }];
    page = 0;
    compact = false;
    renderCoach();
    $('tutor-coach').hidden = false;
    startTick();
  }

  function hideCoach() {
    pages = [];
    $('tutor-coach').hidden = true;
    $('tutor-ring').hidden = true;
    $('tutor-flash').hidden = true;
    clearTimeout(flashTimer);
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }

  function renderCoach() {
    if (!pages.length) return;
    const last = page === pages.length - 1;
    const label = compact ? detailLabel() : null;
    renderText($('tutor-text'), label ? `「${label}」を押してください` : pages[page].text);
    $('tutor-count').textContent = pages.length > 1 ? `説明 ${page + 1} / ${pages.length}` : '説明';
    $('tutor-prev').hidden = compact || page === 0;
    // 最後のページで操作を待っている時は、押すのは画面の光っているところ（「次へ」は出さない）
    $('tutor-next').hidden = compact || (last && Boolean(wait));
    $('tutor-next').textContent = last ? '続ける' : '次へ';
  }

  function flash(text) {
    const el = $('tutor-flash');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /** 操作を待っているコマで、カードの詳細の中のボタン（プレイする・これに決める）を押す場面なら、そのボタンの名前 */
  function detailLabel() {
    const f = wait && wait.focus ? wait.focus.find((x) => x.detailBtn) : null;
    return f ? f.detailBtn : null;
  }

  /** 開いているカードの詳細の中の、名前が label のボタン（無ければ null） */
  function detailButton(label) {
    const box = $('card-detail');
    if (box.hidden) return null;
    return [...box.querySelectorAll('.card-detail__actions .main-button')].find((b) => b.textContent === label) || null;
  }

  /** 光らせる場所の記述から、画面の要素を探す（見つからない・見えない時は null） */
  function findEl(f) {
    let el = null;
    if (f.detailBtn) el = detailButton(f.detailBtn);
    else if (f.card !== undefined) el = document.querySelector(`#my-cards [data-iid="${f.card}"]`);
    else if (f.fp) el = document.querySelector('#my-cards .my-cards__fp .card');
    else if (f.tile !== undefined) el = document.querySelector(`#my-hand [data-tile="${f.tile}"]`);
    else if (f.btn) el = [...document.querySelectorAll('#call-actions button, #actions button')].find((b) => b.textContent === f.btn) || null;
    else if (f.promptItem !== undefined) el = $('prompt-body').querySelector('.prompt__items')?.children[f.promptItem] || null;
    else if (f.pregameCard) el = document.querySelector(`#fp-grid [data-cid="${f.pregameCard}"]`);
    else if (f.el) el = document.querySelector(f.el);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? el : null;
  }

  /** いま光らせるところ。{ el, key }（key は何を光らせているかの印。同じ印の間は、画面を動かすのは最初の1回だけ） */
  function currentFocus() {
    if (!pages.length) return null;
    const pg = pages[page];
    const last = page === pages.length - 1;
    const list = pg.focus || (last && wait ? wait.focus : null) || [];
    for (const f of list) {
      const el = findEl(f);
      if (el) return { el, key: `${idx}:${page}:${JSON.stringify(f)}` };
    }
    return null;
  }

  /** 光らせるところが画面の外にあれば（スマホでカードが多い画面など）、見える所までスクロールする */
  let scrolledKey = '';
  function bringIntoView(el, key) {
    if (key === scrolledKey) return;
    scrolledKey = key;
    const r = el.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function startTick() { if (!raf) raf = requestAnimationFrame(tick); }

  function tick() {
    raf = null;
    if (!active || !pages.length) return;
    const coach = $('tutor-coach');
    const ring = $('tutor-ring');
    // 退出の確認を開いている間は、説明を隠す
    const dialog = !$('exit-box').hidden;
    const label = detailLabel();
    const hasDetail = Boolean(label && detailButton(label));
    if (hasDetail !== compact) { compact = hasDetail; renderCoach(); }
    coach.hidden = dialog;
    const focus = dialog ? null : currentFocus();
    if (focus) {
      bringIntoView(focus.el, focus.key);
      const r = focus.el.getBoundingClientRect();
      const pad = 4;
      ring.style.left = `${r.left - pad}px`;
      ring.style.top = `${r.top - pad}px`;
      ring.style.width = `${r.width + pad * 2}px`;
      ring.style.height = `${r.height + pad * 2}px`;
      ring.hidden = false;
      // 光らせているところを隠さないよう、下半分にあれば上に、上半分にあれば下に出す
      const lower = r.top + r.height / 2 > window.innerHeight * 0.5;
      coach.classList.toggle('is-top', lower);
      coach.classList.toggle('is-bottom', !lower);
    } else {
      ring.hidden = true;
      coach.classList.add('is-top');
      coach.classList.remove('is-bottom');
    }
    raf = requestAnimationFrame(tick);
  }

  function init() {
    $('tutor-next').addEventListener('click', () => {
      if (page < pages.length - 1) { page++; renderCoach(); return; }
      if (!wait && pageDone) {
        const f = pageDone;
        pageDone = null;
        hideCoach();
        f();
      }
    });
    $('tutor-prev').addEventListener('click', () => { if (page > 0) { page--; renderCoach(); } });
    $('tutor-quit').addEventListener('click', () => SM.Main.askExit());
  }

  SM.Tutorial = { init, start, stop: () => finish(false), active: () => active };
})();
