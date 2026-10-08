// 実績: 達成した記録（このブラウザに保存）・達成した時の知らせ・実績の画面・報酬（アイコン・BGM）
// 達成はサーバーが判定して 'achievements' で送ってくる（{id} は達成、{stat, n} は累計の記録、{win} は和了（統計へ）。
// 累計で何回になったら達成かはここの GOALS。累計の記録は統計（sm_stats.js）でも使う）
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = 'super_mahjong_achievements';   // { got: { 実績の番号: 達成した時刻 }, stats: { 記録の種類: 回数 } }
  const ICON_DIR = 'data/icon_img/';
  const LIST = window.SM_ACHIEVEMENTS || [];
  const BY_ID = new Map(LIST.map((a) => [a.id, a]));
  // 累計で達成する実績（実績.txt の条件の回数）: 実績の番号 -> [記録の種類, 回数, 単位]
  const GOALS = { 1: ['games', 100, '回'], 12: ['present', 10, '回'], 14: ['beam', 20, '枚'], 30: ['choki', 10, '回'] };
  const POPUP_MS = 2600;   // 知らせを出しておく時間（下りてきてから上がり始めるまで）
  const SLIDE_MS = 450;

  let data = { got: {}, stats: {} };
  const listeners = [];

  function load() {
    try {
      const raw = JSON.parse(SM.Net.store.get(STORE_KEY) || '{}') || {};
      data = {
        got: raw.got && typeof raw.got === 'object' ? raw.got : {},
        stats: raw.stats && typeof raw.stats === 'object' ? raw.stats : {},
      };
    } catch { data = { got: {}, stats: {} }; }
  }
  const save = () => SM.Net.store.set(STORE_KEY, JSON.stringify(data));
  const has = (id) => Boolean(data.got[id]);

  // ---- 報酬 ----
  const iconId = (a) => `a${a.id}`;
  /** 報酬のアイコン（{id, name, src, ach, got}。画像がまだ無いものは src が null） */
  function rewardIcons() {
    return LIST.filter((a) => a.reward && a.reward.type === 'icon').map((a) => ({
      id: iconId(a), name: a.reward.name, src: a.reward.img ? ICON_DIR + encodeURIComponent(a.reward.img) : null, ach: a, got: has(a.id),
    }));
  }
  /** このBGMを手に入れていなければ、手に入る実績（手に入れている・報酬でない曲は null） */
  function bgmLock(file) {
    const a = LIST.find((x) => x.reward && x.reward.type === 'bgm' && x.reward.file === file);
    return a && !has(a.id) ? a : null;
  }
  function rewardText(r) {
    if (!r) return 'なし';
    return `${r.type === 'icon' ? 'アイコン' : 'BGM'}「${r.name}」`;
  }

  // ---- 達成 ----
  /** サーバーから届いた達成・累計の記録 */
  function apply(list) {
    const fresh = [];
    const unlock = (id) => {
      const a = BY_ID.get(id);
      if (!a || has(id)) return;
      data.got[id] = Date.now();
      fresh.push(a);
    };
    for (const ev of list || []) {
      if (ev.stat) {
        data.stats[ev.stat] = (data.stats[ev.stat] || 0) + (Number(ev.n) || 1);
        for (const [id, [key, goal]] of Object.entries(GOALS)) if (key === ev.stat && data.stats[key] >= goal) unlock(Number(id));
      } else if (ev.id !== undefined) unlock(Number(ev.id));
      else if (ev.win && SM.Stats) SM.Stats.offerWin(ev.win);
    }
    save();
    render();
    if (!fresh.length) return;
    for (const a of fresh) popup(a);
    for (const f of listeners) f();
  }

  // 達成の知らせ: 上から下りてきて、少しして上がって消える（続けて達成したら順に出す）
  const queue = [];
  let showing = false;
  function popup(a) {
    queue.push(a);
    if (!showing) next();
  }
  function next() {
    const box = $('ach-popup');
    const a = queue.shift();
    if (!a) { showing = false; return; }
    showing = true;
    box.innerHTML = '';
    const icon = document.createElement('span');
    icon.className = 'ach-popup__icon';
    if (a.reward && a.reward.type === 'icon') icon.appendChild(SM.Icons.el(iconId(a)));
    else icon.textContent = '🏆';
    const body = document.createElement('div');
    body.className = 'ach-popup__body';
    const label = document.createElement('div');
    label.className = 'ach-popup__label';
    label.textContent = '実績解除！';
    const name = document.createElement('div');
    name.className = 'ach-popup__name';
    name.textContent = a.name;
    body.append(label, name);
    if (a.reward) {
      const rw = document.createElement('div');
      rw.className = 'ach-popup__reward';
      rw.textContent = `${rewardText(a.reward)}を手に入れた`;
      body.appendChild(rw);
    }
    box.append(icon, body);
    box.hidden = false;
    box.classList.remove('is-in');
    void box.offsetWidth;
    box.classList.add('is-in');
    SM.Audio.se('実績');
    setTimeout(() => {
      box.classList.remove('is-in');
      setTimeout(() => { box.hidden = true; next(); }, SLIDE_MS);
    }, POPUP_MS);
  }

  // ---- 実績の画面 ----
  function render() {
    const ul = $('ach-list');
    if (!ul) return;
    $('ach-count').textContent = `${LIST.filter((a) => has(a.id)).length} / ${LIST.length}`;
    ul.innerHTML = '';
    for (const a of LIST) {
      const got = has(a.id);
      const li = document.createElement('li');
      li.className = `ach-item${got ? ' is-got' : ''}`;
      const head = document.createElement('div');
      head.className = 'ach-item__head';
      const no = document.createElement('span');
      no.className = 'ach-item__no';
      no.textContent = `No.${a.id}`;
      const name = document.createElement('span');
      name.className = 'ach-item__name';
      name.textContent = a.name;
      const state = document.createElement('span');
      state.className = 'ach-item__state';
      state.textContent = got ? `達成 ${new Date(data.got[a.id]).toLocaleDateString('ja-JP')}` : '未達成';
      head.append(no, name, state);
      const cond = document.createElement('p');
      cond.className = 'ach-item__cond';
      SM.Cards.linkify(cond, a.cond);
      li.append(head, cond);
      // 累計の実績は進み具合
      const goal = GOALS[a.id];
      if (goal && !got) {
        const [key, need, unit] = goal;
        const n = Math.min(need, data.stats[key] || 0);
        const prog = document.createElement('div');
        prog.className = 'ach-item__progress';
        const bar = document.createElement('span');
        bar.className = 'ach-bar';
        const fill = document.createElement('span');
        fill.style.width = `${(n / need) * 100}%`;
        bar.appendChild(fill);
        prog.append(bar, `${n} / ${need}${unit}`);
        li.appendChild(prog);
      }
      const rw = document.createElement('div');
      rw.className = 'ach-item__reward';
      rw.append('報酬: ');
      if (a.reward && a.reward.type === 'icon') rw.appendChild(SM.Icons.el(iconId(a)));
      rw.append(rewardText(a.reward));
      li.appendChild(rw);
      ul.appendChild(li);
    }
  }

  function init() {
    render();
  }

  // 達成の記録は、ほかの部分（アイコン・BGM）が初めに使うので読み込んでおく
  load();

  SM.Achievements = {
    init, apply, has, render, rewardIcons, bgmLock, rewardText,
    /** 累計の記録（統計で使う） */
    stats: () => ({ ...data.stats }),
    /** 達成した実績を達成した順に [{a: 実績, at: 時刻}] */
    gotList: () => Object.entries(data.got).map(([id, at]) => ({ a: BY_ID.get(Number(id)), at: Number(at) }))
      .filter((x) => x.a).sort((x, y) => x.at - y.at),
    /** 実績を達成した時（報酬のアイコン・BGMの一覧を作り直す） */
    onUnlock: (f) => listeners.push(f),
    LIST, GOALS,
  };
})();
