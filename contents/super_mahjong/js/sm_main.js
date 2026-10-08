// 画面遷移とサーバーメッセージの振り分け
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);
  const state = { room: null, game: null };
  let leavingUntil = 0;    // 退出を送った直後に届く途中の卓の情報は無視する
  let logGame = null;      // ログに出している対局（部屋コードと、その部屋で何回目の対局か）

  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
    SM.Audio.onScreen(id);
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
  }

  function seatName(s) {
    const seat = state.room && state.room.seats[s];
    return seat ? seat.name : `P${s + 1}`;
  }

  function seatIcon(s) {
    const seat = state.room && state.room.seats[s];
    return seat ? seat.icon : null;
  }

  const STATUS = {
    connecting: '接続中…', open: '', closed: 'サーバーとの接続が切れました。再接続しています…',
    replaced: '別のタブで開かれたため、この画面は切断されました。', file: 'このページはサーバー経由で開いてください（ファイル直接では対戦できません）。',
  };

  function onRoom(m) {
    if (performance.now() < leavingUntil) return;
    const room = m.room;
    state.room = room;
    if (room.error) toast(`エラーで対局が終了しました: ${room.error}`);
    if (room.state !== 'waiting') {
      SM.Deck.close();
      SM.Decks.close();
      // 新しく対局を始めたら前の対局のログを消す（同じ対局に入り直した時は残す）
      const key = `${room.code}:${room.gameNo}`;
      if (key !== logGame) {
        SM.Log.clear();
        // 前の対局で答えた問い合わせの番号を覚えたままだと、新しい対局の問い合わせを答え済みと取り違えることがある
        SM.Prompt.reset();
        SM.Input.reset();
        logGame = key;
      }
    }
    if (room.state === 'waiting') {
      SM.Result.hideRound();
      SM.Prompt.hide();
      SM.Monty.update(null);
      SM.Lobby.renderRoom(room);
      show('screen-room');
      return;
    }
    if (room.state === 'finished') {
      SM.Result.hideRound();
      SM.Prompt.hide();
      SM.Monty.update(null);
      SM.Result.showFinal(room, m.ranking || [], m.scores);
      show('screen-final');
      return;
    }
    if (m.pregame) {
      SM.Prompt.showPregame(m.pregame, room);
      show('screen-pregame');
      return;
    }
    show('screen-game');
    if (m.game) {
      state.game = m.game;
      SM.Input.update(m.game);
      SM.Table.render(m.game, room);
      SM.Table.showEvents(m.game, m.events);
      SM.Prompt.update(m.game.prompt, m.game.timeLeft);
      SM.Monty.update(m.game);
    }
    if (room.state === 'result' && m.result) {
      SM.Result.showRound(room, m.game, m.result);
      // 和了の結果を見ている間はBGMを止めておく（途中から入り直した時も）
      if (m.result.result && m.result.result.type === 'agari') SM.Audio.holdBgm(true);
    } else SM.Result.hideRound();
  }

  // 途中退出: 確認してから部屋を出る。席はCPUが引き継ぎ、部屋コードを入れ直すと戻れる
  function askExit() {
    const code = state.room ? state.room.code : '';
    $('exit-text').textContent = `退出した席はCPUが最後まで代わりに打ちます。同じブラウザで部屋コード「${code}」を入力すると、途中から戻れます。`;
    $('exit-box').hidden = false;
  }

  function doExit() {
    const code = state.room ? state.room.code : '';
    $('exit-box').hidden = true;
    SM.Cards.hideDetail();
    SM.Deck.close();
    SM.Decks.close();
    SM.Prompt.hide();
    SM.Monty.update(null);
    SM.Result.hideRound();
    $('pile-box').hidden = true;
    $('card-play').hidden = true;
    if (code) $('join-code').value = code;
    SM.Net.send({ type: 'leaveRoom' });
    leavingUntil = performance.now() + 3000;
    state.room = null;
    state.game = null;
    show('screen-lobby');
    toast(code ? `対局から退出しました（部屋コード ${code} で戻れます）` : '対局から退出しました');
  }

  function init() {
    SM.Tiles.probeImages(() => SM.Table.rerender());
    SM.Tiles.initHighlight();
    SM.Cards.init();
    SM.Icons.init();
    SM.Audio.init();
    SM.Deck.init();
    SM.Decks.init();
    SM.Achievements.init();
    SM.CardList.init();
    SM.Lobby.init();
    SM.Input.init();
    SM.Prompt.init();
    SM.Monty.init();
    SM.Log.init();
    SM.Result.init();
    $('pile-box').addEventListener('click', (e) => { if (e.target.id === 'pile-box' || e.target.id === 'pile-close') $('pile-box').hidden = true; });
    document.querySelectorAll('[data-exit]').forEach((b) => b.addEventListener('click', askExit));
    $('exit-ok').addEventListener('click', doExit);
    $('exit-cancel').addEventListener('click', () => { $('exit-box').hidden = true; });
    $('exit-box').addEventListener('click', (e) => { if (e.target.id === 'exit-box') $('exit-box').hidden = true; });

    SM.Net.onStatus((s) => {
      const bar = $('status-bar');
      bar.textContent = STATUS[s] || '';
      bar.hidden = !STATUS[s];
    });
    SM.Net.on('lobby', () => { leavingUntil = 0; show('screen-lobby'); });
    SM.Net.on('room', onRoom);
    // 実績の達成・累計の記録（サーバーが判定して、その人にだけ送ってくる）
    SM.Net.on('achievements', (m) => SM.Achievements.apply(m.list));
    SM.Net.on('error', (m) => { toast(m.message); SM.Input.onRejected(); });
    SM.Net.on('kicked', () => { toast('部屋から退出させられました'); show('screen-lobby'); });
    SM.Net.on('welcome', (m) => { if (!$('lobby-name').value) $('lobby-name').value = m.name; });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) SM.Net.reconnectNow(); });

    SM.Net.connect();
  }

  SM.Main = { toast, show, seatName, seatIcon, state };
  document.addEventListener('DOMContentLoaded', init);
})();
