// BGM（タイトルで選んだ曲を対局中だけ流す）と効果音。設定は super_mahjong_ 接頭辞で localStorage に保存
(function () {
  const SM = (window.SuperMahjong = window.SuperMahjong || {});
  const $ = (id) => document.getElementById(id);
  const BGM_DIR = 'data/bgm/';
  const SE_DIR = 'data/se/';
  const SE_FILES = {
    打牌: '打牌.mp3', ツモる: 'ツモる.mp3', ドロー: 'ドロー.wav', イベント発動: 'イベント発動.wav', パワー使用: 'パワー使用.mp3',
    和了: '和了.mp3', 役満和了: '役満和了.mp3', 洗牌: '洗牌.mp3', 破壊: '破壊.mp3', サイコロ: 'サイコロ.mp3',
    実績: 'achievement.wav',
  };
  const KEY = { bgm: 'super_mahjong_bgm', bgmVol: 'super_mahjong_bgm_vol', seVol: 'super_mahjong_se_vol', mute: 'super_mahjong_mute' };
  const LIST = window.SM_BGM || [];
  const settings = { bgm: '', bgmVol: 0.5, seVol: 0.7, mute: false };

  let bgm = null;       // 対局中のBGM
  let preview = null;   // タイトルでの試聴
  let inGame = false;
  let held = false;     // 和了してから次の局が始まるまで一時停止している
  let blocked = null;   // ブラウザに自動再生を止められた音（次に画面を触った時に流す）

  /** 実績の報酬の曲で、まだ手に入れていないもの（選べない） */
  const lockOf = (file) => (SM.Achievements ? SM.Achievements.bgmLock(file) : null);

  function load() {
    const st = SM.Net.store;
    const file = st.get(KEY.bgm);
    settings.bgm = file && LIST.some((b) => b.file === file) && !lockOf(file) ? file : '';
    const num = (k, d) => { const v = Number(st.get(k)); return st.get(k) !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d; };
    settings.bgmVol = num(KEY.bgmVol, 0.5);
    settings.seVol = num(KEY.seVol, 0.7);
    settings.mute = st.get(KEY.mute) === '1';
  }
  const save = (k) => SM.Net.store.set(KEY[k], k === 'mute' ? (settings.mute ? '1' : '0') : String(settings[k]));
  const volume = (kind) => (settings.mute ? 0 : kind === 'bgm' ? settings.bgmVol : settings.seVol);

  function tryPlay(a) {
    const p = a.play();
    if (p && p.catch) p.catch(() => { blocked = a; });
  }

  function newTrack(file) {
    const a = new Audio(BGM_DIR + encodeURIComponent(file));
    a.loop = true;
    a.volume = volume('bgm');
    a.dataset.file = file;
    return a;
  }

  function stopAudio(a) {
    if (!a) return;
    a.pause();
    a.removeAttribute('src');
    a.load();
    if (blocked === a) blocked = null;
  }

  // ---- 対局中のBGM ----
  function startBgm() {
    if (!settings.bgm) { stopBgm(); return; }
    if (bgm && bgm.dataset.file === settings.bgm) {
      bgm.volume = volume('bgm');
      if (bgm.paused && !held) tryPlay(bgm);
      return;
    }
    stopBgm();
    bgm = newTrack(settings.bgm);
    if (!held) tryPlay(bgm);
  }
  function stopBgm() { stopAudio(bgm); bgm = null; }

  /** 和了した時に一時停止し、次の局が始まったら続きから流す */
  function holdBgm(on) {
    if (held === Boolean(on)) return;
    held = Boolean(on);
    if (!bgm) return;
    if (held) {
      bgm.pause();
      if (blocked === bgm) blocked = null;
    } else if (inGame) tryPlay(bgm);
  }

  // ---- タイトルでの試聴 ----
  function stopPreview() {
    stopAudio(preview);
    preview = null;
    const b = $('bgm-preview');
    if (b) b.textContent = '▶ 試聴';
  }
  function togglePreview() {
    if (preview) { stopPreview(); return; }
    if (!settings.bgm) return;
    preview = newTrack(settings.bgm);
    tryPlay(preview);
    $('bgm-preview').textContent = '■ 停止';
  }

  /** 画面が変わった時（フルパワー選択〜対局中だけBGMを流す） */
  function onScreen(id) {
    const game = id === 'screen-pregame' || id === 'screen-game';
    if (id !== 'screen-lobby') stopPreview();
    if (game) {
      if (!inGame) held = false;
      inGame = true;
      startBgm();
    } else if (inGame) { inGame = false; held = false; stopBgm(); }
  }

  // ---- 効果音（同じ音を重ねて鳴らせるよう3つずつ用意） ----
  const pools = {};
  function se(name) {
    const v = volume('se');
    const file = SE_FILES[name];
    if (!v || !file) return;
    let pool = pools[name];
    if (!pool) {
      pool = pools[name] = { i: 0, list: [0, 1, 2].map(() => { const a = new Audio(SE_DIR + encodeURIComponent(file)); a.preload = 'auto'; return a; }) };
    }
    const a = pool.list[pool.i++ % pool.list.length];
    a.volume = v;
    try { a.currentTime = 0; } catch { /* 読み込み前 */ }
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
  }

  function applyVolume() {
    if (bgm) bgm.volume = volume('bgm');
    if (preview) preview.volume = volume('bgm');
    const m = $('btn-mute');
    if (m) { m.textContent = settings.mute ? '🔇' : '🔊'; m.title = settings.mute ? '音を出す' : '音を消す'; }
  }

  /** タイトルの曲の一覧（実績の報酬の曲は、手に入れるまで灰色で選べない） */
  function fillBgmSelect() {
    const sel = $('bgm-select');
    sel.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'なし（BGMを流さない）';
    sel.appendChild(none);
    for (const b of LIST) {
      const o = document.createElement('option');
      o.value = b.file;
      const lock = lockOf(b.file);
      o.textContent = lock ? `🔒 ${b.title}（実績「${lock.name}」で解放）` : b.title;
      o.disabled = Boolean(lock);
      sel.appendChild(o);
    }
    sel.value = settings.bgm;
  }

  function init() {
    load();
    const sel = $('bgm-select');
    fillBgmSelect();
    if (SM.Achievements) SM.Achievements.onUnlock(fillBgmSelect);
    sel.addEventListener('change', () => {
      settings.bgm = sel.value;
      save('bgm');
      const playing = Boolean(preview);
      stopPreview();
      if (playing && settings.bgm) togglePreview();
      $('bgm-preview').disabled = !settings.bgm;
    });
    $('bgm-preview').disabled = !settings.bgm;
    $('bgm-preview').addEventListener('click', togglePreview);
    for (const [id, k] of [['bgm-vol', 'bgmVol'], ['se-vol', 'seVol']]) {
      const input = $(id);
      input.value = Math.round(settings[k] * 100);
      input.addEventListener('input', () => { settings[k] = Number(input.value) / 100; save(k); applyVolume(); });
    }
    // 効果音の音量を変えた時は試しに鳴らす
    $('se-vol').addEventListener('change', () => se('打牌'));
    $('btn-mute').addEventListener('click', () => { settings.mute = !settings.mute; save('mute'); applyVolume(); if (!settings.mute && inGame) startBgm(); });
    applyVolume();
    // 自動再生を止められた音は、次に画面を触った時に流す
    const resume = () => { if (blocked) { const a = blocked; blocked = null; tryPlay(a); } };
    document.addEventListener('pointerdown', resume, true);
    document.addEventListener('keydown', resume, true);
  }

  SM.Audio = { init, onScreen, se, holdBgm, LIST };
})();
