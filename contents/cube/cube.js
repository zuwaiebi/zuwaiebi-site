(() => {
  "use strict";

  // 複数キューブに対応する際は ?cube=<cubeId> で指定できる（cube_spec.md 2.1節）。
  // 省略時はこの既定キューブを表示する。新しいキューブを追加してそれを既定にする場合はここを変更する。
  const DEFAULT_CUBE_ID = "20260904";

  const CIV_ORDER = ["光", "水", "闇", "火", "自然", "ゼロ"];
  const CARD_TYPE_ORDER = ["クリーチャー", "呪文", "その他"];

  const cubeId = new URLSearchParams(location.search).get("cube") || DEFAULT_CUBE_ID;

  // デッキ登録(認証なしの公開API)の書き込み先。cube_admin側のURLプレフィックスを直接指す
  // (website側は静的ファイルのみで完結しているためテンプレート変数の注入ができない。
  // cube_admin/README.mdのCUBE_ADMIN_URL_PREFIXを変更した場合はここも合わせて変更する)
  const DECK_API_BASE = "/cube-admin";
  const DECK_SUGGEST_LIMIT = 15;

  const state = {
    cubeData: { cards: [], enchants: [] },
    history: { entries: [] },
    trashData: { cards: [], enchants: [] },
    decksData: { decks: [] },
    deckBuilding: { cards: [] },
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
      abilityTextMode: "and",     // スペース区切りの複数単語を"and"(すべて含む)/"or"(いずれか含む)で判定
      race: "",
      raceMode: "and",
      enchantOnly: false,
      twinpactMode: "show",       // "show"(も表示する) | "hide"(表示しない) | "only"(のみ表示する)
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

  // --- テキスト検索(スペース区切りで複数単語のAND/OR検索) ---
  // \s は半角スペースだけでなく全角スペース(U+3000)にもマッチする(ECMAScript仕様)
  function splitSearchWords(text) {
    return (text || "").split(/\s+/).filter(Boolean);
  }

  function matchesSearchWords(text, words, mode) {
    if (!words.length) return true;
    const t = text || "";
    return mode === "or" ? words.some((w) => t.includes(w)) : words.every((w) => t.includes(w));
  }

  // --- データ読み込み ---
  async function loadData() {
    const dataUrl = `data/${encodeURIComponent(cubeId)}/cube_data.json`;
    const historyUrl = `data/${encodeURIComponent(cubeId)}/cube_history.json`;
    const trashUrl = `data/${encodeURIComponent(cubeId)}/trash.json`;
    const decksUrl = `data/${encodeURIComponent(cubeId)}/decks.json`;
    const [cubeRes, historyRes, trashRes, decksRes] = await Promise.all([
      fetch(dataUrl), fetch(historyUrl), fetch(trashUrl), fetch(decksUrl),
    ]);
    if (!cubeRes.ok) throw new Error(`キューブデータの読み込みに失敗しました (${cubeRes.status})`);
    state.cubeData = await cubeRes.json();
    state.history = historyRes.ok ? await historyRes.json() : { entries: [] };
    // ゴミ箱・デッキ記録はデッキ登録機能(cube_spec.md 9節)のサジェスト・一覧表示に使う。
    // まだ1件もゴミ箱行き/デッキ記録が無いキューブではファイル自体が存在しないため、404は空扱いにする
    state.trashData = trashRes.ok ? await trashRes.json() : { cards: [], enchants: [] };
    state.decksData = decksRes.ok ? await decksRes.json() : { decks: [] };

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
  // cards: 比率の集計対象(検索結果と連動させるため、現在の絞り込みを通過したカードのみを渡す)
  function renderCivRatio(cards) {
    const counts = Object.fromEntries(CIV_ORDER.map((c) => [c, 0]));
    cards.forEach((card) => {
      // ツインパクトは上面・下面の文明の和集合で1回ずつ数える(両面が同じ文明でも1枚として扱う)
      const civSet = new Set();
      cardFaces(card).forEach((face) => (face.civilizations || []).forEach((civ) => civSet.add(civ)));
      civSet.forEach((civ) => { if (civ in counts) counts[civ] += 1; });
    });
    renderRatioBar("#civ-ratio", CIV_ORDER.map((civ) => ({ label: civ, count: counts[civ], color: `var(--civ-${civ})` })));
  }

  // カード全体が多色かどうか(カードタイプによる絞り込みの有無に関わらず一定の基準で判定する、
  // 比率バー用の基準)。ツインパクトで上面・下面の文明が異なる場合(和集合が2色以上になる場合)も
  // 多色として扱う。絞り込みボタンの単色/多色判定(面ごとのisMulticolorFace)とは別の、
  // カード単位の判定であることに注意。
  function isCardMulticolor(card) {
    const civSet = new Set();
    cardFaces(card).forEach((face) => (face.civilizations || []).forEach((civ) => civSet.add(civ)));
    return civSet.size >= 2;
  }

  // --- 単色/多色比率バー ---
  // cards: 比率の集計対象(検索結果と連動させるため、現在の絞り込みを通過したカードのみを渡す)
  function renderColorRatio(cards) {
    let single = 0;
    let multi = 0;
    cards.forEach((card) => {
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
    const show = f.cardTypes.size > 0 && f.twinpactMode !== "hide" && !(f.civSingle && f.civMulti);
    $("#civ-consider-other-face-row").style.display = show ? "" : "none";
    if (!show && f.civConsiderOtherFace) {
      f.civConsiderOtherFace = false; // 非表示化する条件になった時は無効な状態を持ち越さずOFFに戻す
      $("#civ-consider-other-face").checked = false;
    }
  }

  // テキスト検索(種族・テキスト)のAND/OR切り替えボタンを構築する。1つのボタンをタップ/クリックする
  // たびにAND(赤)⇔OR(青)を切り替える。呼び直すとstate.filters[filterKey]の現在値に合わせて
  // 再描画されるため、resetFiltersでの表示リセットにも流用する
  function buildSearchModeToggle(containerSel, filterKey) {
    const container = $(containerSel);
    container.innerHTML = "";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "search-mode-toggle";
    const render = () => {
      const isOr = state.filters[filterKey] === "or";
      btn.textContent = isOr ? "OR" : "AND";
      btn.classList.toggle("mode-or", isOr);
      btn.classList.toggle("mode-and", !isOr);
    };
    btn.addEventListener("click", () => {
      state.filters[filterKey] = state.filters[filterKey] === "or" ? "and" : "or";
      render();
      applyAndRender();
    });
    render();
    container.appendChild(btn);
  }

  // --- フィルターUI構築 ---
  function buildFilterToggles() {
    buildCivModeRow();
    buildCivRequiredRow();
    updateCivExcludeRow();
    updateCivConsiderRow();
    buildSearchModeToggle("#race-mode-toggle", "raceMode");
    buildSearchModeToggle("#ability-text-mode-toggle", "abilityTextMode");

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
    $("#race-filter").addEventListener("input", (e) => {
      state.filters.race = e.target.value.trim();
      applyAndRender();
    });
    $("#enchant-only-filter").addEventListener("change", (e) => {
      state.filters.enchantOnly = e.target.checked;
      applyAndRender();
    });
    $("#twinpact-select").addEventListener("change", (e) => {
      state.filters.twinpactMode = e.target.value;
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
    state.filters.abilityTextMode = "and";
    state.filters.race = "";
    state.filters.raceMode = "and";
    state.filters.enchantOnly = false;
    state.filters.twinpactMode = "show";
    state.filters.civConsiderOtherFace = false;
    state.sort = "default";

    $$("#civ-mode-row .civ-mode-toggle").forEach((btn) => btn.classList.add("active"));
    buildSearchModeToggle("#race-mode-toggle", "raceMode");
    buildSearchModeToggle("#ability-text-mode-toggle", "abilityTextMode");
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
    $("#race-filter").value = "";
    $("#enchant-only-filter").checked = false;
    $("#twinpact-select").value = "show";
    $("#sort-select").value = "default";

    applyAndRender();
  }

  // --- 絞り込み・並べ替え ---
  // 文明・カードタイプ・コスト・パワー・カード名・テキスト・種族は「面単位」のフィルター:
  // ツインパクトは上面・下面のどちらかがこれらすべてを満たせばヒットする(OR条件)。
  // エンチャント有無・ツインパクト表示モードはカード全体(面に依らない)レベルの判定。
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

    if (!matchesSearchWords(face.abilityText, splitSearchWords(f.abilityText), f.abilityTextMode)) return false;

    if (!matchesSearchWords(face.race, splitSearchWords(f.race), f.raceMode)) return false;

    return true;
  }

  function matchesFilters(card) {
    const f = state.filters;

    if (f.twinpactMode === "hide" && card.isTwinpact) return false;
    if (f.twinpactMode === "only" && !card.isTwinpact) return false;
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
  // fromTrash: デッキ記録(cube_spec.md 9節)がゴミ箱行きだったカード/エンチャントの画像を
  // スナップショットしている場合にtrueを渡す(images/ではなくtrash_images/を参照する)
  function cardImagePath(kind, filename, fromTrash) {
    const dir = kind === "base" ? "base" : "enchant";
    const root = fromTrash ? "trash_images" : "images";
    return `data/${encodeURIComponent(cubeId)}/${root}/${dir}/${encodeURIComponent(filename)}`;
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

    // 文明比率・単色/多色比率バーは常に現在の絞り込み結果と連動させる
    renderCivRatio(filtered);
    renderColorRatio(filtered);
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
    if (ev.key !== "Escape") return;
    $("#card-modal").classList.remove("open");
    $("#deck-enchant-modal").classList.remove("open");
    $("#deck-save-modal").classList.remove("open");
    $("#deck-detail-modal").classList.remove("open");
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

  // --- デッキ記録(登録・一覧。cube_spec.md 9節) ---
  // カード/エンチャントはライブ参照せず、選択した時点の名前・画像ファイル名をそのまま
  // デッキのカードエントリにスナップショットする(trash.json/cube_history.jsonと同じ考え方)。
  const isTrashImageSource = (src) => src === "trash_base" || src === "trash_enchant";

  // 記録後にカードがゴミ箱へ移動したり画像が差し替えられたりすると、記録時点の
  // ファイル名・参照先(images/ vs trash_images/)のスナップショットのままでは画像が
  // 見つからなくなることがある。表示のたびに名前で現行キューブ+ゴミ箱と照合し、
  // 見つかればそちらの最新のbaseImage/所在を優先する(resolveDeckCardFaceと同じ考え方)。
  // 見つからなければ(名前が変わった等)記録時点のスナップショットのままフォールバックする。
  function deckCardImageSrc(entry) {
    if (entry.isDummy) return null;
    const found = allCardSuggestCandidates().find(({ card }) => displayName(card) === entry.name);
    const baseImage = found ? found.card.baseImage : entry.baseImage;
    if (!baseImage) return null;
    const fromTrash = found ? found.fromTrash : isTrashImageSource(entry.imageSource);
    return cardImagePath("base", baseImage, fromTrash);
  }

  function deckEnchantImageSrc(entry) {
    if (!entry.enchant) return null;
    const found = allEnchantCandidates().find(({ enchant }) => enchant.name === entry.enchant.name);
    const overlayImage = found ? found.enchant.overlayImage : entry.enchant.overlayImage;
    if (!overlayImage) return null;
    const fromTrash = found ? found.fromTrash : isTrashImageSource(entry.enchant.imageSource);
    return cardImagePath("enchant", overlayImage, fromTrash);
  }

  // サジェスト・エンチャント選択候補は、現行キューブに加えゴミ箱内のものも対象にする
  // (キューブは更新され続けるため、過去のデッキが既に削除されたカードを含むことがある)
  function allCardSuggestCandidates() {
    const live = state.cubeData.cards.map((card) => ({ card, fromTrash: false }));
    const trashed = (state.trashData.cards || []).map((card) => ({ card, fromTrash: true }));
    return live.concat(trashed);
  }

  function allEnchantCandidates() {
    const live = state.cubeData.enchants.map((enchant) => ({ enchant, fromTrash: false }));
    const trashed = (state.trashData.enchants || []).map((enchant) => ({ enchant, fromTrash: true }));
    return live.concat(trashed);
  }

  function deckCardEntryFromCard(card, fromTrash) {
    return {
      name: displayName(card),
      baseImage: card.baseImage || null,
      imageSource: card.baseImage ? (fromTrash ? "trash_base" : "base") : null,
      isDummy: false,
      enchant: null,
    };
  }

  function addDeckCard(entry) {
    state.deckBuilding.cards.push(entry);
    renderDeckBuildingGrid();
  }

  function removeDeckCard(index) {
    state.deckBuilding.cards.splice(index, 1);
    renderDeckBuildingGrid();
  }

  function clearDeckSuggest() {
    $("#deck-card-search").value = "";
    $("#deck-suggest-list").hidden = true;
    $("#deck-suggest-list").innerHTML = "";
  }

  function renderDeckSuggestions(query) {
    const list = $("#deck-suggest-list");
    list.innerHTML = "";
    const q = query.trim();
    if (!q) { list.hidden = true; return; }

    const matches = allCardSuggestCandidates()
      .filter(({ card }) => displayName(card).includes(q))
      .slice(0, DECK_SUGGEST_LIMIT);

    if (matches.length === 0) {
      const item = document.createElement("div");
      item.className = "deck-suggest-item deck-suggest-dummy";
      item.textContent = `《${q}》をダミーとして記録する`;
      item.addEventListener("click", () => {
        addDeckCard({ name: q, baseImage: null, imageSource: null, isDummy: true, enchant: null });
        clearDeckSuggest();
      });
      list.appendChild(item);
    } else {
      matches.forEach(({ card, fromTrash }) => {
        const item = document.createElement("div");
        item.className = "deck-suggest-item";
        item.textContent = displayName(card) + (fromTrash ? "（ゴミ箱）" : "");
        item.addEventListener("click", () => {
          addDeckCard(deckCardEntryFromCard(card, fromTrash));
          clearDeckSuggest();
        });
        list.appendChild(item);
      });
    }
    list.hidden = false;
  }

  // removable: true=登録中デッキ(削除ボタン・エンチャント設定クリックあり) / false=デッキ詳細表示(閲覧専用)
  function renderDeckCardTile(entry, index, removable) {
    const tile = document.createElement("div");
    tile.className = "card-tile" + (removable ? " card-tile-removable" : "");

    const imgSrc = deckCardImageSrc(entry);
    if (imgSrc) {
      const img = document.createElement("img");
      img.className = "base-image";
      img.loading = "lazy";
      img.src = imgSrc;
      img.alt = entry.name;
      tile.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "placeholder";
      ph.textContent = entry.name;
      tile.appendChild(ph);
    }

    const enchantImgSrc = deckEnchantImageSrc(entry);
    if (enchantImgSrc) {
      const overlay = document.createElement("img");
      overlay.className = "overlay-image";
      overlay.loading = "lazy";
      overlay.src = enchantImgSrc;
      overlay.alt = `エンチャント: ${entry.enchant.name}`;
      tile.appendChild(overlay);
    }

    if (imgSrc) {
      const caption = document.createElement("div");
      caption.className = "card-name-caption";
      caption.textContent = entry.name;
      tile.appendChild(caption);
    }

    if (removable) {
      tile.tabIndex = 0;
      tile.setAttribute("role", "button");
      tile.setAttribute("aria-label", `${entry.name}のエンチャントを設定`);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "card-tile-remove-btn";
      removeBtn.textContent = "×";
      removeBtn.setAttribute("aria-label", "このカードを登録から外す");
      removeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        removeDeckCard(index);
      });
      tile.appendChild(removeBtn);

      tile.addEventListener("click", () => openDeckEnchantModal(index));
      tile.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openDeckEnchantModal(index); }
      });
    }

    return tile;
  }

  function renderDeckBuildingGrid() {
    const grid = $("#deck-building-grid");
    grid.innerHTML = "";
    state.deckBuilding.cards.forEach((entry, index) => grid.appendChild(renderDeckCardTile(entry, index, true)));
    const count = state.deckBuilding.cards.length;
    $("#deck-building-count").textContent = `${count}枚`;
    $("#deck-building-empty").style.display = count ? "none" : "block";
  }

  function openDeckEnchantModal(index) {
    const current = state.deckBuilding.cards[index].enchant;
    const candidates = allEnchantCandidates();
    const select = $("#deck-enchant-select");
    select.innerHTML = "";

    const noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "なし";
    select.appendChild(noneOpt);

    candidates.forEach(({ enchant, fromTrash }, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = enchant.name + (fromTrash ? "（ゴミ箱）" : "");
      select.appendChild(opt);
    });

    const currentIndex = current
      ? candidates.findIndex(({ enchant }) => enchant.name === current.name && (enchant.overlayImage || null) === current.overlayImage)
      : -1;
    select.value = currentIndex >= 0 ? String(currentIndex) : "";

    select.onchange = () => {
      const val = select.value;
      if (val === "") {
        state.deckBuilding.cards[index].enchant = null;
      } else {
        const { enchant, fromTrash } = candidates[Number(val)];
        state.deckBuilding.cards[index].enchant = {
          name: enchant.name,
          abilityText: enchant.abilityText || "",
          overlayImage: enchant.overlayImage || null,
          imageSource: enchant.overlayImage ? (fromTrash ? "trash_enchant" : "enchant") : null,
        };
      }
      renderDeckBuildingGrid();
      $("#deck-enchant-modal").classList.remove("open");
    };

    $("#deck-enchant-modal").classList.add("open");
  }

  function openDeckSaveModal() {
    const count = state.deckBuilding.cards.length;
    if (count === 0) {
      alert("カードを1枚以上登録してください。");
      return;
    }
    if (count < 40 && !confirm(`${count}枚ですが保存しますか？`)) return;

    $("#deck-save-name").value = "";
    $("#deck-save-note").value = "";
    $("#deck-save-password").value = "";
    $("#deck-save-error").textContent = "";
    $("#deck-save-modal").classList.add("open");
  }

  async function submitDeckSave() {
    const errorEl = $("#deck-save-error");
    errorEl.textContent = "";
    try {
      const payload = {
        name: $("#deck-save-name").value.trim(),
        note: $("#deck-save-note").value,
        cards: state.deckBuilding.cards,
        password: $("#deck-save-password").value,
      };
      const res = await fetch(`${DECK_API_BASE}/api/cube/${encodeURIComponent(cubeId)}/decks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);

      state.deckBuilding.cards = [];
      renderDeckBuildingGrid();
      $("#deck-save-modal").classList.remove("open");
      state.decksData.decks = state.decksData.decks || [];
      state.decksData.decks.push(body);
      renderDeckList();
    } catch (err) {
      errorEl.textContent = "保存に失敗しました: " + err.message;
    }
  }

  function deckSourceLabel(source) {
    return source === "simulator" ? "シミュレータ" : "実戦";
  }

  // --- デッキ詳細の並べ替え ---
  // デッキのカードは名前・画像ファイル名のスナップショットのみを持ち、コスト・文明は
  // 保持していない(cube_spec.md 9.1節)。並べ替えのため、現行キューブ+ゴミ箱のカードを
  // 名前で照合して上面のコスト・文明を取得する。ダミーカードや、両方から消えたカードは
  // 情報が取れないため常に末尾に回す。
  function resolveDeckCardFace(entry) {
    if (entry.isDummy) return null;
    const found = allCardSuggestCandidates().find(({ card }) => displayName(card) === entry.name);
    return found ? faceOf(found.card, 0) : null;
  }

  function deckCivRank(face) {
    if (!face) return CIV_ORDER.length + 2;
    if ((face.civilizations || []).length >= 2) return CIV_ORDER.length;
    const idx = CIV_ORDER.indexOf((face.civilizations || [])[0]);
    return idx === -1 ? CIV_ORDER.length + 1 : idx;
  }

  function deckCostOf(face) {
    return face && face.cost != null ? face.cost : null;
  }

  function sortDeckEntries(cards, sortKey) {
    const withFace = cards.map((entry) => ({ entry, face: resolveDeckCardFace(entry) }));
    switch (sortKey) {
      case "cost-asc":
        withFace.sort((a, b) => (deckCostOf(a.face) ?? Infinity) - (deckCostOf(b.face) ?? Infinity));
        break;
      case "cost-desc":
        withFace.sort((a, b) => (deckCostOf(b.face) ?? -Infinity) - (deckCostOf(a.face) ?? -Infinity));
        break;
      case "civilization":
        withFace.sort((a, b) => deckCivRank(a.face) - deckCivRank(b.face));
        break;
      case "name":
        withFace.sort((a, b) => (a.entry.name < b.entry.name ? -1 : a.entry.name > b.entry.name ? 1 : 0));
        break;
      default:
        break; // 記録順のまま
    }
    return withFace.map((x) => x.entry);
  }

  function renderDeckList() {
    const entries = (state.decksData.decks || []).slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const body = $("#deck-list-body");
    body.innerHTML = entries.map((d) => {
      const sourceClass = d.source === "simulator" ? "deck-source-simulator" : "deck-source-manual";
      return `<tr data-deck-id="${escapeHtml(d.id)}">
        <td>${escapeHtml(d.name)}</td>
        <td><span class="deck-source-badge ${sourceClass}">${deckSourceLabel(d.source)}</span></td>
        <td>${escapeHtml(d.createdAt)}</td>
        <td>${d.cards.length}枚</td>
      </tr>`;
    }).join("");
    $$("#deck-list-body tr").forEach((tr) => {
      tr.addEventListener("click", () => openDeckDetailModal(tr.dataset.deckId));
    });
    $("#deck-list-empty").style.display = entries.length ? "none" : "block";
  }

  let deckDetailCurrentId = null;
  let deckDetailSort = "default";

  function currentDeckDetail() {
    return (state.decksData.decks || []).find((d) => d.id === deckDetailCurrentId) || null;
  }

  function renderDeckDetailGrid() {
    const deck = currentDeckDetail();
    if (!deck) return;
    const grid = $("#deck-detail-grid");
    grid.innerHTML = "";
    sortDeckEntries(deck.cards, deckDetailSort).forEach((entry) => grid.appendChild(renderDeckCardTile(entry, -1, false)));
  }

  function openDeckDetailModal(deckId) {
    const deck = (state.decksData.decks || []).find((d) => d.id === deckId);
    if (!deck) return;
    deckDetailCurrentId = deckId;
    deckDetailSort = "default";
    $("#deck-detail-sort-select").value = "default";

    $("#deck-detail-name").textContent = deck.name;
    $("#deck-detail-meta").textContent = `${deckSourceLabel(deck.source)} ／ ${deck.createdAt} ／ ${deck.cards.length}枚`;
    $("#deck-detail-note").textContent = deck.note || "";
    $("#deck-detail-note").style.display = deck.note ? "" : "none";
    $("#deck-detail-error").textContent = "";
    if (deckDetailZipController) deckDetailZipController.close();

    renderDeckDetailGrid();

    $("#deck-detail-modal").classList.add("open");
  }

  async function deleteCurrentDeck() {
    if (!deckDetailCurrentId) return;
    const password = prompt("削除するには編集用パスワードを入力してください");
    if (password === null || password === "") return;

    const errorEl = $("#deck-detail-error");
    errorEl.textContent = "";
    try {
      const res = await fetch(`${DECK_API_BASE}/api/cube/${encodeURIComponent(cubeId)}/decks/${encodeURIComponent(deckDetailCurrentId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);

      state.decksData.decks = (state.decksData.decks || []).filter((d) => d.id !== deckDetailCurrentId);
      $("#deck-detail-modal").classList.remove("open");
      renderDeckList();
    } catch (err) {
      errorEl.textContent = "削除に失敗しました: " + err.message;
    }
  }

  // --- デッキ画像の出力 ---
  // カード画像をグリッド状に並べた1枚のPNGを生成しダウンロードさせる。画像は同一オリジン
  // (data/<cubeId>/images/・trash_images/)から読み込むためcanvasは汚染されず、
  // 本番(nginx同一オリジン)・python -m http.serverでのローカル確認のいずれでも動作する。
  const DECK_IMAGE_COLS = 8;
  const DECK_IMAGE_CELL_W = 150;
  const DECK_IMAGE_CELL_H = 210;
  const DECK_IMAGE_GAP = 10;
  const DECK_IMAGE_PADDING = 20;
  const DECK_IMAGE_HEADER_H = 76;

  function loadImageForExport(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function roundedRectPath(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCoverImage(ctx, img, x, y, w, h) {
    const ir = img.width / img.height;
    const cr = w / h;
    let sx, sy, sw, sh;
    if (ir > cr) {
      sh = img.height;
      sw = sh * cr;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      sw = img.width;
      sh = sw / cr;
      sx = 0;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function drawContainImage(ctx, img, x, y, w, h) {
    const ir = img.width / img.height;
    const cr = w / h;
    let dw, dh;
    if (ir > cr) { dw = w; dh = w / ir; } else { dh = h; dw = h * ir; }
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function drawTruncatedText(ctx, text, x, y, maxWidth) {
    let s = text;
    if (ctx.measureText(s).width > maxWidth) {
      while (s.length > 1 && ctx.measureText(s + "…").width > maxWidth) s = s.slice(0, -1);
      s += "…";
    }
    ctx.fillText(s, x, y);
  }

  // entries・タイトル行の材料だけを受け取る汎用版。まだdecks.jsonに保存していない
  // (createdAtが無い)デッキ(シミュレーターの完成デッキ画面など)からも呼べるようにするため、
  // デッキ記録オブジェクトそのものではなく個々の値を引数に取る。
  async function renderDeckToPngAndDownload(name, sourceLabel, createdAt, entries) {
    const cols = Math.max(1, Math.min(DECK_IMAGE_COLS, entries.length));
    const rows = Math.max(1, Math.ceil(entries.length / cols));
    const width = DECK_IMAGE_PADDING * 2 + cols * DECK_IMAGE_CELL_W + (cols - 1) * DECK_IMAGE_GAP;
    const height = DECK_IMAGE_PADDING * 2 + DECK_IMAGE_HEADER_H + rows * DECK_IMAGE_CELL_H + (rows - 1) * DECK_IMAGE_GAP;

    const images = await Promise.all(entries.map(async (entry) => {
      const baseSrc = deckCardImageSrc(entry);
      const overlaySrc = deckEnchantImageSrc(entry);
      const [baseImg, overlayImg] = await Promise.all([
        baseSrc ? loadImageForExport(baseSrc) : Promise.resolve(null),
        overlaySrc ? loadImageForExport(overlaySrc) : Promise.resolve(null),
      ]);
      return { entry, baseImg, overlayImg };
    }));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#0e1116";
    ctx.fillRect(0, 0, width, height);

    ctx.textBaseline = "top";
    ctx.fillStyle = "#f6f6f6";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText(name, DECK_IMAGE_PADDING, DECK_IMAGE_PADDING);

    ctx.fillStyle = "#c8c8c8";
    ctx.font = "14px sans-serif";
    ctx.fillText(
      `${sourceLabel} ／ ${createdAt} ／ ${entries.length}枚`,
      DECK_IMAGE_PADDING, DECK_IMAGE_PADDING + 32
    );

    images.forEach(({ entry, baseImg, overlayImg }, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = DECK_IMAGE_PADDING + col * (DECK_IMAGE_CELL_W + DECK_IMAGE_GAP);
      const y = DECK_IMAGE_PADDING + DECK_IMAGE_HEADER_H + row * (DECK_IMAGE_CELL_H + DECK_IMAGE_GAP);

      ctx.save();
      ctx.beginPath();
      roundedRectPath(ctx, x, y, DECK_IMAGE_CELL_W, DECK_IMAGE_CELL_H, 8);
      ctx.clip();

      if (baseImg) {
        drawCoverImage(ctx, baseImg, x, y, DECK_IMAGE_CELL_W, DECK_IMAGE_CELL_H);
      } else {
        ctx.fillStyle = "#1b1f27";
        ctx.fillRect(x, y, DECK_IMAGE_CELL_W, DECK_IMAGE_CELL_H);
      }
      if (overlayImg) drawContainImage(ctx, overlayImg, x, y, DECK_IMAGE_CELL_W, DECK_IMAGE_CELL_H);

      const capH = 26;
      ctx.fillStyle = "rgba(0,0,0,0.72)";
      ctx.fillRect(x, y + DECK_IMAGE_CELL_H - capH, DECK_IMAGE_CELL_W, capH);
      ctx.fillStyle = "#fff";
      ctx.font = "11px sans-serif";
      ctx.textBaseline = "middle";
      drawTruncatedText(ctx, entry.name, x + 6, y + DECK_IMAGE_CELL_H - capH / 2, DECK_IMAGE_CELL_W - 12);
      ctx.textBaseline = "top";

      ctx.restore();

      ctx.beginPath();
      roundedRectPath(ctx, x + 0.5, y + 0.5, DECK_IMAGE_CELL_W - 1, DECK_IMAGE_CELL_H - 1, 8);
      ctx.strokeStyle = "#2a2f3a";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${(name || "deck").replace(/[\\/:*?"<>|]/g, "_")}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function exportDeckImage() {
    const deck = currentDeckDetail();
    if (!deck) return;
    const btn = $("#deck-detail-image-btn");
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "生成中…";
    try {
      const entries = sortDeckEntries(deck.cards, deckDetailSort);
      await renderDeckToPngAndDownload(deck.name, deckSourceLabel(deck.source), deck.createdAt, entries);
    } catch (err) {
      alert("デッキ画像の生成に失敗しました: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  // --- ユドナリウム用zip出力(cube_spec.md 9.5節) ---
  // ユドナリウム(https://github.com/TK11235/udonarium)のzip読み込み仕様に合わせる。
  // 画像はファイル内容のSHA-256十六進数値をファイル名(拡張子付き)・data.xml内の参照に使う
  // (ユドナリウム側もインポート時に内容から同じ方式でハッシュを計算し直すので、
  // ファイル名の拡張子さえ合っていれば実際のバイト列さえ一致すれば良い)。圧縮はせずSTORE方式で
  // 十分(カード画像は元々JPEG/PNG/WebPで、DEFLATEしてもほぼ縮まないため)。
  function crc32(bytes) {
    if (!crc32.table) {
      const table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
      }
      crc32.table = table;
    }
    const table = crc32.table;
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function toDosDateTime(date) {
    const dosTime = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
    const dosDate = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
    return { dosTime, dosDate };
  }

  // files: [{ name: string, data: Uint8Array }] からZIPアーカイブ(Blob)を組み立てる
  // (無圧縮/STORE方式。外部ライブラリは使わずZIPフォーマットの仕様通りに手書きする)。
  function buildZipBlob(files) {
    const { dosTime, dosDate } = toDosDateTime(new Date());
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach((file) => {
      const nameBytes = new TextEncoder().encode(file.name);
      const data = file.data;
      const crc = crc32(data);
      const size = data.length;

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, size, true);
      local.setUint32(22, size, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);
      localParts.push(new Uint8Array(local.buffer), nameBytes, data);

      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, 0, true);
      central.setUint16(10, 0, true);
      central.setUint16(12, dosTime, true);
      central.setUint16(14, dosDate, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, size, true);
      central.setUint32(24, size, true);
      central.setUint16(28, nameBytes.length, true);
      central.setUint16(30, 0, true);
      central.setUint16(32, 0, true);
      central.setUint16(34, 0, true);
      central.setUint16(36, 0, true);
      central.setUint32(38, 0, true);
      central.setUint32(42, offset, true);
      centralParts.push(new Uint8Array(central.buffer), nameBytes);

      offset += 30 + nameBytes.length + size;
    });

    const centralStart = offset;
    const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);

    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(4, 0, true);
    eocd.setUint16(6, 0, true);
    eocd.setUint16(8, files.length, true);
    eocd.setUint16(10, files.length, true);
    eocd.setUint32(12, centralSize, true);
    eocd.setUint32(16, centralStart, true);
    eocd.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, new Uint8Array(eocd.buffer)], { type: "application/zip" });
  }

  function canvasToPngBytes(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("画像の生成に失敗しました")); return; }
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
      }, "image/png");
    });
  }

  // カード1枚の表面画像を作る。エンチャントは物理的にカードへ貼るシールなので
  // (1.2節)、付いている場合はデッキ一覧同様カード画像に重ねて1枚の画像に合成する。
  // 画像が無いカード(ダミー登録分)はプレースホルダー表示と同じ見た目で代用する。
  async function composeCardFrontPng(entry) {
    return composeCardImagePng(deckCardImageSrc(entry), deckEnchantImageSrc(entry), entry.name);
  }

  // imageSrc/overlaySrcを指定してカード1枚分の画像を合成する下請け(composeCardFrontPngの
  // 汎用版)。禁断カードの裏面など、entryの通常のbaseImage以外を合成したい場合に使う。
  async function composeCardImagePng(imageSrc, overlaySrc, fallbackName) {
    const [baseImg, overlayImg] = await Promise.all([
      imageSrc ? loadImageForExport(imageSrc) : Promise.resolve(null),
      overlaySrc ? loadImageForExport(overlaySrc) : Promise.resolve(null),
    ]);

    const width = baseImg ? baseImg.width : 400;
    const height = baseImg ? baseImg.height : 560;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (baseImg) {
      drawCoverImage(ctx, baseImg, 0, 0, width, height);
    } else {
      ctx.fillStyle = "#1b1f27";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#f6f6f6";
      ctx.font = `bold ${Math.round(width * 0.09)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      drawTruncatedText(ctx, fallbackName, width / 2, height / 2, width - 24);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
    }
    if (overlayImg) drawContainImage(ctx, overlayImg, 0, 0, width, height);

    return canvasToPngBytes(canvas);
  }

  // 「禁断」カードの例外: 「禁断～封印されしX～/伝説の禁断 ドキンダムX」だけは、
  // 山札内で見える裏面が常に封印状態(禁断～封印されしX～=カード本来のbaseImage)側、
  // めくった時の表が伝説の禁断ドキンダムX(backFace)側になるようにする
  // (スリーブ画像を指定していてもこの1枚だけは専用の裏面を使う)。
  // デッキのカード記録はbackFaceを保持しないスナップショットのため(9.1節)、
  // resolveDeckCardFaceと同様に名前で現行キューブ+ゴミ箱と照合して引き直す。
  const SPECIAL_FLIP_CARD_NAME = "禁断～封印されしX～/伝説の禁断 ドキンダムX";

  function resolveSpecialFlipFaces(entry) {
    if (entry.name !== SPECIAL_FLIP_CARD_NAME) return null;
    const found = allCardSuggestCandidates().find(({ card }) => displayName(card) === entry.name);
    const backFace = found && found.card.backFace;
    if (!backFace || !backFace.baseImage) return null;
    const fromTrash = isTrashImageSource(entry.imageSource);
    return {
      frontSrc: cardImagePath("base", backFace.baseImage, fromTrash),
      backSrc: deckCardImageSrc(entry),
    };
  }

  const MIME_EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/bmp": "bmp", "image/avif": "avif" };

  // スリーブ画像(裏面)のバイト列と拡張子。未指定なら既定裏面画像を使う。
  // cube_admin管理下のdata/(gitで追跡しない実データ)ではなく、コードと一緒にgit管理される
  // assets/に置く(cubeIdに依存しない共通アセットのため。全キューブ世代で共用する)。
  async function resolveSleeveBytes(sleeveFile) {
    if (sleeveFile) {
      const bytes = new Uint8Array(await sleeveFile.arrayBuffer());
      const extMatch = /\.([A-Za-z0-9]+)$/.exec(sleeveFile.name || "");
      const ext = extMatch ? extMatch[1].toLowerCase() : (MIME_EXTENSIONS[sleeveFile.type] || "png");
      return { bytes, ext };
    }
    const res = await fetch("assets/card_back.webp");
    if (!res.ok) throw new Error("既定の裏面画像の取得に失敗しました");
    return { bytes: new Uint8Array(await res.arrayBuffer()), ext: "webp" };
  }

  function xmlEscape(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ユドナリウムの「山札」1個分のdata.xmlを組み立てる。stateは全カード共通で"1"(裏向き)。
  function buildUdonariumDeckXml(deckName, cardFaces) {
    const cardsXml = cardFaces.map(({ entry, frontHash, backHash }) => `    <card location.name="table" location.x="0" location.y="0" posZ="0" state="1" rotate="0" owner="" zindex="0">
      <data name="card">
        <data name="image">
          <data type="image" name="imageIdentifier"></data>
          <data type="image" name="front">${frontHash}</data>
          <data type="image" name="back">${backHash}</data>
        </data>
        <data name="common">
          <data name="name">${xmlEscape(entry.name)}</data>
          <data name="size">2</data>
        </data>
        <data name="detail"></data>
      </data>
    </card>`).join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<card-stack location.name="table" location.x="0" location.y="0" posZ="0" rotate="0" zindex="0" owner="" isShowTotal="true">
  <data name="card-stack">
    <data name="image">
      <data type="image" name="imageIdentifier"></data>
    </data>
    <data name="common">
      <data name="name">${xmlEscape(deckName)}</data>
    </data>
    <data name="detail"></data>
  </data>
  <node name="cardRoot">
${cardsXml}
  </node>
</card-stack>
`;
  }

  async function buildAndDownloadUdonariumZip(deckNameRaw, entries, sleeveFile) {
    const deckName = (deckNameRaw || "").trim() || "デッキ";

    const { bytes: sleeveBytes, ext: sleeveExt } = await resolveSleeveBytes(sleeveFile);
    const sleeveHash = await sha256Hex(sleeveBytes);

    const composed = await Promise.all(entries.map(async (entry) => {
      const specialFaces = resolveSpecialFlipFaces(entry);
      const frontBytes = specialFaces
        ? await composeCardImagePng(specialFaces.frontSrc, deckEnchantImageSrc(entry), entry.name)
        : await composeCardFrontPng(entry);
      const frontHash = await sha256Hex(frontBytes);

      let backHash = sleeveHash;
      let backBytes = null;
      if (specialFaces) {
        backBytes = await composeCardImagePng(specialFaces.backSrc, null, entry.name);
        backHash = await sha256Hex(backBytes);
      }

      return { entry, frontHash, frontBytes, backHash, backBytes };
    }));

    const imageFiles = new Map(); // hash -> { bytes, ext }
    imageFiles.set(sleeveHash, { bytes: sleeveBytes, ext: sleeveExt });
    composed.forEach(({ frontHash, frontBytes, backHash, backBytes }) => {
      if (!imageFiles.has(frontHash)) imageFiles.set(frontHash, { bytes: frontBytes, ext: "png" });
      if (backBytes && !imageFiles.has(backHash)) imageFiles.set(backHash, { bytes: backBytes, ext: "png" });
    });

    const dataXml = buildUdonariumDeckXml(deckName, composed);

    const files = [{ name: "data.xml", data: new TextEncoder().encode(dataXml) }];
    imageFiles.forEach((info, hash) => files.push({ name: `${hash}.${info.ext}`, data: info.bytes }));

    const zipBlob = buildZipBlob(files);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(zipBlob);
    a.download = `${deckName.replace(/[\\/:*?"<>|]/g, "_")}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  // zip出力パネル(スリーブ画像選択欄)の開閉・ドラッグ&ドロップ・出力実行を配線する。
  // デッキ一覧の詳細ポップアップ・シミュレーターの完成デッキ画面の両方から使う共通部品。
  // refs: { toggleBtn, panel, dropzone, fileInput, previewImg, dropzoneText, confirmBtn, errorEl }
  // getExportInputs: () => { deckName, entries } (クリック時点の最新値を取得する)
  function createZipExportController(refs, getExportInputs) {
    let sleeveFile = null;
    const defaultDropzoneText = refs.dropzoneText.textContent;

    function setSleeveFile(file) {
      sleeveFile = file || null;
      if (sleeveFile) {
        refs.previewImg.src = URL.createObjectURL(sleeveFile);
        refs.previewImg.hidden = false;
        refs.dropzoneText.textContent = sleeveFile.name;
      } else {
        refs.previewImg.hidden = true;
        refs.previewImg.src = "";
        refs.dropzoneText.textContent = defaultDropzoneText;
      }
    }

    function close() {
      refs.panel.hidden = true;
      refs.toggleBtn.textContent = "zipファイルで出力";
      refs.errorEl.textContent = "";
      refs.fileInput.value = "";
      setSleeveFile(null);
    }

    function open() {
      refs.panel.hidden = false;
      refs.toggleBtn.textContent = "キャンセル";
    }

    refs.toggleBtn.addEventListener("click", () => { if (refs.panel.hidden) open(); else close(); });

    refs.dropzone.addEventListener("click", () => refs.fileInput.click());
    refs.dropzone.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); refs.fileInput.click(); }
    });
    refs.fileInput.addEventListener("change", () => {
      const file = refs.fileInput.files && refs.fileInput.files[0];
      if (file) setSleeveFile(file);
    });
    refs.dropzone.addEventListener("dragover", (ev) => { ev.preventDefault(); refs.dropzone.classList.add("dragover"); });
    refs.dropzone.addEventListener("dragleave", () => refs.dropzone.classList.remove("dragover"));
    refs.dropzone.addEventListener("drop", (ev) => {
      ev.preventDefault();
      refs.dropzone.classList.remove("dragover");
      const file = ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (file && file.type.indexOf("image/") === 0) setSleeveFile(file);
    });

    refs.confirmBtn.addEventListener("click", async () => {
      const { deckName, entries } = getExportInputs();
      if (!entries || entries.length === 0) { refs.errorEl.textContent = "カードがありません。"; return; }
      refs.errorEl.textContent = "";
      const original = refs.confirmBtn.textContent;
      refs.confirmBtn.disabled = true;
      refs.confirmBtn.textContent = "生成中…";
      try {
        await buildAndDownloadUdonariumZip(deckName, entries, sleeveFile);
        close();
      } catch (err) {
        refs.errorEl.textContent = "zipファイルの生成に失敗しました: " + err.message;
      } finally {
        refs.confirmBtn.disabled = false;
        refs.confirmBtn.textContent = original;
      }
    });

    return { close };
  }

  let deckDetailZipController = null;

  function initDeckFeature() {
    $("#deck-card-search").addEventListener("input", (e) => renderDeckSuggestions(e.target.value));
    $("#deck-save-btn").addEventListener("click", openDeckSaveModal);
    $("#deck-save-confirm-btn").addEventListener("click", submitDeckSave);
    $("#deck-detail-delete-btn").addEventListener("click", deleteCurrentDeck);
    $("#deck-detail-image-btn").addEventListener("click", exportDeckImage);
    $("#deck-detail-sort-select").addEventListener("change", (e) => {
      deckDetailSort = e.target.value;
      renderDeckDetailGrid();
    });
    deckDetailZipController = createZipExportController({
      toggleBtn: $("#deck-detail-zip-toggle-btn"),
      panel: $("#deck-detail-zip-panel"),
      dropzone: $("#deck-detail-zip-dropzone"),
      fileInput: $("#deck-detail-zip-file-input"),
      previewImg: $("#deck-detail-zip-preview"),
      dropzoneText: $("#deck-detail-zip-dropzone-text"),
      confirmBtn: $("#deck-detail-zip-confirm-btn"),
      errorEl: $("#deck-detail-zip-error"),
    }, () => {
      const deck = currentDeckDetail();
      return deck ? { deckName: deck.name, entries: sortDeckEntries(deck.cards, deckDetailSort) } : { deckName: "", entries: [] };
    });

    $("#deck-enchant-modal-close").addEventListener("click", () => $("#deck-enchant-modal").classList.remove("open"));
    $("#deck-enchant-modal").addEventListener("click", (ev) => {
      if (ev.target.id === "deck-enchant-modal") $("#deck-enchant-modal").classList.remove("open");
    });

    $("#deck-save-modal-close").addEventListener("click", () => $("#deck-save-modal").classList.remove("open"));
    $("#deck-save-modal").addEventListener("click", (ev) => {
      if (ev.target.id === "deck-save-modal") $("#deck-save-modal").classList.remove("open");
    });

    $("#deck-detail-modal-close").addEventListener("click", () => $("#deck-detail-modal").classList.remove("open"));
    $("#deck-detail-modal").addEventListener("click", (ev) => {
      if (ev.target.id === "deck-detail-modal") $("#deck-detail-modal").classList.remove("open");
    });
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
  let resolveDataReady;
  // simulator.js(ドラフトシミュレーター、cube_spec.md 10節)がstate.cubeData等を
  // 触ってよくなるタイミングを知るためのフラグ。loadData()成功直後に解決する。
  window.CubeShared = window.CubeShared || {};
  window.CubeShared.dataReady = new Promise((resolve) => { resolveDataReady = resolve; });

  async function init() {
    initTabs();
    buildFilterToggles();
    bindFilterInputs();
    initDeckFeature();
    try {
      await loadData();
    } catch (err) {
      $("#card-grid").innerHTML = "";
      $("#empty-message").textContent = err.message;
      $("#empty-message").style.display = "block";
      console.error(err);
      return;
    }
    resolveDataReady();
    applyAndRender();
    renderHistory();
    renderDeckBuildingGrid();
    renderDeckList();
  }

  // simulator.jsはcube.jsの後に読み込まれる別ファイルで、このIIFE内の関数・stateには
  // 直接アクセスできない。ドラフトシミュレーター実装に必要な分だけ、参照(コピーではない)を
  // ここでまとめて公開する。stateは同じオブジェクトを共有するので、シミュレーター側で
  // cube_data.json等を二重にfetchする必要はない。
  Object.assign(window.CubeShared, {
    cubeId, state, $, $$, CIV_ORDER,
    cardFaces, faceOf, displayName, isMulticolorFace, isCardMulticolor, civRank, cardImagePath, enchantById,
    allCardSuggestCandidates, allEnchantCandidates, deckCardEntryFromCard,
    deckCardImageSrc, deckEnchantImageSrc, renderDeckCardTile,
    resolveDeckCardFace, deckCivRank, deckCostOf, sortDeckEntries,
    loadImageForExport, roundedRectPath, drawCoverImage, drawContainImage, drawTruncatedText,
    DECK_IMAGE_COLS, DECK_IMAGE_CELL_W, DECK_IMAGE_CELL_H, DECK_IMAGE_GAP, DECK_IMAGE_PADDING, DECK_IMAGE_HEADER_H,
    DECK_API_BASE, deckSourceLabel, renderDeckList, renderDeckToPngAndDownload,
    buildAndDownloadUdonariumZip, createZipExportController,
  });

  init();
})();
