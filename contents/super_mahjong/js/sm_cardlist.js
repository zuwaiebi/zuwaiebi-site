// カード一覧: すべてのカード（イベント・パワー・フルパワー・パワー＋・ハプニング）を見る。
// カード名・テキストで検索し（空白で区切るとすべてを含むもの）、カードタイプで絞り込む。カードを押すと詳細
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);
  const CARDS = window.SM_CARDS || [];
  // 絞り込み（ハプニングなパワーは「パワー」と「ハプニング」のどちらにも入る）
  const TYPES = [
    { key: 'all', label: 'すべて', has: () => true },
    { key: 'event', label: 'イベント', has: (c) => c.typeKey === 'event' },
    { key: 'power', label: 'パワー', has: (c) => c.typeKey === 'power' || c.typeKey === 'happeningPower' },
    { key: 'full', label: 'フルパワー', has: (c) => c.typeKey === 'full' },
    { key: 'plus', label: 'パワー＋', has: (c) => c.typeKey === 'plus' },
    { key: 'happening', label: 'ハプニング', has: (c) => c.typeKey === 'happening' || c.typeKey === 'happeningPower' },
  ];
  // 検索では表記ゆれ（全角半角・ひらがなカタカナ・大文字小文字・空白・中黒）を無視する
  const norm = (s) => String(s).normalize('NFKC').toLowerCase()
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/[\s･・·]/g, '');
  const HAY = new Map(CARDS.map((c) => [c.id, norm(`${c.name}\n${c.text}`)]));

  let type = 'all';
  let built = false;
  let timer = null;

  function render() {
    built = true;
    const terms = $('cardlist-q').value.split(/\s+/).map(norm).filter(Boolean);
    const hit = CARDS.filter((c) => terms.every((t) => HAY.get(c.id).includes(t)));
    // 絞り込みのボタンには、検索に合うカードの種類ごとの枚数
    for (const b of $('cardlist-types').children) {
      const t = TYPES.find((x) => x.key === b.dataset.type);
      b.classList.toggle('is-on', t.key === type);
      b.setAttribute('aria-pressed', String(t.key === type));
      b.querySelector('.cardlist-type__n').textContent = hit.filter(t.has).length;
    }
    const shown = hit.filter(TYPES.find((x) => x.key === type).has);
    $('cardlist-count').textContent = shown.length === CARDS.length ? `${shown.length}枚` : `${shown.length} / ${CARDS.length}枚`;
    const grid = $('cardlist-grid');
    grid.innerHTML = '';
    for (const c of shown) grid.appendChild(SM.Cards.el(c.id, { size: 'mini' }));
    if (!shown.length) {
      const p = document.createElement('p');
      p.className = 'cardlist-empty';
      p.textContent = '見つかりません';
      grid.appendChild(p);
    }
  }

  /** タブを開いた時（初めて開くまでは一覧を作らない） */
  function show() {
    if (!built) render();
  }

  function init() {
    const box = $('cardlist-types');
    for (const t of TYPES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cardlist-type';
      b.dataset.type = t.key;
      if (SM.Cards.TYPE_COLOR[t.key]) b.style.setProperty('--tc', SM.Cards.TYPE_COLOR[t.key]);
      const n = document.createElement('span');
      n.className = 'cardlist-type__n';
      b.append(t.label, n);
      b.addEventListener('click', () => { type = t.key; render(); });
      box.appendChild(b);
    }
    // 入力のたびに作り直すと重いので、打ち終わるのを少し待つ
    $('cardlist-q').addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(render, 150);
    });
  }

  SM.CardList = { init, show, render };
})();
