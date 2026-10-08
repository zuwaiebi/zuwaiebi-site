// 出来事のログ（カードのプレイ・破壊・点数移動・サイコロなど）
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);
  const MAX = 80;

  const cardName = (cid) => {
    const d = cid ? SM.Cards.def(cid) : null;
    return d ? `《${d.name}》` : 'カード';
  };
  const who = (s) => (typeof s === 'number' ? SM.Main.seatName(s) : s === 'pot' ? '供託' : 'ゲーム外');
  const HAND = { g: '✊', c: '✌', p: '✋' };

  function text(e) {
    switch (e.type) {
      case 'cardPlay': {
        const target = SM.Icons.targetText(e.shown, e.reactTo);
        return `${who(e.seat)}が${e.hidden && !e.cid ? 'カード' : cardName(e.cid)}を${e.reaction ? '割り込みで' : ''}プレイ${target ? `（${target}）` : ''}`;
      }
      case 'cardCountered': return `${cardName(e.cid)}は打ち消された`;
      case 'cardFizzle': return `${cardName(e.cid)}は場に空きがなく失敗した`;
      case 'happening': return `${who(e.seat)}のハプニング ${cardName(e.cid)}`;
      case 'powerDestroyed': return `${who(e.seat)}の${cardName(e.cid)}が破壊された`;
      case 'powerGain': return `${who(e.seat)}の場に${cardName(e.cid)}`;
      case 'powerMove': return `${cardName(e.cid)}が${who(e.from)}から${who(e.to)}へ移った`;
      case 'powerTransform': return `${who(e.seat)}のパワーが${cardName(e.cid)}に変化`;
      case 'powerProtected': return `${who(e.seat)}の${cardName(e.cid)}は失われない`;
      case 'cardDiscard': return `${who(e.seat)}が${cardName(e.cid)}を捨てた`;
      case 'ability': return `${who(e.seat)}が${cardName(e.cid)}の能力を使った`;
      case 'powerTrigger': return e.ability ? `${who(e.seat)}が${cardName(e.cid)}の能力を使った` : `${who(e.seat)}の${cardName(e.cid)}が発動`;
      case 'payment': return `${who(e.from)} → ${who(e.to)} ${e.amount}点`;
      case 'dice': return `${who(e.seat)}のサイコロ: ${e.values.join(' ・ ')}${e.label ? `（${e.label}）` : ''}`;
      // 結果は書かない（回っている間にログで分からないように。止まった後にカードの効果のログで出す）
      case 'roulette': return `${who(e.seat)}のルーレット${e.label ? `（${e.label}）` : ''}`;
      case 'rps': return `じゃんけん ${who(e.a)} ${HAND[e.ha]} ー ${HAND[e.hb]} ${who(e.b)}`;
      case 'compare': {
        const list = e.entries.map((x) => `${who(x.seat)} ${x.kind === null || x.kind === undefined ? '—' : SM.Tiles.kindLabel(x.kind)}`).join(' / ');
        return `${e.title}: ${list}${e.text ? `（${e.text}）` : ''}`;
      }
      case 'agariCanceled': return `${who(e.seat)}の和了は取り消された`;
      case 'callCanceled': return `${who(e.seat)}の鳴きは取り消された`;
      case 'reflect': return `${who(e.seat)}の${cardName(e.cid)}が跳ね返した`;
      case 'log': return e.text;
      default: return null;
    }
  }

  function add(game, e) {
    const t = text(e);
    if (!t) return;
    const box = $('log-list');
    if (!box) return;
    const li = document.createElement('li');
    SM.Cards.linkify(li, t);
    box.prepend(li);
    while (box.children.length > MAX) box.lastChild.remove();
    const latest = $('log-latest');
    if (latest) SM.Cards.linkify(latest, t);
  }

  /** ログを空にする（新しく対局を始めた時に、前の対局の分を消す） */
  function clear() {
    const box = $('log-list');
    if (box) box.innerHTML = '';
    const latest = $('log-latest');
    if (latest) latest.textContent = '';
  }

  function init() {
    $('log-toggle').addEventListener('click', () => {
      const box = $('log-panel');
      box.hidden = !box.hidden;
    });
  }

  SM.Log = { init, add, clear };
})();
