// ミッションモード（画面）: ロビーの「ミッション」タブ（挑戦できるミッション・成功回数/挑戦回数・デッキを選んで挑戦）、
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

  const deckOk = (d) => !SM.Decks.check(d, 'recommended').problems.length;
  /** ミッションで使うデッキ（推奨ルールに合うもの。前に選んだもの、無ければ最初のもの） */
  function deckPick() {
    const ok = SM.Decks.list().filter(deckOk);
    const id = SM.Net.store.get(DECK_KEY);
    return ok.find((d) => d.id === id) || ok[0] || null;
  }

  /** 開いたミッションの、デッキを選んで挑戦する欄 */
  function goBox(m) {
    const box = document.createElement('div');
    box.className = 'mission__go';
    const list = SM.Decks.list();
    const pick = deckPick();
    if (!pick) {
      box.appendChild(span('mission__nodeck', '推奨ルールに合うデッキがありません。「デッキ構築」でデッキを作ってください。'));
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sub-button';
      b.textContent = 'デッキ構築へ';
      b.addEventListener('click', () => SM.Lobby.showTab('decks'));
      box.appendChild(b);
      return box;
    }
    const label = document.createElement('label');
    label.className = 'mission__deck';
    label.append('デッキ ');
    const sel = document.createElement('select');
    for (const d of list) {
      const o = document.createElement('option');
      const { total } = SM.Decks.check(d, 'recommended');
      o.value = d.id;
      o.textContent = `${deckOk(d) ? '✓' : '✗'} ${d.name}（${total}枚）`;
      o.disabled = !deckOk(d);
      sel.appendChild(o);
    }
    sel.value = pick.id;
    sel.addEventListener('change', () => SM.Net.store.set(DECK_KEY, sel.value));
    label.appendChild(sel);
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'main-button';
    go.textContent = '挑戦する';
    go.addEventListener('click', () => start(m.id, list.find((d) => d.id === sel.value)));
    box.append(label, go, span('mission__hint', 'デッキは推奨ルールに合うものだけ使えます。'));
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
    const id = (last && last.id) || (room && room.mission && room.mission.id);
    if (!id) return;
    const d = (last && SM.Decks.list().find((x) => x.id === last.deckId && deckOk(x))) || deckPick();
    if (!d) { SM.Main.toast('推奨ルールに合うデッキがありません'); return; }
    start(id, d);
  }

  // ---- 終局画面 ----
  /** ミッションの結果（クリア・失敗、成功/挑戦の回数、初めてのクリアで解放したもの） */
  function finalBlock(room) {
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
    // 成功・挑戦の回数が届いたら描き直す（ロビーの一覧と、終局画面の回数）
    SM.Achievements.onApply(() => {
      if (!$('mission-list').closest('.tab-panel').hidden) render();
      refreshScore();
    });
    // デッキを編集したら、一覧のデッキの選択肢も変わる
    SM.Decks.onChange(() => { if (open !== null) render(); });
  }

  SM.Missions = {
    init, render, visible, progress, isCleared, unlockedCpus, unlockedCIds, cpuIcon, bgmOf, finalBlock, retry, openCpuPicker,
    get: (id) => BY_ID.get(id) || null,
  };
})();
