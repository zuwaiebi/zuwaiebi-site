// WebSocket 接続。切れたら自動で再接続し、保存済みトークンで席に復帰する
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const TOKEN_KEY = 'super_mahjong_token';
  const NAME_KEY = 'super_mahjong_name';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* 保存できない環境 */ } },
  };

  function serverUrl() {
    const q = new URLSearchParams(location.search).get('server');
    if (q) return q;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/super-mahjong/ws`;
  }

  const handlers = {};
  let ws = null;
  let queue = []; // 接続前に送ろうとしたメッセージ（接続後に送る）
  let retry = 0;
  let statusCb = () => {};

  function connect() {
    if (location.protocol === 'file:') { statusCb('file'); return; }
    statusCb('connecting');
    ws = new WebSocket(serverUrl());
    ws.onopen = () => {
      retry = 0;
      statusCb('open');
      ws.send(JSON.stringify({ type: 'hello', token: store.get(TOKEN_KEY), name: getName(), icon: SM.Icons ? SM.Icons.mine() : null }));
      const pending = queue;
      queue = [];
      for (const m of pending) ws.send(JSON.stringify(m));
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'welcome') store.set(TOKEN_KEY, m.token);
      (handlers[m.type] || []).forEach((f) => f(m));
    };
    ws.onclose = (e) => {
      ws = null;
      if (e.code === 4000) { statusCb('replaced'); return; } // 別タブで開き直した
      statusCb('closed');
      const wait = Math.min(10000, 500 * 2 ** retry++);
      setTimeout(connect, wait);
    };
  }

  function send(obj) {
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; }
    // 回答は古くなるので溜めない。部屋の操作などは接続後に送る
    if (obj.type !== 'answer' && obj.type !== 'ready') queue.push(obj);
    return false;
  }

  function getName() { return store.get(NAME_KEY) || ''; }
  function setName(n) { store.set(NAME_KEY, n); send({ type: 'setName', name: n }); }
  function setIcon(id) { send({ type: 'setProfile', icon: id }); }

  SM.Net = {
    connect, send, getName, setName, setIcon, store,
    on(type, f) { (handlers[type] = handlers[type] || []).push(f); },
    onStatus(f) { statusCb = f; },
    reconnectNow() { if (!ws) connect(); },
  };
})();
