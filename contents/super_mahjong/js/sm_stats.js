// 統計: いちばん翻数の高い和了（結果の画面と同じ表示・Xで共有）と、これまでの記録（階層になっていて、下の項目は上を押すと開く）。
// 記録はサーバーが数えて 'achievements' で送ってきたものを、実績と同じくこのブラウザに保存している（SM.Achievements.stats()）
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);
  const BEST_KEY = 'super_mahjong_best_win';   // { result, label(局), red, n, names, doraKinds, allDora, at }
  const CARDS = new Map((window.SM_CARDS || []).map((c) => [c.key, c]));

  // ---- いちばん翻数の高い和了 ----
  function loadBest() {
    try {
      const b = JSON.parse(SM.Net.store.get(BEST_KEY) || 'null');
      return b && b.result && Array.isArray(b.result.yaku) ? b : null;
    } catch { return null; }
  }

  /** 和了した時（サーバーから届く）: 翻数が多い方、同じなら和了点（本場・供託を除く）が高い方を残す */
  function offerWin(w) {
    if (!w || !w.result) return;
    const best = loadBest();
    const better = !best || w.result.han > best.result.han
      || (w.result.han === best.result.han && (w.result.points || 0) > (best.result.points || 0));
    if (!better) return;
    SM.Net.store.set(BEST_KEY, JSON.stringify({ ...w, at: Date.now() }));
  }

  // 牌の文字（共有する文に手牌を並べる）
  const TILE_CHARS = [];
  for (let i = 0; i < 9; i++) {
    TILE_CHARS[i] = String.fromCodePoint(0x1F007 + i);        // 萬子
    TILE_CHARS[9 + i] = String.fromCodePoint(0x1F019 + i);    // 筒子
    TILE_CHARS[18 + i] = String.fromCodePoint(0x1F010 + i);   // 索子
  }
  [0x1F000, 0x1F001, 0x1F002, 0x1F003, 0x1F006, 0x1F005, 0x1F004].forEach((c, i) => { TILE_CHARS[27 + i] = String.fromCodePoint(c); });
  for (let i = 0; i < 4; i++) TILE_CHARS[34 + i] = String.fromCodePoint(0x1F026 + i);   // 春夏秋冬
  TILE_CHARS[38] = String.fromCodePoint(0x1F02A);   // オールマイティ牌

  /** 共有する文の手牌（手牌・和了牌・副露。別の牌として使った牌はその牌で） */
  function handText(r) {
    const asKinds = r.asKinds || {};
    const kindOf = (t) => (asKinds[t] !== undefined ? asKinds[t] : SM.Tiles.kindOf(t));
    const ch = (t) => TILE_CHARS[kindOf(t)] || '';
    const hand = r.hand.slice().sort((a, b) => kindOf(a) - kindOf(b)).map(ch).join('');
    const melds = r.melds.map((m) => m.tiles.map(ch).join(''));
    return [hand, ch(r.winTile), ...melds].join(' ');
  }

  function shareText(b) {
    const r = b.result;
    const yaku = r.yaku.filter((y) => !y.dora).map((y) => y.name).join('・');
    const value = r.han >= 13 ? `${r.han}翻 ${r.limit}` : `${r.fu}符${r.han}翻${r.limit ? ` ${r.limit}` : ''}`;
    const tiles = SM.Tiles.withKnown(r, () => handText(r));
    return `スーパー麻雀で${yaku}を和了しました！\n${value}　${r.label}\n${tiles}\n#スーパー麻雀`;
  }

  function share(b) {
    const url = `${location.origin}${location.pathname}`;
    const href = `https://x.com/intent/post?text=${encodeURIComponent(shareText(b))}&url=${encodeURIComponent(url)}`;
    window.open(href, '_blank', 'noopener');
  }

  function renderBest() {
    const box = $('stats-best');
    box.innerHTML = '';
    const b = loadBest();
    if (!b) {
      const p = document.createElement('p');
      p.className = 'stats-best__none';
      p.textContent = 'まだ和了していません。和了すると、いちばん翻数の高い和了がここに出ます。';
      box.appendChild(p);
      return;
    }
    // 結果の画面と同じ表示（その時のドラの牌種・赤ドラの設定・席の名前で描く）
    const hand = document.createElement('div');
    hand.className = 'stats-best__hand';
    const room = { seats: (b.names || []).map((name) => ({ name })) };
    SM.Tiles.setView({ tiles: {}, reds: [], allDora: b.allDora, doraKinds: b.doraKinds || [], doraTiles: [], asKinds: {} });
    SM.Tiles.withKnown(b.result, () => SM.Result.agariBlock(hand, room, b.result, b.red !== false, b.label));
    box.appendChild(hand);
    const foot = document.createElement('div');
    foot.className = 'stats-best__foot';
    const date = document.createElement('span');
    date.className = 'stats-best__date';
    date.textContent = b.at ? `${new Date(b.at).toLocaleDateString('ja-JP')} に和了` : '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'main-button stats-share';
    btn.textContent = 'Xで共有';
    btn.addEventListener('click', () => share(b));
    foot.append(date, btn);
    box.appendChild(foot);
  }

  // ---- 記録の一覧 ----
  let st = {};
  const n = (k) => Number(st[k]) || 0;
  const sum = (...ks) => ks.reduce((a, k) => a + n(k), 0);
  const num = (v) => v.toLocaleString('ja-JP');
  const count = (...ks) => () => num(sum(...ks));
  // 1時間以上は「1時間4分」、それより短い時は秒まで（「12分30秒」「37秒」）
  const hm = (sec) => {
    const m = Math.floor(sec / 60);
    if (m >= 60) return `${Math.floor(m / 60)}時間${m % 60}分`;
    return m ? `${m}分${sec % 60}秒` : `${sec}秒`;
  };
  const time = (...ks) => () => hm(sum(...ks));
  const date = (at) => (at ? new Date(at).toLocaleDateString('ja-JP') : 'なし');
  /** 'prefix:名前' の記録を多い順に [名前, 回数] */
  const ranked = (prefix) => Object.keys(st).filter((k) => k.startsWith(prefix) && n(k) > 0)
    .map((k) => [k.slice(prefix.length), n(k)]).sort((a, b) => b[1] - a[1]);

  const PLAYED_POWER = ['play:power', 'play:full', 'play:cfull', 'play:plus', 'play:cpower'];
  const PLAYED_EVENT = ['play:event', 'play:cevent'];
  const DESTROY = ['destroy:power', 'destroy:full', 'destroy:cfull', 'destroy:plus', 'destroy:cpower'];
  const LOST = ['lost:power', 'lost:full', 'lost:cfull', 'lost:plus', 'lost:cpower'];
  const COUNTER_POWER = ['counter:power', 'counter:full', 'counter:cfull', 'counter:plus', 'counter:cpower'];
  const COUNTER_EVENT = ['counter:event', 'counter:cevent'];

  /** 項目（統計.txt の並びと階層）。value は表示する値、children は押すと開く下の項目 */
  function items() {
    const got = SM.Achievements.gotList();
    const first = got[0];
    const last = got[got.length - 1];
    const yaku = ranked('yaku:');
    const cards = ranked('card:');
    const cardName = (key) => (CARDS.get(key) ? `《${CARDS.get(key).name}》` : key);
    return [
      { label: '対局した回数', value: count('played'), children: [
        { label: '通常戦', value: count('played:normal'), children: [
          { label: '人間2人以上で通常戦', value: count('played:normal:multi') },
        ] },
        { label: 'デッキ構築戦', value: count('played:deck'), children: [
          { label: '人間2人以上でデッキ構築戦', value: count('played:deck:multi') },
        ] },
        { label: 'ミッションモード', value: count('played:mission') },
      ] },
      { label: 'プレイ時間（対局していた時間）', value: time('time:normal', 'time:deck', 'time:mission'), children: [
        { label: '通常戦', value: time('time:normal') },
        { label: 'デッキ構築戦', value: time('time:deck') },
        { label: 'ミッションモード', value: time('time:mission') },
      ] },
      { label: '牌を手牌に加えた回数', value: count('tile:deal', 'tile:tsumo', 'tile:cardTsumo', 'tile:cardOther'), children: [
        { label: '配牌で手牌に加えた回数', value: count('tile:deal') },
        { label: '普通にツモった回数', value: count('tile:tsumo') },
        { label: 'カードでツモった回数', value: count('tile:cardTsumo') },
        { label: 'カードでツモ以外の方法で手牌に加えた回数', value: count('tile:cardOther') },
      ] },
      { label: '和了した回数', value: count('win:tsumo', 'win:ron', 'win:other'), children: [
        { label: 'ツモ', value: count('win:tsumo') },
        { label: 'ロン', value: count('win:ron') },
        { label: 'その他(流し満貫等)', value: count('win:other') },
      ] },
      { label: '放銃した回数', value: count('dealin') },
      { label: '自分が飛んだ回数', value: count('busted') },
      { label: '相手を飛ばした回数', value: count('bustOther') },
      {
        label: '最も和了した役',
        value: () => (yaku.length ? `${yaku[0][0]}（${num(yaku[0][1])}回）` : 'なし'),
        children: yaku.map(([name, c]) => ({ label: name, value: () => `${num(c)}回` })),
      },
      { label: '流局した回数', value: count('ryuukyoku') },
      { label: '引いたカードの枚数', value: count('draw:normal', 'draw:card'), children: [
        { label: '普通に引いた枚数', value: count('draw:normal') },
        { label: 'カードで引いた枚数', value: count('draw:card') },
      ] },
      // 手札に加えたハプニングは、プレイしたカードの枚数には足さない
      { label: 'プレイしたカードの枚数', value: count(...PLAYED_POWER, ...PLAYED_EVENT), children: [
        { label: 'プレイしたパワーの数', value: count(...PLAYED_POWER), children: [
          { label: 'プレイした単なるパワーの数', value: count('play:power') },
          { label: 'プレイしたフルパワーの数', value: count('play:full', 'play:cfull'), children: [
            { label: 'プレイしたCフルパワーの数', value: count('play:cfull') },
          ] },
          { label: 'プレイしたパワー+の数', value: count('play:plus') },
          { label: 'プレイしたCパワーの数', value: count('play:cpower') },
        ] },
        { label: 'プレイしたイベントの数', value: count(...PLAYED_EVENT), children: [
          { label: 'プレイした単なるイベントの数', value: count('play:event') },
          { label: 'プレイしたCイベントの数', value: count('play:cevent') },
        ] },
        { label: '手札に加えたハプニングの数', value: count('happening') },
      ] },
      { label: '最もプレイしたカード', value: () => (cards.length ? `${cardName(cards[0][0])}（${num(cards[0][1])}回）` : 'なし'), link: true },
      { label: '自分が破壊した他家のパワーの数', value: count(...DESTROY), children: [
        { label: '自分が破壊した他家の単なるパワーの数', value: count('destroy:power') },
        { label: '自分が破壊した他家のフルパワーの数', value: count('destroy:full', 'destroy:cfull'), children: [
          { label: '自分が破壊した他家のCフルパワーの数', value: count('destroy:cfull') },
        ] },
        { label: '自分が破壊した他家のパワー+の数', value: count('destroy:plus') },
        { label: '自分が破壊した他家のCパワーの数', value: count('destroy:cpower') },
      ] },
      { label: '破壊された自分のパワーの数', value: count(...LOST), children: [
        { label: '破壊された自分のフルパワーの数', value: count('lost:full', 'lost:cfull'), children: [
          { label: '破壊された自分のCフルパワーの数', value: count('lost:cfull') },
        ] },
        { label: '破壊された自分のパワー+の数', value: count('lost:plus') },
        { label: '破壊された自分のCパワーの数', value: count('lost:cpower') },
      ] },
      { label: '打ち消したカードの数', value: count(...COUNTER_POWER, ...COUNTER_EVENT), children: [
        { label: 'パワーを打ち消した回数', value: count(...COUNTER_POWER), children: [
          { label: '単なるパワーを打ち消した回数', value: count('counter:power') },
          { label: 'フルパワーを打ち消した回数', value: count('counter:full', 'counter:cfull'), children: [
            { label: 'Cフルパワーを打ち消した回数', value: count('counter:cfull') },
          ] },
          { label: 'パワー+を打ち消した回数', value: count('counter:plus') },
          { label: 'Cパワーを打ち消した回数', value: count('counter:cpower') },
        ] },
        { label: 'イベントを打ち消した回数', value: count(...COUNTER_EVENT), children: [
          { label: '単なるイベントを打ち消した回数', value: count('counter:event') },
          { label: 'Cイベントを打ち消した回数', value: count('counter:cevent') },
        ] },
      ] },
      { label: '達成した実績数', value: () => `${got.length} / ${SM.Achievements.LIST.filter(SM.Achievements.isVisible).length}`, children: [
        { label: '最初に達成した実績', value: () => (first ? first.a.name : 'なし') },
        { label: '最初に実績を達成した日付', value: () => date(first && first.at) },
        { label: '最後に達成した実績', value: () => (last ? last.a.name : 'なし') },
        { label: '最後に実績を達成した日付', value: () => date(last && last.at) },
      ] },
    ];
  }

  /** 項目1つ（下の項目があれば、押すと開く） */
  function itemEl(it) {
    const row = (tag) => {
      const e = document.createElement(tag);
      e.className = 'stat-row';
      const label = document.createElement('span');
      label.className = 'stat-row__label';
      label.textContent = it.label;
      const value = document.createElement('span');
      value.className = 'stat-row__value';
      if (it.link) SM.Cards.linkify(value, it.value());
      else value.textContent = it.value();
      e.append(label, value);
      return e;
    };
    if (!it.children || !it.children.length) {
      const leaf = row('div');
      leaf.classList.add('stat-row--leaf');
      return leaf;
    }
    const d = document.createElement('details');
    d.className = 'stat-group';
    d.appendChild(row('summary'));
    const kids = document.createElement('div');
    kids.className = 'stat-children';
    for (const c of it.children) kids.appendChild(itemEl(c));
    d.appendChild(kids);
    return d;
  }

  function render() {
    renderBest();
    st = SM.Achievements.stats();
    const list = $('stats-list');
    list.innerHTML = '';
    for (const it of items()) list.appendChild(itemEl(it));
  }

  SM.Stats = { render, offerWin, shareText };
})();
