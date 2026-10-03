// 局結果・最終結果の表示
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);

  const REASON = {
    exhaustive: '流局', forced: '流局', kyuushu: '九種九牌', suufon: '四風連打', suucha: '四家立直', suukaikan: '四開槓',
  };

  const nameOf = (room, seat) => {
    const s = room.seats[seat];
    return s ? s.name : '（退出）';
  };

  function tilesRow(ids, red, extraCls) {
    const row = document.createElement('div');
    row.className = `tiles-row ${extraCls || ''}`;
    ids.forEach((t) => row.appendChild(SM.Tiles.el(t, { red, size: 'sm' })));
    return row;
  }

  function scoreTable(room, game, info) {
    const table = document.createElement('table');
    table.className = 'score-table';
    const n = info.before.length;
    for (let s = 0; s < n; s++) {
      const tr = document.createElement('tr');
      const delta = info.after[s] - info.before[s];
      const w = game ? SM.Table.WIND[game.players[s].wind - 27] : '';
      tr.innerHTML = `<td>${w}</td><td class="name"></td><td>${info.before[s]}</td>`
        + `<td class="${delta > 0 ? 'plus' : delta < 0 ? 'minus' : ''}">${delta > 0 ? '+' : ''}${delta || ''}</td><td>${info.after[s]}</td>`;
      const nm = tr.querySelector('.name');
      nm.appendChild(SM.Icons.el(room.seats[s] && room.seats[s].icon));
      nm.append(nameOf(room, s) + (s === room.you ? '（あなた）' : ''));
      table.appendChild(tr);
    }
    return table;
  }

  function showRound(room, game, result) {
    const box = $('result-body');
    box.innerHTML = '';
    const r = result.result;
    const red = game ? game.red : true;
    const title = document.createElement('h2');
    title.className = 'result-title';

    if (r.type === 'agari') {
      title.textContent = `${result.label}　${nameOf(room, r.winner)} ${r.isTsumo ? 'ツモ' : `ロン（放銃: ${nameOf(room, r.loser)}）`}`;
      box.appendChild(title);
      const hand = document.createElement('div');
      hand.className = 'result-hand';
      hand.appendChild(tilesRow(r.hand, red));
      const win = tilesRow([r.winTile], red, 'win-tile');
      hand.appendChild(win);
      r.melds.forEach((m) => hand.appendChild(SM.Table.meldEl(m, r.winner, room.seats.length, red, 'sm')));
      if (r.kita.length) hand.appendChild(tilesRow(r.kita, red, 'kita'));
      box.appendChild(hand);

      const dora = document.createElement('div');
      dora.className = 'result-dora';
      dora.append('ドラ表示 ', tilesRow(r.doraIndicators, red));
      if (r.uraIndicators.length) dora.append('　裏ドラ表示 ', tilesRow(r.uraIndicators, red));
      box.appendChild(dora);

      const yaku = document.createElement('ul');
      yaku.className = 'yaku-list';
      r.yaku.forEach((y) => {
        const li = document.createElement('li');
        li.innerHTML = `<span></span><span>${y.han}翻</span>`;
        li.firstChild.textContent = y.name;
        yaku.appendChild(li);
      });
      box.appendChild(yaku);
      const pts = document.createElement('p');
      pts.className = 'result-points';
      pts.textContent = r.han >= 13 ? `${r.han}翻 ${r.limit}　${r.label}` : `${r.fu}符 ${r.han}翻${r.limit ? ` ${r.limit}` : ''}　${r.label}`;
      box.appendChild(pts);
    } else {
      const nagashi = (r.nagashi || []).map((s) => nameOf(room, s)).join('・');
      title.textContent = `${result.label}　${REASON[r.reason] || '流局'}${nagashi ? `（流し満貫: ${nagashi}）` : ''}`;
      box.appendChild(title);
      if (r.reason === 'exhaustive') {
        const list = document.createElement('div');
        list.className = 'tenpai-list';
        r.tenpai.forEach((t, s) => {
          const row = document.createElement('div');
          row.className = 'tenpai-row';
          const label = document.createElement('span');
          label.textContent = `${nameOf(room, s)}：${t ? '聴牌' : '不聴'}`;
          row.appendChild(label);
          if (t && r.hands[s]) row.appendChild(tilesRow(r.hands[s], red));
          list.appendChild(row);
        });
        box.appendChild(list);
      }
    }

    box.appendChild(scoreTable(room, game, result));

    const btn = $('btn-ready');
    const ready = result.ready.includes(room.you);
    btn.disabled = ready;
    btn.textContent = ready ? '他のプレイヤーを待っています…' : (result.end ? '最終結果へ' : '次の局へ');
    $('result').hidden = false;
  }

  function hideRound() { $('result').hidden = true; }

  function showFinal(room, ranking, scores) {
    const box = $('final-body');
    box.innerHTML = '';
    const ol = document.createElement('ol');
    ol.className = 'ranking';
    ranking.forEach((r) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="rank">${r.rank}位</span><span class="name"></span><span class="score">${r.score}</span>`;
      const nm = li.querySelector('.name');
      nm.appendChild(SM.Icons.el(room.seats[r.seat] && room.seats[r.seat].icon));
      nm.append(nameOf(room, r.seat) + (r.seat === room.you ? '（あなた）' : ''));
      if (r.seat === room.you) li.classList.add('is-you');
      ol.appendChild(li);
    });
    box.appendChild(ol);
    $('btn-back-room').hidden = !room.youAreHost;
    $('final-wait').hidden = room.youAreHost;
    void scores;
  }

  function init() {
    $('btn-ready').addEventListener('click', () => {
      SM.Net.send({ type: 'ready' });
      $('btn-ready').disabled = true;
    });
    $('btn-back-room').addEventListener('click', () => SM.Net.send({ type: 'backToRoom' }));
    $('btn-final-leave').addEventListener('click', () => SM.Net.send({ type: 'leaveRoom' }));
  }

  SM.Result = { init, showRound, hideRound, showFinal };
})();
