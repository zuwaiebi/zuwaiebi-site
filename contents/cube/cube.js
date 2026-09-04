(() => {
  "use strict";

  // 複数キューブに対応する際は ?cube=<cubeId> で指定できる（cube_spec.md 2.1節）。
  // 省略時はこの既定キューブを表示する。新しいキューブを追加してそれを既定にする場合はここを変更する。
  const DEFAULT_CUBE_ID = "20260904";

  const CIV_ORDER = ["光", "水", "闇", "火", "自然", "ゼロ"];
  const CARD_TYPE_ORDER = ["クリーチャー", "呪文", "その他"];

  const cubeId = new URLSearchParams(location.search).get("cube") || DEFAULT_CUBE_ID;

  const state = {
    cubeData: { cards: [], enchants: [] },
    history: { entries: [] },
    filters: {
      civSingle: true,            // 単色ボタン
      civMulti: true,             // 多色ボタン(どちらか最低1つは常にtrue)
      civRequired: new Set(),     // 文明指定(光/水/闇/火/自然/ゼロ)ボタンで選択中のもの
      civRequireMode: "all",      // civRequiredが2個以上の時のみ有効: "any" | "all"
      civExcluded: new Set(),     // 「多色カードに含めない文明」(光/水/闇/火/自然)ボタンで選択中のもの
      cardTypes: new Set(),       // クリーチャー/呪文/その他
      costMin: null,
      costMax: null,
      powerMin: null,
      powerMax: null,
      name: "",
      abilityText: "",
      enchantOnly: false,
      includeTwinpact: true,
      civConsiderOtherFace: false, // カードタイプ絞り込み中のみ有効: もう一方の面の文明も加味して多色判定するか
    },
    sort: "default",
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function enchantById(id) {
    return state.cubeData.enchants.find((e) => e.id === id) || null;
  }

  // --- ツインパクト（上面/下面）・両面カード（表面/裏面）ヘルパー ---
  // カードのトップレベルのフィールド(name/civilizations/cost/power/race/cardTypes/abilityText)は
  // 常に「上面」（ツインパクトでないカードは唯一の面）を表す。下面は isTwinpact な場合のみ
  // card.bottomFace に {name, civilizations, cost, power, race, cardType, abilityText} として持つ。
  //
  // card.backFace は、ツインパクトではないが物理的に表裏2面を持つカード（例:
  // 「禁断」カードの封印状態/解放後クリーチャー）の裏面データ。形はbottomFaceと同じ+baseImage(裏面専用の画像、
  // 任意)を持てる。絞り込み・並べ替え・文明比率(cardFaces)には一切影響させない
  // （isTwinpact=falseのまま = 通常の1枚のカードとして扱う）。詳細モーダルの表示にのみ使う。
  function faceOf(card, i) {
    if (i === 0) {
      return {
        name: card.name,
        civilizations: card.civilizations || [],
        cost: card.cost,
        power: card.power,
        race: card.race,
        cardType: (card.cardTypes || [])[0],
        abilityText: card.abilityText,
      };
    }
    const b = card.bottomFace || card.backFace;
    if (!b) return null;
    return {
      name: b.name,
      civilizations: b.civilizations || [],
      cost: b.cost,
      power: b.power,
      race: b.race,
      cardType: b.cardType,
      abilityText: b.abilityText,
      baseImage: b.baseImage || null,
    };
  }

  function cardFaces(card) {
    const top = faceOf(card, 0);
    if (!card.isTwinpact || !card.bottomFace) return [top];
    const bottom = faceOf(card, 1);
    return bottom ? [top, bottom] : [top];
  }

  // グリッド一覧・更新履歴・カード名検索など、詳細モーダル以外での表示名は
  // ツインパクト・両面カードいずれも従来通り「1面目の名前/2面目の名前」の結合表示のまま維持する。
  function displayName(card) {
    const second = card.bottomFace || card.backFace;
    if (second) return `${card.name}/${second.name}`;
    return card.name;
  }

  function isMulticolorFace(face) {
    return (face.civilizations || []).length >= 2;
  }

  // --- データ読み込み ---
  async function loadData() {
    const dataUrl = `data/${encodeURIComponent(cubeId)}/cube_data.json`;
    const historyUrl = `data/${encodeURIComponent(cubeId)}/cube_history.json`;
    const [cubeRes, historyRes] = await Promise.all([fetch(dataUrl), fetch(historyUrl)]);
    if (!cubeRes.ok) throw new Error(`キューブデータの読み込みに失敗しました (${cubeRes.status})`);
    state.cubeData = await cubeRes.json();
    state.history = historyRes.ok ? await historyRes.json() : { entries: [] };

    document.title = state.cubeData.displayName || "キューブ";
    $("#cube-title").textContent = state.cubeData.displayName || "キューブ";
  }

  // --- 比率バー(共通描画。文明比率・単色/多色比率で使う) ---
  // segments: [{label, count, color}, ...]
  function renderRatioBar(containerId, segments) {
    const total = segments.reduce((sum, s) => sum + s.count, 0);

    const bar = document.createElement("div");
    bar.className = "civ-ratio-bar";
    const legend = document.createElement("div");
    legend.className = "civ-ratio-legend";

    segments.forEach(({ label, count, color }) => {
      const pct = total ? (count / total) * 100 : 0;
      if (pct > 0) {
        const seg = document.createElement("div");
        seg.className = "civ-ratio-segment";
        seg.style.width = pct + "%";
        seg.style.background = color;
        seg.title = `${label}: ${count}枚 (${pct.toFixed(1)}%)`;
        bar.appendChild(seg);
      }
      const item = document.createElement("span");
      item.innerHTML = `<span class="swatch" style="background:${color}"></span>${label} ${count}枚 (${pct.toFixed(1)}%)`;
      legend.appendChild(item);
    });

    const wrap = $(containerId);
    wrap.innerHTML = "";
    wrap.appendChild(bar);
    wrap.appendChild(legend);
  }

  // --- 文明比率バー ---
  function renderCivRatio() {
    const counts = Object.fromEntries(CIV_ORDER.map((c) => [c, 0]));
    state.cubeData.cards.forEach((card) => {
      // ツインパクトは上面・下面の文明の和集合で1回ずつ数える(両面が同じ文明でも1枚として扱う)
      const civSet = new Set();
      cardFaces(card).forEach((face) => (face.civilizations || []).forEach((civ) => civSet.add(civ)));
      civSet.forEach((civ) => { if (civ in counts) counts[civ] += 1; });
    });
    renderRatioBar("#civ-ratio", CIV_ORDER.map((civ) => ({ label: civ, count: counts[civ], color: `var(--civ-${civ})` })));
  }

  // カード全体が多色かどうか(絞り込みをしていない全体表示用)。ツインパクトで上面・下面の
  // 文明が異なる場合(和集合が2色以上になる場合)も多色として扱う。絞り込みボタンの
  // 単色/多色判定(面ごとのisMulticolorFace)とは別の、カード単位の判定であることに注意。
  function isCardMulticolor(card) {
    const civSet = new Set();
    cardFaces(card).forEach((face) => (face.civilizations || []).forEach((civ) => civSet.add(civ)));
    return civSet.size >= 2;
  }

  // --- 単色/多色比率バー ---
  function renderColorRatio() {
    let single = 0;
    let multi = 0;
    state.cubeData.cards.forEach((card) => {
      if (isCardMulticolor(card)) multi += 1; else single += 1;
    });
    renderRatioBar("#color-ratio", [
      { label: "単色", count: single, color: "var(--color-mono)" },
      { label: "多色", count: multi, color: "var(--color-multi)" },
    ]);
  }

  // --- 文明フィルターUI(公式カード検索方式) ---
  function setCivToggleActive(btn, civ, active) {
    btn.classList.toggle("active", active);
    btn.style.background = active ? `var(--civ-${civ})` : "transparent";
    btn.style.color = active ? "#08121a" : "var(--muted)";
  }

  function buildCivModeRow() {
    const row = $("#civ-mode-row");
    [["single", "単色"], ["multi", "多色"]].forEach(([key, label]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "civ-mode-toggle active";
      btn.textContent = label;
      btn.dataset.civMode = key;
      btn.addEventListener("click", () => {
        const stateKey = key === "single" ? "civSingle" : "civMulti";
        const otherKey = key === "single" ? "civMulti" : "civSingle";
        if (state.filters[stateKey] && !state.filters[otherKey]) return; // 最後の1つは解除させない
        state.filters[stateKey] = !state.filters[stateKey];
        btn.classList.toggle("active", state.filters[stateKey]);
        updateCivConsiderRow();
        applyAndRender();
      });
      row.appendChild(btn);
    });
  }

  function buildCivRequiredRow() {
    const civRow = $("#civ-filter-row");
    CIV_ORDER.forEach((civ) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "civ-toggle";
      btn.textContent = civ;
      btn.dataset.civ = civ;
      btn.style.borderColor = `var(--civ-${civ})`;
      btn.addEventListener("click", () => {
        const active = !state.filters.civRequired.has(civ);
        if (active) {
          state.filters.civRequired.add(civ);
          state.filters.civExcluded.delete(civ); // 指定した文明は除外候補から自動的に外す
        } else {
          state.filters.civRequired.delete(civ);
        }
        setCivToggleActive(btn, civ, active);
        updateCivExcludeRow();
        updateCivModeToggleRow();
        applyAndRender();
      });
      civRow.appendChild(btn);
    });
  }

  // 文明指定が1個以上、かつ除外候補(5色-文明指定)が1色以上ある時だけ表示する
  function updateCivExcludeRow() {
    const required = state.filters.civRequired;
    const candidates = CIV_ORDER.filter((c) => c !== "ゼロ" && !required.has(c));
    const show = required.size > 0 && candidates.length > 0;
    $("#civ-exclude-row").style.display = show ? "" : "none";

    const wrap = $("#civ-exclude-buttons");
    wrap.innerHTML = "";
    if (!show) return;
    candidates.forEach((civ) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "civ-toggle";
      btn.textContent = civ;
      btn.style.borderColor = `var(--civ-${civ})`;
      const active = state.filters.civExcluded.has(civ);
      setCivToggleActive(btn, civ, active);
      btn.addEventListener("click", () => {
        if (state.filters.civExcluded.has(civ)) state.filters.civExcluded.delete(civ);
        else state.filters.civExcluded.add(civ);
        applyAndRender();
        updateCivExcludeRow();
      });
      wrap.appendChild(btn);
    });
  }

  // 文明指定が2個以上6個未満(6個=絞り込み無効化)の時だけAND/ORトグルを表示する
  function updateCivModeToggleRow() {
    const size = state.filters.civRequired.size;
    $("#civ-mode-toggle-row").style.display = (size >= 2 && size < CIV_ORDER.length) ? "" : "none";
  }

  // もう一方の面の文明も考慮するかのチェックボックスは、①カードタイプで絞り込んでいて、
  // ②ツインパクトを表示していて、③単色/多色の一方のみを選択している(両方選択時は無関係)、
  // の3条件をすべて満たす時だけ表示する
  function updateCivConsiderRow() {
    const f = state.filters;
    const show = f.cardTypes.size > 0 && f.includeTwinpact && !(f.civSingle && f.civMulti);
    $("#civ-consider-other-face-row").style.display = show ? "" : "none";
    if (!show && f.civConsiderOtherFace) {
      f.civConsiderOtherFace = false; // 非表示化する条件になった時は無効な状態を持ち越さずOFFに戻す
      $("#civ-consider-other-face").checked = false;
    }
  }

  // --- フィルターUI構築 ---
  function buildFilterToggles() {
    buildCivModeRow();
    buildCivRequiredRow();
    updateCivExcludeRow();
    updateCivConsiderRow();

    const typeRow = $("#type-filter-row");
    CARD_TYPE_ORDER.forEach((type) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "type-toggle";
      btn.textContent = type;
      btn.dataset.type = type;
      btn.addEventListener("click", () => {
        if (state.filters.cardTypes.has(type)) {
          state.filters.cardTypes.delete(type);
          btn.classList.remove("active");
        } else {
          state.filters.cardTypes.add(type);
          btn.classList.add("active");
        }
        updateCivConsiderRow();
        applyAndRender();
      });
      typeRow.appendChild(btn);
    });
  }

  function bindFilterInputs() {
    $$('input[name="civRequireMode"]').forEach((el) => {
      el.addEventListener("change", (e) => {
        state.filters.civRequireMode = e.target.value;
        applyAndRender();
      });
    });
    $("#cost-min").addEventListener("input", (e) => {
      state.filters.costMin = e.target.value === "" ? null : Number(e.target.value);
      applyAndRender();
    });
    $("#cost-max").addEventListener("input", (e) => {
      state.filters.costMax = e.target.value === "" ? null : Number(e.target.value);
      applyAndRender();
    });
    $("#power-min").addEventListener("input", (e) => {
      state.filters.powerMin = e.target.value === "" ? null : Number(e.target.value);
      applyAndRender();
    });
    $("#power-max").addEventListener("input", (e) => {
      state.filters.powerMax = e.target.value === "" ? null : Number(e.target.value);
      applyAndRender();
    });
    $("#name-filter").addEventListener("input", (e) => {
      state.filters.name = e.target.value.trim();
      applyAndRender();
    });
    $("#ability-text-filter").addEventListener("input", (e) => {
      state.filters.abilityText = e.target.value.trim();
      applyAndRender();
    });
    $("#enchant-only-filter").addEventListener("change", (e) => {
      state.filters.enchantOnly = e.target.checked;
      applyAndRender();
    });
    $("#twinpact-toggle").addEventListener("change", (e) => {
      state.filters.includeTwinpact = e.target.checked;
      updateCivConsiderRow();
      applyAndRender();
    });
    $("#civ-consider-other-face").addEventListener("change", (e) => {
      state.filters.civConsiderOtherFace = e.target.checked;
      applyAndRender();
    });
    $("#sort-select").addEventListener("change", (e) => {
      state.sort = e.target.value;
      applyAndRender();
    });
    $("#clear-filters").addEventListener("click", () => resetFilters());
  }

  function resetFilters() {
    state.filters.civSingle = true;
    state.filters.civMulti = true;
    state.filters.civRequired.clear();
    state.filters.civExcluded.clear();
    state.filters.civRequireMode = "all";
    state.filters.cardTypes.clear();
    state.filters.costMin = null;
    state.filters.costMax = null;
    state.filters.powerMin = null;
    state.filters.powerMax = null;
    state.filters.name = "";
    state.filters.abilityText = "";
    state.filters.enchantOnly = false;
    state.filters.includeTwinpact = true;
    state.filters.civConsiderOtherFace = false;
    state.sort = "default";

    $$(".civ-mode-toggle").forEach((btn) => btn.classList.add("active"));
    $$("#civ-filter-row .civ-toggle").forEach((btn) => { btn.classList.remove("active"); btn.style.background = "transparent"; btn.style.color = "var(--muted)"; });
    updateCivExcludeRow();
    updateCivModeToggleRow();
    $("#civ-mode-all").checked = true;
    $$(".type-toggle").forEach((btn) => btn.classList.remove("active"));
    updateCivConsiderRow();
    $("#civ-consider-other-face").checked = false;
    $("#cost-min").value = "";
    $("#cost-max").value = "";
    $("#power-min").value = "";
    $("#power-max").value = "";
    $("#name-filter").value = "";
    $("#ability-text-filter").value = "";
    $("#enchant-only-filter").checked = false;
    $("#twinpact-toggle").checked = true;
    $("#sort-select").value = "default";

    applyAndRender();
  }

  // --- 絞り込み・並べ替え ---
  // 文明・カードタイプ・コスト・カード名は「面単位」のフィルター: ツインパクトは
  // 上面・下面のどちらかがこれらすべてを満たせばヒットする(OR条件)。
  // エンチャント有無・ツインパクト表示トグルはカード全体(面に依らない)レベルの判定。
  // カードタイプで絞り込んでいない時は、ツインパクトの上面・下面で異なる文明を持つ場合
  // (各面はそれぞれ単色でも)、カード全体としては多色として扱う。カードタイプで絞り込んで
  // いる時は特定の面(タイプ)に着目していることになるため、その面自身の文明数で判定するが、
  // 「もう一方の側に異なる文明が含まれる場合に考慮する」チェックがオンの時は絞り込んでいない
  // 場合と同様にカード全体の文明で判定する。
  function isMulticolorForFace(card, face, f) {
    const considerBothFaces = f.cardTypes.size === 0 || f.civConsiderOtherFace;
    if (considerBothFaces && card.isTwinpact && card.bottomFace) {
      const civSet = new Set();
      cardFaces(card).forEach((fc) => (fc.civilizations || []).forEach((c) => civSet.add(c)));
      return civSet.size >= 2;
    }
    return isMulticolorFace(face);
  }

  // 文明の判定(公式カード検索方式): ①単色/多色 →②文明指定(0個/6個なら無条件通過、
  // それ以外はcivRequireModeに従い含有判定) →③多色カードに含めない文明のいずれも持たないこと
  function faceCivMatches(face, f, card) {
    const civs = face.civilizations || [];
    const isMulti = isMulticolorForFace(card, face, f);
    if (!((f.civSingle && !isMulti) || (f.civMulti && isMulti))) return false;

    const required = f.civRequired;
    if (required.size > 0 && required.size < CIV_ORDER.length) {
      const matchCount = CIV_ORDER.reduce((n, c) => n + (required.has(c) && civs.includes(c) ? 1 : 0), 0);
      if (f.civRequireMode === "all") {
        if (matchCount < required.size) return false;
      } else if (matchCount === 0) {
        return false;
      }
      if ([...f.civExcluded].some((c) => civs.includes(c))) return false;
    }
    return true;
  }

  function faceMatchesFilters(face, f, card) {
    if (!faceCivMatches(face, f, card)) return false;

    if (f.cardTypes.size > 0 && !f.cardTypes.has(face.cardType)) return false;

    if (f.costMin !== null && (face.cost === null || face.cost === undefined || face.cost < f.costMin)) return false;
    if (f.costMax !== null && (face.cost === null || face.cost === undefined || face.cost > f.costMax)) return false;

    if (f.powerMin !== null && (face.power === null || face.power === undefined || face.power < f.powerMin)) return false;
    if (f.powerMax !== null && (face.power === null || face.power === undefined || face.power > f.powerMax)) return false;

    if (f.name && !(face.name || "").includes(f.name)) return false;

    if (f.abilityText && !(face.abilityText || "").includes(f.abilityText)) return false;

    return true;
  }

  function matchesFilters(card) {
    const f = state.filters;

    if (!f.includeTwinpact && card.isTwinpact) return false;
    if (f.enchantOnly && !card.enchantId) return false;

    return cardFaces(card).some((face) => faceMatchesFilters(face, f, card));
  }

  // 並べ替えの基準面: 基本は上面。現在の絞り込み条件に上面が一致せず下面のみが
  // 一致している場合に限り、その下面を基準にする(絞り込み条件が無ければ常に上面)。
  function effectiveFace(card) {
    const faces = cardFaces(card);
    if (faces.length === 1) return faces[0];
    return faceMatchesFilters(faces[0], state.filters, card) ? faces[0] : faces[1];
  }

  function civRank(face, card, f) {
    if (isMulticolorForFace(card, face, f)) return CIV_ORDER.length; // 多色は最後
    const civ = (face.civilizations || [])[0];
    const idx = CIV_ORDER.indexOf(civ);
    return idx === -1 ? CIV_ORDER.length + 1 : idx;
  }

  function typeRank(face) {
    const idx = CARD_TYPE_ORDER.indexOf(face.cardType);
    return idx === -1 ? CARD_TYPE_ORDER.length : idx;
  }

  function sortCards(cards) {
    const withFace = cards.map((card) => ({ card, face: effectiveFace(card) }));
    switch (state.sort) {
      case "cost-asc":
        withFace.sort((a, b) => (a.face.cost ?? Infinity) - (b.face.cost ?? Infinity));
        break;
      case "cost-desc":
        withFace.sort((a, b) => (b.face.cost ?? -Infinity) - (a.face.cost ?? -Infinity));
        break;
      case "power-asc":
        withFace.sort((a, b) => (a.face.power ?? Infinity) - (b.face.power ?? Infinity));
        break;
      case "power-desc":
        withFace.sort((a, b) => (b.face.power ?? -Infinity) - (a.face.power ?? -Infinity));
        break;
      case "civilization":
        withFace.sort((a, b) => civRank(a.face, a.card, state.filters) - civRank(b.face, b.card, state.filters));
        break;
      case "cardType":
        withFace.sort((a, b) => typeRank(a.face) - typeRank(b.face));
        break;
      default:
        // カードは管理画面で追加された順に配列末尾へ追加されるため、逆順にして
        // 新しく追加されたカードほど先頭(左上)に来るようにする
        withFace.reverse();
        break;
    }
    return withFace.map((x) => x.card);
  }

  // --- カードグリッド描画 ---
  function cardImagePath(kind, filename) {
    const dir = kind === "base" ? "base" : "enchant";
    return `data/${encodeURIComponent(cubeId)}/images/${dir}/${encodeURIComponent(filename)}`;
  }

  function renderCardTile(card) {
    const tile = document.createElement("div");
    tile.className = "card-tile";
    tile.tabIndex = 0;
    tile.setAttribute("role", "button");
    const nameStr = displayName(card);
    tile.setAttribute("aria-label", nameStr);

    const hasImage = Boolean(card.baseImage);
    if (hasImage) {
      const img = document.createElement("img");
      img.className = "base-image";
      img.loading = "lazy";
      img.src = cardImagePath("base", card.baseImage);
      img.alt = nameStr;
      tile.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "placeholder";
      ph.textContent = nameStr;
      tile.appendChild(ph);
    }

    const enchant = card.enchantId ? enchantById(card.enchantId) : null;
    if (enchant && enchant.overlayImage) {
      const overlay = document.createElement("img");
      overlay.className = "overlay-image";
      overlay.loading = "lazy";
      overlay.src = cardImagePath("enchant", enchant.overlayImage);
      overlay.alt = `エンチャント: ${enchant.name}`;
      tile.appendChild(overlay);
    }

    // プレースホルダー表示時はカード名がその中に既に表示されているため、下部キャプションは画像がある時だけ付ける
    if (hasImage) {
      const caption = document.createElement("div");
      caption.className = "card-name-caption";
      caption.textContent = nameStr;
      tile.appendChild(caption);
    }

    tile.addEventListener("click", () => openCardModal(card));
    tile.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openCardModal(card); }
    });

    return tile;
  }

  function applyAndRender() {
    const filtered = state.cubeData.cards.filter(matchesFilters);
    const sorted = sortCards(filtered);

    const grid = $("#card-grid");
    grid.innerHTML = "";
    sorted.forEach((card) => grid.appendChild(renderCardTile(card)));

    $("#result-count").textContent = `${sorted.length} / ${state.cubeData.cards.length} 枚`;
    $("#empty-message").style.display = sorted.length ? "none" : "block";
  }

  // --- カード詳細モーダル ---
  function openCardModal(card) {
    const modal = $("#card-modal");
    const imageWrap = $("#card-modal-image");
    imageWrap.innerHTML = "";
    const nameStr = displayName(card);

    const mainImageSlot = document.createElement("div");
    mainImageSlot.className = "card-modal-main-image";
    if (card.baseImage) {
      const img = document.createElement("img");
      img.className = "base-image";
      img.src = cardImagePath("base", card.baseImage);
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

    const enchant = card.enchantId ? enchantById(card.enchantId) : null;
    if (enchant && enchant.overlayImage) {
      const overlay = document.createElement("img");
      overlay.className = "overlay-image";
      overlay.src = cardImagePath("enchant", enchant.overlayImage);
      overlay.alt = `エンチャント: ${enchant.name}`;
      mainImageSlot.appendChild(overlay);
    }
    imageWrap.appendChild(mainImageSlot);

    // 2面目専用の画像(例:「禁断」カードの裏面イラスト)があれば、1面目の画像と縦に揃うよう
    // 同じ列の下に並べて表示する(面のデータブロックの中には入れない)
    const secondFace = card.bottomFace || card.backFace;
    if (secondFace && secondFace.baseImage) {
      const img2 = document.createElement("img");
      img2.className = "second-face-image";
      img2.src = cardImagePath("base", secondFace.baseImage);
      img2.alt = secondFace.name || "";
      imageWrap.appendChild(img2);
    }

    const nameEl = $("#card-modal-name");
    const abilitySection = $("#card-modal-ability-section");
    const facesEl = $("#card-modal-twinpact-faces");

    if (card.bottomFace || card.backFace) {
      // ツインパクト・両面カード共通: 1面目・2面目それぞれを通常カードと同じ構成
      // (大きめのカード名見出し→基本情報→能力テキスト)で上から順に並べる。ラベルは付けない。
      // 面専用の画像があれば上のモーダル左側の画像列にまとめて表示するため、ここではテキストのみ。
      nameEl.style.display = "none";
      nameEl.textContent = "";
      $("#card-modal-basics").style.display = "none";
      $("#card-modal-basics").innerHTML = "";
      abilitySection.style.display = "none";
      facesEl.style.display = "";

      const renderFace = (face) => {
        const basics = [
          ["文明", (face.civilizations || []).join("/") || "―"],
          ["コスト", face.cost ?? "―"],
          ["パワー", face.power ?? "―"],
          ["種族", face.race || "―"],
          ["カードタイプ", face.cardType || "―"],
        ];
        const basicsHtml = basics
          .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`)
          .join("");
        return `
          <div class="face-block">
            <h2>${escapeHtml(face.name || "―")}</h2>
            <dl class="card-modal-basics">${basicsHtml}</dl>
            <div class="card-modal-section">
              <h3>テキスト</h3>
              <p>${escapeHtml(face.abilityText || "（記載なし）")}</p>
            </div>
          </div>
        `;
      };
      facesEl.innerHTML = renderFace(faceOf(card, 0)) + renderFace(faceOf(card, 1));
    } else {
      facesEl.style.display = "none";
      facesEl.innerHTML = "";
      nameEl.style.display = "";
      nameEl.textContent = nameStr;
      $("#card-modal-basics").style.display = "";
      abilitySection.style.display = "";

      const typeLabel = (card.cardTypes || []).join("/");
      const basics = [
        ["文明", (card.civilizations || []).join("/") || "―"],
        ["コスト", card.cost ?? "―"],
        ["パワー", card.power ?? "―"],
        ["種族", card.race || "―"],
        ["カードタイプ", typeLabel || "―"],
      ];
      $("#card-modal-basics").innerHTML = basics
        .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`)
        .join("");

      $("#card-modal-ability").textContent = card.abilityText || "（記載なし）";
    }

    const enchantSection = $("#card-modal-enchant-section");
    if (enchant) {
      enchantSection.style.display = "";
      $("#card-modal-enchant-text").textContent = `【${enchant.name}】${enchant.abilityText || ""}`;
    } else {
      enchantSection.style.display = "none";
    }

    modal.classList.add("open");
  }

  $("#card-modal-close").addEventListener("click", () => $("#card-modal").classList.remove("open"));
  $("#card-modal").addEventListener("click", (ev) => {
    if (ev.target.id === "card-modal") $("#card-modal").classList.remove("open");
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") $("#card-modal").classList.remove("open");
  });

  // --- 更新履歴タブ ---
  function renderHistory() {
    const entries = (state.history.entries || []).slice()
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    const body = $("#history-body");
    body.innerHTML = entries
      .map((e) => {
        const actionClass = e.action === "追加" ? "history-action-add" : e.action === "削除" ? "history-action-remove" : "";
        return `<tr><td>${escapeHtml(e.timestamp)}</td><td class="${actionClass}">${escapeHtml(e.action)}</td><td>${escapeHtml(e.cardName)}</td></tr>`;
      })
      .join("");
    $("#history-empty").style.display = entries.length ? "none" : "block";
  }

  // --- タブ切替 ---
  function initTabs() {
    $$(".cube-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".cube-tab").forEach((b) => b.classList.remove("active"));
        $$(".cube-tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        $("#tab-" + btn.dataset.tab).classList.add("active");
      });
    });
  }

  // --- 初期化 ---
  async function init() {
    initTabs();
    buildFilterToggles();
    bindFilterInputs();
    try {
      await loadData();
    } catch (err) {
      $("#card-grid").innerHTML = "";
      $("#empty-message").textContent = err.message;
      $("#empty-message").style.display = "block";
      console.error(err);
      return;
    }
    renderCivRatio();
    renderColorRatio();
    applyAndRender();
    renderHistory();
  }

  init();
})();
