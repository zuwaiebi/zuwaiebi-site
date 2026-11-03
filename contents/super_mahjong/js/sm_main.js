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

  /** ミッションの条件を終局を待たずに満たした対局中か（「退出」を点滅させ、押すとやめても成功になることを知らせる） */
  const missionAchieved = (room) => Boolean(room && room.mission && room.mission.achieved && (room.state === 'playing' || room.state === 'result'));

  /** 画面の色（部屋情報の mission.theme があれば body の data-theme。CSS の body[data-theme="…"]。部屋を出たら元に戻す） */
  function applyTheme(room) {
    const theme = room && room.mission && room.mission.theme;
    if (theme) document.body.dataset.theme = theme;
    else delete document.body.dataset.theme;
  }

  function onRoom(m) {
    if (performance.now() < leavingUntil) return;
    const room = m.room;
    // ミッション・デイリーミッションの部屋は待機室を通さずにすぐ始まる（作った直後の待機中の知らせは見せない）
    if ((room.mission || room.daily) && room.state === 'waiting') return;
    state.room = room;
    applyTheme(room);
    document.querySelectorAll('[data-exit]').forEach((b) => b.classList.toggle('is-blink', missionAchieved(room)));
    // ミッション中はミッションの曲を流す（2回戦は部屋情報の mission.bgm）
    SM.Audio.setTrack(room.mission ? room.mission.bgm || SM.Missions.bgmOf(room.mission.id) : null);
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
    // ミッションの次の対局に進むかを聞く暗転した画面（BGMは止まる）
    if (room.state === 'interlude') {
      SM.Result.hideRound();
      SM.Prompt.hide();
      SM.Monty.update(null);
      SM.Cards.hideDetail();
      SM.Missions.showInterlude(room);
      show('screen-interlude');
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
      : missionAchieved(state.room) ? 'ミッションの条件はもう満たしています。ここでやめても、このミッションは成功になります（今の順位と点数で結果の画面に移ります）。'
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
    const achieved = missionAchieved(state.room);
    $('exit-box').hidden = true;
    SM.Cards.hideDetail();
    SM.Deck.close();
    SM.Decks.close();
    SM.Prompt.hide();
    SM.Monty.update(null);
    SM.Result.hideRound();
    $('pile-box').hidden = true;
    $('card-play').hidden = true;
    // 条件を満たしたミッション: サーバーが対局を止めて成功にし、終局画面（終局した部屋の知らせ）を送ってくる
    if (achieved) {
      SM.Net.send({ type: 'quitMission' });
      return;
    }
    if (code) $('join-code').value = code;
    SM.Net.send({ type: 'leaveRoom' });
    leavingUntil = performance.now() + 3000;
    state.room = null;
    state.game = null;
    SM.Audio.setTrack(null);
    applyTheme(null);
    show('screen-lobby');
    if (mission) {
      SM.Lobby.showTab('missions');
      toast(daily ? 'デイリーミッションをやめました' : 'ミッションをやめました');
    } else toast(code ? `対局から退出しました（部屋コード ${code} で戻れます）` : '対局から退出しました');
  }

  function init() {
    SM.Tiles.probeImages(() => SM.Table.rerender(true));
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
    SM.Net.on('lobby', () => { leavingUntil = 0; SM.Audio.setTrack(null); applyTheme(null); show('screen-lobby'); });
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
