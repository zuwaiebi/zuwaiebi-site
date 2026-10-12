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

  // 点数の表示: カスタムモードの青天井で大きくなった時（1億以上）は、上の2つの単位までで出す（例: 527兆7655億）
  const UNITS = ['', '万', '億', '兆', '京', '垓', '𥝱', '穣', '溝', '澗', '正', '載', '極', '恒河沙', '阿僧祇', '那由他', '不可思議', '無量大数'];
  function points(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || Math.abs(v) < 1e8) return String(n);
    const a = Math.abs(v);
    let u = Math.floor(Math.log10(a) / 4);
    if (a / 10 ** (4 * u) >= 1e4) u++;
    if (u >= UNITS.length) return v.toExponential(3);
    const unit = 10 ** (4 * u);
    const head = Math.floor(a / unit);
    const rest = Math.floor((a - head * unit) / (unit / 1e4));
    return `${v < 0 ? '-' : ''}${head}${UNITS[u]}${rest ? `${rest}${UNITS[u - 1]}` : ''}`;
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
    // ミッション・デイリーミッションの部屋は待機室を通さずにすぐ始まる（作った直後の待機中の知らせは見せない）
    if ((room.mission || room.daily) && room.state === 'waiting') return;
    state.room = room;
    // ミッション中はミッションの曲を流す
    SM.Audio.setTrack(room.mission ? SM.Missions.bgmOf(room.mission.id) : null);
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
    // チュートリアル中の「退出」は、練習をやめる確認にする
    const tut = Boolean(SM.Tutorial && SM.Tutorial.active());
    const mission = Boolean(state.room && state.room.mission);
    // デイリーミッション: その日1回目の挑戦は、途中でやめても1回目（記録は途中退出）
    const daily = Boolean(state.room && state.room.daily);
    $('exit-box').querySelector('.result-title').textContent = tut ? 'チュートリアルをやめますか？'
      : mission ? 'ミッションをやめますか？' : daily ? 'デイリーミッションをやめますか？' : '対局から退出しますか？';
    $('exit-ok').textContent = tut || mission || daily ? 'やめる' : '退出する';
    $('exit-text').textContent = tut
      ? '練習はロビーの「ガイド」から、何度でもやり直せます。'
      : mission ? '途中でやめると、このミッションは失敗になります（挑戦した回数には数えます）。'
        : daily ? (SM.Missions.isFirstDaily(state.room)
          ? '今日1回目の挑戦は、途中でやめても1回目として扱い、今日の記録は「途中退出」になります（このあと挑戦しても記録されません）。'
          : '2回目以降の挑戦なので、やめても今日の記録は変わりません。')
          : `退出した席はCPUが最後まで代わりに打ちます。同じブラウザで部屋コード「${code}」を入力すると、途中から戻れます。`;
    $('exit-box').hidden = false;
  }

  function doExit() {
    if (SM.Tutorial && SM.Tutorial.active()) {
      $('exit-box').hidden = true;
      SM.Tutorial.stop();
      return;
    }
    const daily = Boolean(state.room && state.room.daily);
    const mission = Boolean(state.room && state.room.mission) || daily;
    const code = state.room && !mission ? state.room.code : '';
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
    SM.Audio.setTrack(null);
    show('screen-lobby');
    if (mission) {
      SM.Lobby.showTab('missions');
      toast(daily ? 'デイリーミッションをやめました' : 'ミッションをやめました');
    } else toast(code ? `対局から退出しました（部屋コード ${code} で戻れます）` : '対局から退出しました');
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
    SM.Missions.init();
    SM.Ranking.init();
    SM.CardList.init();
    SM.Lobby.init();
    SM.Input.init();
    SM.Prompt.init();
    SM.Monty.init();
    SM.Log.init();
    SM.Result.init();
    SM.Tutorial.init();
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
    SM.Net.on('lobby', () => { leavingUntil = 0; SM.Audio.setTrack(null); show('screen-lobby'); });
    SM.Net.on('room', onRoom);
    // 実績の達成・累計の記録（サーバーが判定して、その人にだけ送ってくる）
    SM.Net.on('achievements', (m) => SM.Achievements.apply(m.list));
    SM.Net.on('error', (m) => { toast(m.message); SM.Input.onRejected(); });
    SM.Net.on('kicked', () => { toast('部屋から退出させられました'); show('screen-lobby'); });
    SM.Net.on('welcome', (m) => { if (!$('lobby-name').value) $('lobby-name').value = m.name; });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) SM.Net.reconnectNow(); });

    SM.Net.connect();
  }

  SM.Main = { toast, show, seatName, seatIcon, state, askExit, points };
  document.addEventListener('DOMContentLoaded', init);
})();
