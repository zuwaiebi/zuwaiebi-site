// カードの表示（上からカード名・イラスト・カードタイプ・テキスト）と詳細表示
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);

  const DEFS = new Map((window.SM_CARDS || []).map((c) => [c.id, c]));
  const TYPE_COLOR = {
    power: '#0070C0', full: '#FF0000', plus: '#00B050', event: '#FFC000', happening: '#7030A0',
  };
  const IMG_DIR = 'data/card_img/';

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function formatText(text) {
    return text.split('\n').map((line) => {
      const t = line.trim();
      if (/^\*.*\*$/.test(t)) return `<p class="card__flavor">${esc(t.slice(1, -1))}</p>`;
      return `<p>${esc(t)}</p>`;
    }).join('');
  }

  function typeBadge(def) {
    if (def.typeKey === 'happeningPower') {
      return `<span class="card__badge card__badge--split" style="background:linear-gradient(90deg, ${TYPE_COLOR.happening} 50%, ${TYPE_COLOR.power} 50%)">${esc(def.type)}</span>`;
    }
    return `<span class="card__badge" style="background:${TYPE_COLOR[def.typeKey] || '#555'}">${esc(def.type)}</span>`;
  }

  /**
   * カード要素を作る
   * @param {string|null} cid カードID（null なら裏向き）
   * @param {object} o { size: 'full'|'mini'|'tiny', onClick, cls }
   */
  function el(cid, o = {}) {
    const size = o.size || 'mini';
    const d = document.createElement('div');
    d.className = `card card--${size}${o.cls ? ` ${o.cls}` : ''}`;
    const def = cid ? DEFS.get(cid) : null;
    if (!def) {
      d.classList.add('card--back');
      d.innerHTML = '<div class="card__backlogo">SUPER<br>麻雀</div>';
    } else {
      d.dataset.type = def.typeKey;
      const nameLen = [...def.name].length;
      const nameScale = nameLen <= 6 ? 1 : Math.max(0.38, 6 / nameLen);
      d.innerHTML = `<div class="card__name" style="--ns:${nameScale}">${esc(def.name)}</div>`
        + `<div class="card__art">${def.img ? `<img src="${IMG_DIR}${encodeURIComponent(def.img)}" alt="" loading="lazy" draggable="false">` : ''}</div>`
        + `<div class="card__type">${typeBadge(def)}</div>`
        + (size === 'full' ? `<div class="card__text">${formatText(def.text)}</div>` : '');
      d.title = def.name;
    }
    if (o.onClick) {
      d.classList.add('is-clickable');
      d.addEventListener('click', (e) => { e.stopPropagation(); o.onClick(cid, d); });
    } else if (def && o.detail !== false) {
      d.classList.add('is-clickable');
      d.addEventListener('click', (e) => { e.stopPropagation(); showDetail(cid); });
    }
    return d;
  }

  /** カードの詳細を大きく表示する。actions: [{label, cls, onClick}] */
  function showDetail(cid, o = {}) {
    const box = $('card-detail');
    const body = $('card-detail-body');
    body.innerHTML = '';
    body.appendChild(el(cid, { size: 'full', detail: false }));
    const acts = document.createElement('div');
    acts.className = 'card-detail__actions';
    for (const a of o.actions || []) {
      const b = document.createElement('button');
      b.className = `main-button ${a.cls || ''}`;
      b.textContent = a.label;
      b.addEventListener('click', () => { hideDetail(); a.onClick(); });
      acts.appendChild(b);
    }
    const close = document.createElement('button');
    close.className = 'sub-button';
    close.textContent = '閉じる';
    close.addEventListener('click', hideDetail);
    acts.appendChild(close);
    body.appendChild(acts);
    box.hidden = false;
  }

  function hideDetail() { $('card-detail').hidden = true; }

  // カードをプレイした時の大きな表示。targetLine: 「使用者 >>> 選んだもの」の行（無ければ null）
  let overlayTimer = null;
  function showPlayed(cid, caption, targetLine) {
    const box = $('card-play');
    box.innerHTML = '';
    box.classList.remove('is-trigger');
    const cap = document.createElement('div');
    cap.className = 'card-play__caption';
    cap.textContent = caption;
    box.appendChild(cap);
    if (targetLine) {
      targetLine.classList.add('card-play__target');
      box.appendChild(targetLine);
    }
    box.appendChild(el(cid, { size: 'full', detail: false }));
    box.hidden = false;
    box.classList.remove('is-anim');
    void box.offsetWidth;
    box.classList.add('is-anim');
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => { box.hidden = true; }, 1700);
  }

  // 盤面のパワーが発動した時の表示: カードから波紋が広がる（カードのプレイとは別の見た目）
  function showTriggered(cid, caption) {
    const box = $('card-play');
    box.innerHTML = '';
    box.classList.remove('is-anim');
    box.classList.add('is-trigger');
    const cap = document.createElement('div');
    cap.className = 'card-play__caption';
    cap.textContent = caption;
    box.appendChild(cap);
    const wrap = document.createElement('div');
    wrap.className = 'trigger-wrap';
    const def = DEFS.get(cid);
    wrap.style.setProperty('--rc', (def && TYPE_COLOR[def.typeKey === 'happeningPower' ? 'power' : def.typeKey]) || '#ffd34d');
    for (let i = 0; i < 3; i++) {
      const ring = document.createElement('span');
      ring.className = 'trigger-ripple';
      ring.style.animationDelay = `${i * 0.22}s`;
      wrap.appendChild(ring);
    }
    wrap.appendChild(el(cid, { size: 'full', detail: false, cls: 'card--trigger' }));
    box.appendChild(wrap);
    box.hidden = false;
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => { box.hidden = true; box.classList.remove('is-trigger'); }, 1150);
  }

  function init() {
    $('card-detail').addEventListener('click', (e) => { if (e.target.id === 'card-detail') hideDetail(); });
    $('card-play').addEventListener('click', () => { $('card-play').hidden = true; });
  }

  SM.Cards = { el, def: (cid) => DEFS.get(cid), showDetail, hideDetail, showPlayed, showTriggered, init, TYPE_COLOR };
})();
