// ロビー（名前・部屋作成・参加）と待機室
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);

  const TIME_OPTIONS = [[0, '無制限'], [10, '10秒'], [15, '15秒'], [20, '20秒'], [30, '30秒'], [60, '60秒']];
  const BANK_OPTIONS = [[0, 'なし'], [30, '30秒'], [60, '60秒'], [120, '120秒'], [300, '300秒']];

  function fillSelect(sel, opts) {
    sel.innerHTML = opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  }

  function readRules(prefix) {
    const f = (n) => $(`${prefix}-${n}`);
    return {
      players: Number(f('players').value),
      length: f('length').value,
      red: f('red').checked,
      kuitan: f('kuitan').checked,
      startPoints: Number(f('start').value),
      tobi: f('tobi').checked,
      perTurn: Number(f('perturn').value),
      bank: Number(f('bank').value),
      cards: f('cards').checked,
    };
  }

  function writeRules(prefix, r) {
    const f = (n) => $(`${prefix}-${n}`);
    f('players').value = String(r.players);
    f('length').value = r.length;
    f('red').checked = r.red;
    f('kuitan').checked = r.kuitan;
    f('start').value = String(r.startPoints);
    f('tobi').checked = r.tobi;
    f('perturn').value = String(r.perTurn);
    f('bank').value = String(r.bank);
    f('cards').checked = r.cards !== false;
  }

  function setupRuleForm(prefix, onChange) {
    fillSelect($(`${prefix}-perturn`), TIME_OPTIONS);
    fillSelect($(`${prefix}-bank`), BANK_OPTIONS);
    $(`${prefix}-players`).addEventListener('change', () => {
      $(`${prefix}-start`).value = $(`${prefix}-players`).value === '3' ? '35000' : '25000';
    });
    const form = $(`${prefix}-form`);
    form.addEventListener('change', () => onChange && onChange(readRules(prefix)));
  }

  function rulesText(r) {
    const t = r.perTurn ? `1手${r.perTurn}秒${r.bank ? `+持ち時間${r.bank}秒` : ''}` : '時間無制限';
    return [
      `${r.players === 3 ? '三麻（チーなし・北抜きあり・ツモ損）' : '四麻'}`,
      { ikkyoku: '一局戦', tonpuu: '東風戦', hanchan: '半荘戦' }[r.length] || '半荘戦',
      `${r.startPoints}点持ち`,
      r.red ? '赤あり' : '赤なし',
      r.kuitan ? '喰いタンあり' : '喰いタンなし',
      r.tobi ? '飛びあり' : '飛びなし',
      t,
      r.cards === false ? 'カードなし' : 'カードあり',
    ].join(' / ');
  }

  function init() {
    const nameInput = $('lobby-name');
    nameInput.value = SM.Net.getName();
    nameInput.addEventListener('change', () => SM.Net.setName(nameInput.value.trim().slice(0, 12)));
    // アイコン: カードのイラストから選ぶ（初めての時はランダム）
    const iconBtn = $('lobby-icon');
    const showIcon = () => { iconBtn.innerHTML = ''; iconBtn.appendChild(SM.Icons.el(SM.Icons.mine())); };
    showIcon();
    iconBtn.addEventListener('click', () => SM.Icons.openPicker((id) => { showIcon(); SM.Net.setIcon(id); }));

    setupRuleForm('create');
    setupRuleForm('room', (rules) => SM.Net.send({ type: 'setRules', rules }));

    $('btn-create').addEventListener('click', () => {
      SM.Net.setName(nameInput.value.trim().slice(0, 12));
      SM.Net.send({ type: 'createRoom', rules: readRules('create') });
    });
    const join = () => {
      const code = $('join-code').value.trim().toUpperCase();
      if (!code) return;
      SM.Net.setName(nameInput.value.trim().slice(0, 12));
      SM.Net.send({ type: 'joinRoom', code });
    };
    $('btn-join').addEventListener('click', join);
    $('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

    const q = new URLSearchParams(location.search).get('room');
    if (q) $('join-code').value = q.toUpperCase();

    $('btn-leave').addEventListener('click', () => SM.Net.send({ type: 'leaveRoom' }));
    $('btn-start').addEventListener('click', () => SM.Net.send({ type: 'startGame' }));
    $('btn-copy-link').addEventListener('click', () => {
      const url = `${location.origin}${location.pathname}?room=${$('room-code').textContent}`;
      const done = () => SM.Main.toast('招待リンクをコピーしました');
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt('招待リンク', url));
      else prompt('招待リンク', url);
    });
  }

  function renderRoom(room) {
    $('room-code').textContent = room.code;
    $('room-rules-text').textContent = rulesText(room.rules);
    const host = room.youAreHost;
    $('room-form').hidden = !host;
    if (host && document.activeElement?.closest?.('#room-form') == null) writeRules('room', room.rules);
    $('btn-start').hidden = !host;
    $('btn-start').disabled = room.seats.some((s) => !s);
    $('room-wait-msg').hidden = host;

    const list = $('room-seats');
    list.innerHTML = '';
    room.seats.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'seat-row';
      const label = document.createElement('span');
      label.className = 'seat-row__name';
      if (!s) label.textContent = '（空席）';
      else {
        label.appendChild(SM.Icons.el(s.icon));
        label.append(`${s.name}${s.kind === 'cpu' ? '（CPU）' : ''}${s.host ? ' 👑' : ''}${i === room.you ? '（あなた）' : ''}${s.connected ? '' : ' ※切断中'}`);
      }
      li.appendChild(label);
      if (host) {
        if (!s) {
          const b = document.createElement('button');
          b.className = 'small-button';
          b.textContent = 'CPUを入れる';
          b.onclick = () => SM.Net.send({ type: 'addCpu', seat: i });
          li.appendChild(b);
        } else if (i !== room.you) {
          const b = document.createElement('button');
          b.className = 'small-button';
          b.textContent = s.kind === 'cpu' ? 'CPUを外す' : '退出させる';
          b.onclick = () => SM.Net.send({ type: 'kick', seat: i });
          li.appendChild(b);
        }
      }
      list.appendChild(li);
    });
  }

  SM.Lobby = { init, renderRoom, rulesText };
})();
