(() => {
  "use strict";

  // ドラフトシミュレーター(cube_spec.md 10節)。cube.jsが公開するwindow.CubeSharedを
  // 経由してキューブデータ・既存のカード/デッキ描画ヘルパーを再利用する。
  //
  // このIIFEの前半(パック循環エンジン・CPUのピック判定)はDOM/windowに依存しない純粋な
  // 関数のみで構成し、Node上でも(`module.exports`経由で)単体テストできるようにしてある。
  // 後半はブラウザ専用のDOM描画・イベント配線。

  // --- 形式ごとの設定 ---
  const DRAFT_FORMATS = {
    glimpse: {
      label: "グリンプスドラフト(2人)", seatCount: 2, cpuLabels: ["A"],
      cardsPerPack: 15, rounds: 5, picksPerTurn: 2, excludesPerTurn: 1,
      directionPerRound: [1, 1, 1, 1, 1],
    },
    normal: {
      label: "通常ピック(6人)", seatCount: 6, cpuLabels: ["A", "B", "C", "D", "E"],
      cardsPerPack: 15, rounds: 3, picksPerTurn: 1, excludesPerTurn: 0,
      directionPerRound: [1, -1, 1],
    },
  };

  function turnsPerRound(format) { return format.cardsPerPack / (format.picksPerTurn + format.excludesPerTurn); }
  function totalDeckSize(format) { return format.rounds * format.picksPerTurn * turnsPerRound(format); }
  function cutCount(format) { return totalDeckSize(format) - 40; }

  // --- パック循環エンジン(両形式共通。座席数2のグリンプスも同じ巡回式で成立する) ---
  function shuffle(list, rng) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function drawPackFromPool(session, format, originSeatIndex) {
    const cards = session.shuffledPool.slice(session.poolCursor, session.poolCursor + format.cardsPerPack);
    session.poolCursor += format.cardsPerPack;
    return { id: session.roundIndex + "-" + originSeatIndex, cards, holderSeatIndex: originSeatIndex, resolvedThisTick: false };
  }

  function dealRound(session, ctx) {
    const format = DRAFT_FORMATS[session.format];
    session.direction = format.directionPerRound[session.roundIndex];
    session.packs = session.seats.map((seat, i) => drawPackFromPool(session, format, i));
    session.seats.forEach((s) => { s.turnsThisRound = 0; });
    session.pendingSelections = { add: [], exclude: null };
    resolveAllPendingCpuTurns(session, ctx);
  }

  function resolveTurn(session, pack, seat, addIds, excludeIds) {
    pack.cards = pack.cards.filter((id) => !addIds.includes(id) && !excludeIds.includes(id));
    seat.deck = seat.deck.concat(addIds);
    seat.exclusionPile = seat.exclusionPile.concat(excludeIds);
    seat.turnsThisRound += 1;
    pack.resolvedThisTick = true;
  }

  function resolveAllPendingCpuTurns(session, ctx) {
    const format = DRAFT_FORMATS[session.format];
    session.packs.forEach((pack) => {
      if (pack.resolvedThisTick) return;
      const seat = session.seats[pack.holderSeatIndex];
      if (seat.kind !== "cpu") return;
      const result = pickForCpu(seat, pack, format, ctx);
      resolveTurn(session, pack, seat, result.picks, result.excludes);
    });
  }

  // 1手番分すべてのパックが空になるタイミングは全パック共通(cardsPerPackが
  // picksPerTurn+excludesPerTurnで割り切れるため)なので、端数が残る心配はない。
  function advanceTick(session, ctx) {
    const format = DRAFT_FORMATS[session.format];
    const remaining = session.packs.filter((p) => p.cards.length > 0);
    session.packs = remaining.map((p) => ({
      id: p.id,
      cards: p.cards,
      holderSeatIndex: (p.holderSeatIndex + session.direction + format.seatCount) % format.seatCount,
      resolvedThisTick: false,
    }));
    session.pendingSelections = { add: [], exclude: null };

    if (session.packs.length === 0) {
      if (session.roundIndex + 1 < format.rounds) {
        session.roundIndex += 1;
        dealRound(session, ctx);
      } else {
        session.mode = "finalReview";
        session.finalReview = { deckCardIds: session.seats[0].deck.slice(), cutIds: [], enchantTransfers: {} };
      }
    } else {
      resolveAllPendingCpuTurns(session, ctx);
    }
  }

  function onPlayerTurnResolved(session, ctx, addIds, excludeIds) {
    const pack = session.packs.find((p) => p.holderSeatIndex === 0);
    resolveTurn(session, pack, session.seats[0], addIds, excludeIds);
    advanceTick(session, ctx);
  }

  function createSession(cubeId, formatKey, liveCardIds, ctx) {
    const format = DRAFT_FORMATS[formatKey];
    const seats = [{ id: 0, kind: "player", label: "あなた", deck: [], exclusionPile: [], turnsThisRound: 0 }];
    format.cpuLabels.forEach((label, i) => {
      seats.push({ id: i + 1, kind: "cpu", label: "CPU " + label, deck: [], exclusionPile: [], turnsThisRound: 0 });
    });
    const session = {
      version: 1, cubeId, format: formatKey, mode: "picking",
      seats, shuffledPool: shuffle(liveCardIds, ctx.rng), poolCursor: 0,
      roundIndex: 0, direction: format.directionPerRound[0], packs: [],
      pendingSelections: { add: [], exclude: null },
      finalReview: null, finishedDeck: null,
    };
    dealRound(session, ctx);
    return session;
  }

  // --- CPUのピック判定: Jaccard係数(過去デッキでの同時出現率)による類似度スコアリング ---
  function buildDeckNameIndex(decks) {
    const byName = new Map();
    decks.forEach((deck, i) => {
      const names = new Set(deck.cards.map((c) => c.name));
      names.forEach((name) => {
        if (!byName.has(name)) byName.set(name, new Set());
        byName.get(name).add(i);
      });
    });
    return byName;
  }

  function jaccardScore(nameA, nameB, index) {
    const a = index.get(nameA);
    const b = index.get(nameB);
    if (!a || !b) return null;
    let both = 0;
    a.forEach((i) => { if (b.has(i)) both += 1; });
    const union = a.size + b.size - both;
    return union === 0 ? null : both / union;
  }

  function scoreCandidate(candidateName, handNames, index) {
    const scores = [];
    handNames.forEach((h) => {
      const s = jaccardScore(candidateName, h, index);
      if (s !== null) scores.push(s);
    });
    if (scores.length === 0) return null;
    let sum = 0;
    scores.forEach((s) => { sum += s; });
    return sum / scores.length;
  }

  // ctx = { rng, nameOf(id), deckNameIndex } を注入する(ブラウザ/Nodeどちらでも同じ関数で動く)。
  // 手持ちが空、または候補全てのスコアが0(データ無し)の場合は自然にランダム選択へ落ちる。
  // 除外枠は常にランダム。
  function pickForCpu(seat, pack, format, ctx) {
    const rng = ctx.rng;
    const nameOf = ctx.nameOf;
    let candidates = pack.cards.slice();
    const picks = [];

    for (let i = 0; i < format.picksPerTurn; i++) {
      const handNames = seat.deck.concat(picks).map(nameOf);
      let chosen;
      if (handNames.length === 0) {
        chosen = candidates[Math.floor(rng() * candidates.length)];
      } else {
        const scored = [];
        candidates.forEach((id) => {
          const score = scoreCandidate(nameOf(id), handNames, ctx.deckNameIndex);
          if (score !== null && score > 0) scored.push({ id, score });
        });
        if (scored.length === 0) {
          chosen = candidates[Math.floor(rng() * candidates.length)];
        } else {
          let max = -Infinity;
          scored.forEach((s) => { if (s.score > max) max = s.score; });
          const tied = scored.filter((s) => s.score === max);
          chosen = tied[Math.floor(rng() * tied.length)].id;
        }
      }
      picks.push(chosen);
      candidates = candidates.filter((id) => id !== chosen);
    }

    const excludes = [];
    for (let i = 0; i < format.excludesPerTurn; i++) {
      const chosen = candidates[Math.floor(rng() * candidates.length)];
      excludes.push(chosen);
      candidates = candidates.filter((id) => id !== chosen);
    }
    return { picks, excludes };
  }

  if (typeof window === "undefined") {
    if (typeof module !== "undefined" && module.exports) {
      module.exports = {
        DRAFT_FORMATS, turnsPerRound, totalDeckSize, cutCount,
        shuffle, createSession, dealRound, resolveTurn, resolveAllPendingCpuTurns,
        advanceTick, onPlayerTurnResolved,
        buildDeckNameIndex, jaccardScore, scoreCandidate, pickForCpu,
      };
    }
    return;
  }

  // ============================================================
  // ここから先はブラウザ専用(DOM操作・cube.jsとの連携)
  // ============================================================

  const CubeShared = window.CubeShared;
  const $ = CubeShared.$;
  const $$ = CubeShared.$$;

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function cardById(id) {
    const found = CubeShared.state.cubeData.cards.find((c) => c.id === id);
    if (found) return found;
    return (CubeShared.state.trashData.cards || []).find((c) => c.id === id) || null;
  }

  function isTrashCard(id) {
    return !CubeShared.state.cubeData.cards.some((c) => c.id === id);
  }

  function nameOfId(id) {
    const card = cardById(id);
    return card ? CubeShared.displayName(card) : "";
  }

  // エンチャントもカード同様、キューブから削除済み(ゴミ箱行き)の可能性を考慮して
  // 現行データに無ければゴミ箱データも見る(allEnchantCandidatesと同じ考え方)。
  function resolveEnchantById(enchantId) {
    if (!enchantId) return null;
    const live = CubeShared.state.cubeData.enchants.find((e) => e.id === enchantId);
    if (live) return { enchant: live, fromTrash: false };
    const trashed = (CubeShared.state.trashData.enchants || []).find((e) => e.id === enchantId);
    return trashed ? { enchant: trashed, fromTrash: true } : null;
  }

  let deckNameIndexCache = null;
  function makeCtx() {
    return { rng: Math.random, nameOf: nameOfId, deckNameIndex: deckNameIndexCache };
  }

  // --- localStorageへの進行状況の保存/復元 ---
  function simulatorStorageKey(cubeId) { return "cubeSimulatorDraft:" + cubeId; }

  function saveSessionToStorage() {
    if (!session) return;
    try {
      localStorage.setItem(simulatorStorageKey(session.cubeId), JSON.stringify(session));
    } catch (err) { /* 保存できなくてもドラフト自体は継続できるので無視する */ }
  }

  function loadSessionFromStorage(cubeId) {
    try {
      const raw = localStorage.getItem(simulatorStorageKey(cubeId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && parsed.cubeId === cubeId && DRAFT_FORMATS[parsed.format]) {
        return parsed;
      }
    } catch (err) { /* 壊れたデータは無視してセットアップ画面にフォールバックする */ }
    return null;
  }

  function clearSessionStorage(cubeId) {
    try { localStorage.removeItem(simulatorStorageKey(cubeId)); } catch (err) { /* noop */ }
  }

  // --- 画面切り替え ---
  let session = null;

  function showSimScreen(mode) {
    $("#sim-setup-screen").hidden = mode !== "setup";
    $("#sim-pick-screen").hidden = mode !== "picking";
    $("#sim-final-review-screen").hidden = mode !== "finalReview";
    $("#sim-finished-screen").hidden = mode !== "finished";
  }

  // opts: { pendingBadge: string|null, onClick: fn }
  function buildSimCardTile(card, cardId, opts) {
    const o = opts || {};
    const tile = document.createElement("div");
    tile.className = "card-tile";
    tile.tabIndex = 0;
    tile.setAttribute("role", "button");
    const nameStr = CubeShared.displayName(card);
    tile.setAttribute("aria-label", nameStr);

    if (card.baseImage) {
      const img = document.createElement("img");
      img.className = "base-image";
      img.loading = "lazy";
      img.src = CubeShared.cardImagePath("base", card.baseImage, isTrashCard(cardId));
      img.alt = nameStr;
      tile.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "placeholder";
      ph.textContent = nameStr;
      tile.appendChild(ph);
    }

    const enchantInfo = resolveEnchantById(card.enchantId);
    if (enchantInfo && enchantInfo.enchant.overlayImage) {
      const overlay = document.createElement("img");
      overlay.className = "overlay-image";
      overlay.loading = "lazy";
      overlay.src = CubeShared.cardImagePath("enchant", enchantInfo.enchant.overlayImage, isTrashCard(cardId));
      overlay.alt = "エンチャント: " + enchantInfo.enchant.name;
      tile.appendChild(overlay);
    }

    if (card.baseImage) {
      const caption = document.createElement("div");
      caption.className = "card-name-caption";
      caption.textContent = nameStr;
      tile.appendChild(caption);
    }

    if (o.pendingBadge) {
      const badge = document.createElement("div");
      badge.className = "sim-cut-badge";
      badge.textContent = o.pendingBadge;
      tile.appendChild(badge);
    }
    if (o.stateClass) tile.classList.add(o.stateClass);

    tile.addEventListener("click", () => { if (o.onClick) o.onClick(); });
    tile.addEventListener("keydown", (ev) => {
      if ((ev.key === "Enter" || ev.key === " ") && o.onClick) { ev.preventDefault(); o.onClick(); }
    });
    return tile;
  }

  // --- セットアップ画面 ---
  function selectedFormatKey() {
    return $("#sim-format-normal").checked ? "normal" : "glimpse";
  }

  function updateStartButtonState() {
    const format = DRAFT_FORMATS[selectedFormatKey()];
    const need = format.cardsPerPack * format.seatCount * format.rounds;
    const have = CubeShared.state.cubeData.cards.length;
    const errorEl = $("#sim-setup-error");
    const startBtn = $("#sim-start-btn");
    if (have < need) {
      errorEl.textContent = "このキューブにはこの形式に必要な" + need + "枚のカードがありません（現在" + have + "枚）。";
      startBtn.disabled = true;
    } else {
      errorEl.textContent = "";
      startBtn.disabled = false;
    }
  }

  function renderSetupScreen() {
    const select = $("#sim-cube-select");
    select.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = CubeShared.cubeId;
    opt.textContent = CubeShared.state.cubeData.displayName || CubeShared.cubeId;
    select.appendChild(opt);
    updateStartButtonState();
  }

  function startDraft() {
    transferSourceCardId = null;
    const formatKey = selectedFormatKey();
    const format = DRAFT_FORMATS[formatKey];
    const need = format.cardsPerPack * format.seatCount * format.rounds;
    if (CubeShared.state.cubeData.cards.length < need) return;

    deckNameIndexCache = buildDeckNameIndex(CubeShared.state.decksData.decks || []);
    const liveCardIds = CubeShared.state.cubeData.cards.map((c) => c.id);
    session = createSession(CubeShared.cubeId, formatKey, liveCardIds, makeCtx());
    saveSessionToStorage();
    renderPickScreen();
  }

  // --- ピック画面 ---
  function renderPickScreen() {
    const format = DRAFT_FORMATS[session.format];
    $("#sim-status-pack").textContent = "パック: " + (session.roundIndex + 1) + "/" + format.rounds;
    $("#sim-status-turn").textContent = "このラウンドのピック回数: " + session.seats[0].turnsThisRound + "/" + turnsPerRound(format);
    $("#sim-status-count").textContent = "取得枚数: " + session.seats[0].deck.length + "/" + totalDeckSize(format);

    const pack = session.packs.find((p) => p.holderSeatIndex === 0);
    const grid = $("#sim-pack-grid");
    grid.innerHTML = "";
    if (pack) {
      pack.cards.forEach((cardId) => {
        const card = cardById(cardId);
        const isAdded = session.pendingSelections.add.includes(cardId);
        const isExcluded = session.pendingSelections.exclude === cardId;
        const tile = buildSimCardTile(card, cardId, {
          pendingBadge: isAdded ? "採用" : (isExcluded ? "除外" : null),
          stateClass: isAdded ? "sim-pending-add" : (isExcluded ? "sim-pending-exclude" : null),
          onClick: () => openSimPackCardModal(cardId),
        });
        grid.appendChild(tile);
      });
    }

    renderSimDeckRatios();

    const list = $("#sim-deck-list-text");
    list.innerHTML = "";
    session.seats[0].deck.forEach((id) => {
      const li = document.createElement("li");
      li.textContent = nameOfId(id);
      li.addEventListener("click", () => openSimDeckCardModal(id));
      list.appendChild(li);
    });

    showSimScreen("picking");
  }

  // --- デッキの文明比率・単色/多色比率(円グラフ) ---
  // ツインパクトは上面・下面の文明の和集合で判定する(cube.jsのisCardMulticolorと同じ基準。
  // 上下がそれぞれ単色でも異なる文明の組み合わせなら多色とみなす)。
  function buildPieChartEl(segments) {
    const total = segments.reduce((sum, s) => sum + s.count, 0);
    const wrap = document.createElement("div");
    wrap.className = "sim-pie-block";

    const pie = document.createElement("div");
    pie.className = "sim-pie-chart";
    if (total === 0) {
      pie.style.background = "var(--panel)";
    } else {
      let acc = 0;
      const stops = [];
      segments.forEach((s) => {
        if (s.count === 0) return;
        const start = (acc / total) * 360;
        acc += s.count;
        const end = (acc / total) * 360;
        stops.push(s.color + " " + start + "deg " + end + "deg");
      });
      pie.style.background = "conic-gradient(" + stops.join(", ") + ")";
    }
    wrap.appendChild(pie);

    const legend = document.createElement("div");
    legend.className = "sim-pie-legend";
    segments.forEach((s) => {
      const item = document.createElement("div");
      item.className = "sim-pie-legend-item";
      const dot = document.createElement("span");
      dot.className = "sim-pie-legend-dot";
      dot.style.background = s.color;
      item.appendChild(dot);
      const text = document.createElement("span");
      text.textContent = s.label + " " + s.count;
      item.appendChild(text);
      legend.appendChild(item);
    });
    wrap.appendChild(legend);
    return wrap;
  }

  function renderSimDeckRatios() {
    const civCounts = {};
    CubeShared.CIV_ORDER.forEach((c) => { civCounts[c] = 0; });
    let mono = 0;
    let multi = 0;
    session.seats[0].deck.forEach((id) => {
      const card = cardById(id);
      if (!card) return;
      const civSet = new Set();
      CubeShared.cardFaces(card).forEach((face) => (face.civilizations || []).forEach((c) => civSet.add(c)));
      civSet.forEach((c) => { if (c in civCounts) civCounts[c] += 1; });
      if (CubeShared.isCardMulticolor(card)) multi += 1; else mono += 1;
    });

    const civWrap = $("#sim-deck-civ-pie");
    civWrap.innerHTML = "";
    civWrap.appendChild(buildPieChartEl(CubeShared.CIV_ORDER.map((c) => ({ label: c, count: civCounts[c], color: "var(--civ-" + c + ")" }))));

    const colorWrap = $("#sim-deck-color-pie");
    colorWrap.innerHTML = "";
    colorWrap.appendChild(buildPieChartEl([
      { label: "単色", count: mono, color: "var(--color-mono)" },
      { label: "多色", count: multi, color: "var(--color-multi)" },
    ]));
  }

  function renderSimPackCardModalBody(card) {
    const nameStr = CubeShared.displayName(card);
    const imageWrap = $("#sim-pack-card-modal-image");
    imageWrap.innerHTML = "";
    const mainImageSlot = document.createElement("div");
    mainImageSlot.className = "card-modal-main-image";
    if (card.baseImage) {
      const img = document.createElement("img");
      img.className = "base-image";
      img.src = CubeShared.cardImagePath("base", card.baseImage);
      img.alt = nameStr;
      mainImageSlot.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "placeholder";
      ph.style.aspectRatio = "5 / 7";
      ph.style.display = "flex";
      ph.style.alignItems = "center";
      ph.style.justifyContent = "center";
      ph.style.background = "var(--panel)";
      ph.style.borderRadius = "10px";
      ph.textContent = nameStr;
      mainImageSlot.appendChild(ph);
    }
    const enchantInfo = resolveEnchantById(card.enchantId);
    if (enchantInfo && enchantInfo.enchant.overlayImage) {
      const overlay = document.createElement("img");
      overlay.className = "overlay-image";
      overlay.src = CubeShared.cardImagePath("enchant", enchantInfo.enchant.overlayImage);
      overlay.alt = "エンチャント: " + enchantInfo.enchant.name;
      mainImageSlot.appendChild(overlay);
    }
    imageWrap.appendChild(mainImageSlot);

    $("#sim-pack-card-modal-name").textContent = nameStr;
    const typeLabel = (card.cardTypes || []).join("/");
    const basics = [
      ["文明", (card.civilizations || []).join("/") || "―"],
      ["コスト", card.cost ?? "―"],
      ["パワー", card.power ?? "―"],
      ["種族", card.race || "―"],
      ["カードタイプ", typeLabel || "―"],
    ];
    $("#sim-pack-card-modal-basics").innerHTML = basics
      .map((pair) => "<dt>" + escapeHtml(pair[0]) + "</dt><dd>" + escapeHtml(pair[1]) + "</dd>")
      .join("");
    $("#sim-pack-card-modal-ability").textContent = card.abilityText || "（記載なし）";
  }

  function closeSimPackCardModal() { $("#sim-pack-card-modal").classList.remove("open"); }

  // 自分のデッキ一覧(文字リスト)のカード名クリック用。ピック操作は行わず閲覧のみなので
  // アクションボタンは出さない。
  function openSimDeckCardModal(cardId) {
    const card = cardById(cardId);
    renderSimPackCardModalBody(card);
    $("#sim-pack-card-actions").innerHTML = "";
    $("#sim-pack-card-modal").classList.add("open");
  }

  function openSimPackCardModal(cardId) {
    const format = DRAFT_FORMATS[session.format];
    const card = cardById(cardId);
    renderSimPackCardModalBody(card);

    const actionsEl = $("#sim-pack-card-actions");
    actionsEl.innerHTML = "";

    const isAdded = session.pendingSelections.add.includes(cardId);
    const isExcluded = session.pendingSelections.exclude === cardId;

    if (isAdded || isExcluded) {
      const undoBtn = document.createElement("button");
      undoBtn.type = "button";
      undoBtn.className = "clear-filters";
      undoBtn.textContent = "取り消す";
      undoBtn.addEventListener("click", () => {
        if (isAdded) session.pendingSelections.add = session.pendingSelections.add.filter((id) => id !== cardId);
        if (isExcluded) session.pendingSelections.exclude = null;
        saveSessionToStorage();
        closeSimPackCardModal();
        renderPickScreen();
      });
      actionsEl.appendChild(undoBtn);
    } else {
      if (session.pendingSelections.add.length < format.picksPerTurn) {
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "clear-filters";
        addBtn.textContent = "デッキに加える";
        addBtn.addEventListener("click", () => {
          session.pendingSelections.add.push(cardId);
          closeSimPackCardModal();
          afterPendingSelectionChange();
        });
        actionsEl.appendChild(addBtn);
      }
      if (format.excludesPerTurn > 0 && session.pendingSelections.exclude === null) {
        const excludeBtn = document.createElement("button");
        excludeBtn.type = "button";
        excludeBtn.className = "deck-delete-btn";
        excludeBtn.textContent = "カードを除外する";
        excludeBtn.addEventListener("click", () => {
          session.pendingSelections.exclude = cardId;
          closeSimPackCardModal();
          afterPendingSelectionChange();
        });
        actionsEl.appendChild(excludeBtn);
      }
    }

    $("#sim-pack-card-modal").classList.add("open");
  }

  function afterPendingSelectionChange() {
    const format = DRAFT_FORMATS[session.format];
    const quotaMet = session.pendingSelections.add.length === format.picksPerTurn
      && (format.excludesPerTurn === 0 || session.pendingSelections.exclude !== null);
    if (quotaMet) {
      const addIds = session.pendingSelections.add.slice();
      const excludeIds = session.pendingSelections.exclude !== null ? [session.pendingSelections.exclude] : [];
      onPlayerTurnResolved(session, makeCtx(), addIds, excludeIds);
    }
    saveSessionToStorage();
    if (session.mode === "finalReview") {
      renderFinalReviewScreen();
    } else {
      renderPickScreen();
    }
  }

  // --- 最終調整画面 ---
  function keptCardIds() {
    return session.finalReview.deckCardIds.filter((id) => !session.finalReview.cutIds.includes(id));
  }

  function eligibleTransferTargets(forCutId) {
    const transfers = session.finalReview.enchantTransfers;
    const assignedTargets = Object.keys(transfers)
      .filter((cutId) => cutId !== forCutId)
      .map((cutId) => transfers[cutId]);
    return keptCardIds().filter((id) => {
      const card = cardById(id);
      return !card.enchantId && !assignedTargets.includes(id);
    });
  }

  function pruneInvalidEnchantTransfers() {
    const transfers = session.finalReview.enchantTransfers;
    const kept = keptCardIds();
    Object.keys(transfers).forEach((cutId) => {
      if (!session.finalReview.cutIds.includes(cutId) || !kept.includes(transfers[cutId])) {
        delete transfers[cutId];
      }
    });
  }

  // 移し替え元として選択中のカード(nullなら選択中の移し替えは無い)。セッションには
  // 保存しない(一時的なUI状態。リロードすれば選択は解除される)。
  let transferSourceCardId = null;

  function toggleCutCard(cardId) {
    const format = DRAFT_FORMATS[session.format];
    const cc = cutCount(format);
    const idx = session.finalReview.cutIds.indexOf(cardId);
    if (idx >= 0) {
      session.finalReview.cutIds.splice(idx, 1);
    } else {
      if (session.finalReview.cutIds.length >= cc) return;
      session.finalReview.cutIds.push(cardId);
    }
    pruneInvalidEnchantTransfers();
    saveSessionToStorage();
    renderFinalReviewScreen();
  }

  // 移し替え元ボタンを押した後に別のカードをクリックした時の処理。移し替え選択中は
  // 通常のトグル(取り除く/戻す)を無効化し、有効な移し替え先だけを受け付ける。
  function onFinalTileClick(cardId) {
    if (transferSourceCardId !== null) {
      if (cardId === transferSourceCardId) return;
      if (!eligibleTransferTargets(transferSourceCardId).includes(cardId)) return;
      session.finalReview.enchantTransfers[transferSourceCardId] = cardId;
      transferSourceCardId = null;
      pruneInvalidEnchantTransfers();
      saveSessionToStorage();
      renderFinalReviewScreen();
      return;
    }
    toggleCutCard(cardId);
  }

  // 取り除くカード(エンチャント付き)に表示する「エンチャントを移し替える」ボタン。
  // 未選択→ボタン押下で選択モードへ(ラベルは「キャンセル」に変化)。既に移し替え先が
  // 決まっていればボタン自体が「→ 移し替え先名 ✕」表示になり、押すと取り消せる。
  function buildEnchantTransferControl(cardId) {
    const wrap = document.createElement("div");
    wrap.className = "sim-enchant-transfer-control";
    const btn = document.createElement("button");
    btn.type = "button";

    const currentTarget = session.finalReview.enchantTransfers[cardId];
    const isActive = transferSourceCardId === cardId;

    if (isActive) {
      btn.className = "sim-transfer-btn active";
      btn.textContent = "キャンセル";
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        transferSourceCardId = null;
        renderFinalReviewScreen();
      });
    } else if (currentTarget) {
      const targetCard = cardById(currentTarget);
      btn.className = "sim-transfer-btn assigned";
      btn.textContent = "→ " + (targetCard ? CubeShared.displayName(targetCard) : currentTarget) + " ✕";
      btn.title = "クリックで移し替えを取り消す";
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        delete session.finalReview.enchantTransfers[cardId];
        saveSessionToStorage();
        renderFinalReviewScreen();
      });
    } else {
      btn.className = "sim-transfer-btn";
      btn.textContent = "エンチャントを移し替える";
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        transferSourceCardId = cardId;
        renderFinalReviewScreen();
      });
    }

    wrap.appendChild(btn);
    return wrap;
  }

  function renderFinalReviewScreen() {
    const format = DRAFT_FORMATS[session.format];
    const cc = cutCount(format);
    $("#sim-final-count").textContent = session.finalReview.cutIds.length + "/" + cc + "枚を選択中";

    const eligibleForActiveTransfer = transferSourceCardId !== null ? eligibleTransferTargets(transferSourceCardId) : null;

    const grid = $("#sim-final-grid");
    grid.innerHTML = "";
    session.finalReview.deckCardIds.forEach((cardId) => {
      const card = cardById(cardId);
      const isCut = session.finalReview.cutIds.includes(cardId);
      const tile = buildSimCardTile(card, cardId, {
        pendingBadge: isCut ? "×" : null,
        stateClass: isCut ? "sim-cut-selected" : null,
        onClick: () => onFinalTileClick(cardId),
      });

      if (transferSourceCardId !== null) {
        if (cardId === transferSourceCardId) {
          tile.classList.add("sim-transfer-source");
        } else if (eligibleForActiveTransfer.includes(cardId)) {
          tile.classList.add("sim-transfer-eligible");
        } else {
          tile.classList.add("sim-transfer-ineligible");
        }
      }

      if (isCut && card.enchantId) {
        tile.appendChild(buildEnchantTransferControl(cardId));
      }

      grid.appendChild(tile);
    });

    const ready = session.finalReview.cutIds.length === cc;
    $("#sim-final-confirm-top-btn").disabled = !ready;
    $("#sim-final-confirm-bottom-btn").disabled = !ready;

    showSimScreen("finalReview");
  }

  function onFinalConfirmClick() { $("#sim-final-confirm-modal").classList.add("open"); }

  function resolveEnchantSnapshotById(enchantId) {
    const info = resolveEnchantById(enchantId);
    if (!info) return null;
    return {
      name: info.enchant.name,
      abilityText: info.enchant.abilityText || "",
      overlayImage: info.enchant.overlayImage || null,
      imageSource: info.enchant.overlayImage ? (info.fromTrash ? "trash_enchant" : "enchant") : null,
    };
  }

  function effectiveEnchantSnapshot(keptCardId) {
    const card = cardById(keptCardId);
    if (card.enchantId) return resolveEnchantSnapshotById(card.enchantId);
    const transfers = session.finalReview.enchantTransfers;
    let sourceCutId = null;
    Object.keys(transfers).forEach((cutId) => {
      if (transfers[cutId] === keptCardId) sourceCutId = cutId;
    });
    if (!sourceCutId) return null;
    const sourceCard = cardById(sourceCutId);
    return resolveEnchantSnapshotById(sourceCard.enchantId);
  }

  function onFinalConfirmOk() {
    $("#sim-final-confirm-modal").classList.remove("open");
    const entries = keptCardIds().map((id) => {
      const card = cardById(id);
      const entry = CubeShared.deckCardEntryFromCard(card, isTrashCard(id));
      entry.enchant = effectiveEnchantSnapshot(id);
      return entry;
    });
    session.mode = "finished";
    session.finishedDeck = { name: "", savedDeckId: null, entries };
    saveSessionToStorage();
    renderFinishedScreen();
  }

  // --- 完成デッキ画面 ---
  function renderFinishedScreen() {
    $("#sim-finished-name").value = session.finishedDeck.name || "";
    $("#sim-finished-error").textContent = "";
    const recordBtn = $("#sim-finished-record-btn");
    recordBtn.disabled = Boolean(session.finishedDeck.savedDeckId);
    recordBtn.textContent = session.finishedDeck.savedDeckId ? "記録済み" : "デッキを記録する";

    const grid = $("#sim-finished-grid");
    grid.innerHTML = "";
    session.finishedDeck.entries.forEach((entry) => {
      grid.appendChild(CubeShared.renderDeckCardTile(entry, -1, false));
    });

    showSimScreen("finished");
  }

  async function exportSimDeckImage() {
    const btn = $("#sim-finished-image-btn");
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "生成中…";
    try {
      const name = $("#sim-finished-name").value.trim() || new Date().toISOString();
      await CubeShared.renderDeckToPngAndDownload(name, "シミュレータ", new Date().toISOString(), session.finishedDeck.entries);
    } catch (err) {
      alert("デッキ画像の生成に失敗しました: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  function openRecordModal() {
    $("#sim-record-password").value = "";
    $("#sim-record-error").textContent = "";
    $("#sim-record-modal").classList.add("open");
  }

  async function confirmRecordDeck() {
    const errorEl = $("#sim-record-error");
    errorEl.textContent = "";
    const format = DRAFT_FORMATS[session.format];
    const payload = {
      name: $("#sim-finished-name").value.trim(),
      note: format.label,
      cards: session.finishedDeck.entries,
      password: $("#sim-record-password").value,
      source: "simulator",
    };
    try {
      const res = await fetch(CubeShared.DECK_API_BASE + "/api/cube/" + encodeURIComponent(CubeShared.cubeId) + "/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || ("HTTP " + res.status));

      session.finishedDeck.savedDeckId = body.id;
      CubeShared.state.decksData.decks = CubeShared.state.decksData.decks || [];
      CubeShared.state.decksData.decks.push(body);
      CubeShared.renderDeckList();
      saveSessionToStorage();
      $("#sim-record-modal").classList.remove("open");
      renderFinishedScreen();
    } catch (err) {
      errorEl.textContent = "記録に失敗しました: " + err.message;
    }
  }

  function restartDraft() {
    clearSessionStorage(CubeShared.cubeId);
    session = null;
    transferSourceCardId = null;
    renderSetupScreen();
    showSimScreen("setup");
  }

  // --- 初期化 ---
  function wireStaticHandlers() {
    $("#sim-format-glimpse").addEventListener("change", updateStartButtonState);
    $("#sim-format-normal").addEventListener("change", updateStartButtonState);
    $("#sim-start-btn").addEventListener("click", startDraft);

    $("#sim-pack-card-modal-close").addEventListener("click", closeSimPackCardModal);
    $("#sim-pack-card-modal").addEventListener("click", (ev) => {
      if (ev.target.id === "sim-pack-card-modal") closeSimPackCardModal();
    });

    $("#sim-final-confirm-top-btn").addEventListener("click", onFinalConfirmClick);
    $("#sim-final-confirm-bottom-btn").addEventListener("click", onFinalConfirmClick);
    $("#sim-final-confirm-modal-close").addEventListener("click", () => $("#sim-final-confirm-modal").classList.remove("open"));
    $("#sim-final-confirm-modal").addEventListener("click", (ev) => {
      if (ev.target.id === "sim-final-confirm-modal") $("#sim-final-confirm-modal").classList.remove("open");
    });
    $("#sim-final-confirm-ok-btn").addEventListener("click", onFinalConfirmOk);

    $("#sim-finished-name").addEventListener("input", (e) => {
      session.finishedDeck.name = e.target.value;
      saveSessionToStorage();
    });
    $("#sim-finished-image-btn").addEventListener("click", exportSimDeckImage);
    $("#sim-finished-record-btn").addEventListener("click", openRecordModal);
    $("#sim-restart-btn").addEventListener("click", restartDraft);

    $("#sim-record-modal-close").addEventListener("click", () => $("#sim-record-modal").classList.remove("open"));
    $("#sim-record-modal").addEventListener("click", (ev) => {
      if (ev.target.id === "sim-record-modal") $("#sim-record-modal").classList.remove("open");
    });
    $("#sim-record-confirm-btn").addEventListener("click", confirmRecordDeck);

    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      $("#sim-pack-card-modal").classList.remove("open");
      $("#sim-final-confirm-modal").classList.remove("open");
      $("#sim-record-modal").classList.remove("open");
    });
  }

  function initSimulatorTab() {
    wireStaticHandlers();

    const restored = loadSessionFromStorage(CubeShared.cubeId);
    if (restored) {
      session = restored;
      deckNameIndexCache = buildDeckNameIndex(CubeShared.state.decksData.decks || []);
      if (session.mode === "finalReview") {
        renderFinalReviewScreen();
      } else if (session.mode === "finished") {
        renderFinishedScreen();
      } else {
        renderPickScreen();
      }
    } else {
      renderSetupScreen();
      showSimScreen("setup");
    }
  }

  (async () => {
    await CubeShared.dataReady;
    initSimulatorTab();
  })();
})();
