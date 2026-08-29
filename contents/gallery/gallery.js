(function () {
  "use strict";

  var data = window.GALLERY_DATA;
  var Core = window.GalleryCore;

  var worksById = {};
  data.works.forEach(function (w) { worksById[w.id] = w; });
  var charsById = {};
  data.characters.forEach(function (c) { charsById[c.id] = c; });

  var workFilterEl = document.getElementById("work-filter");
  var characterFilterEl = document.getElementById("character-filter");
  var sortOrderEl = document.getElementById("sort-order");
  var gridEl = document.getElementById("gallery-grid");
  var emptyEl = document.getElementById("empty-message");
  var resultCountEl = document.getElementById("result-count");
  var clearBtn = document.getElementById("clear-filters");
  var sizeToggle = document.getElementById("size-toggle");

  var lightbox = document.getElementById("lightbox");
  var lightboxImg = document.getElementById("lightbox-img");
  var lightboxTags = document.getElementById("lightbox-tags");
  var lightboxSource = document.getElementById("lightbox-source");
  var lightboxClose = document.getElementById("lightbox-close");
  var lightboxPrev = document.getElementById("lightbox-prev");
  var lightboxNext = document.getElementById("lightbox-next");

  var currentList = [];
  var currentIndex = -1;

  function sortedByName(list) {
    return list.slice().sort(function (a, b) { return a.name.localeCompare(b.name, "ja"); });
  }

  function populateFilterSelects() {
    // 作品は gallery_data.js 内の並び順(固定順)をそのまま使う
    data.works.forEach(function (w) {
      var opt = document.createElement("option");
      opt.value = w.id;
      opt.textContent = w.name;
      workFilterEl.appendChild(opt);
    });
    sortedByName(data.characters).forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      characterFilterEl.appendChild(opt);
    });
  }

  function imageMatchesFilters(image) {
    var workId = workFilterEl.value;
    var charId = characterFilterEl.value;
    if (workId) {
      var effWorks = Core.effectiveWorkIds(data, image);
      if (!effWorks.has(workId)) return false;
    }
    if (charId) {
      if ((image.characters || []).indexOf(charId) === -1) return false;
    }
    return true;
  }

  // data.images の並び順 = 追加された順(古い順)として扱う
  function applySortOrder(list) {
    var mode = sortOrderEl.value;
    if (mode === "newest") {
      list.reverse();
    } else if (mode === "random") {
      shuffle(list);
    }
  }

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
  }

  function renderGrid() {
    currentList = data.images.filter(imageMatchesFilters);
    applySortOrder(currentList);
    gridEl.innerHTML = "";
    currentList.forEach(function (image, index) {
      var item = document.createElement("div");
      item.className = "gallery-item";
      var img = document.createElement("img");
      img.src = encodeURI(image.file);
      img.loading = "lazy";
      img.alt = describeImage(image);
      img.width = image.width || undefined;
      img.height = image.height || undefined;
      item.appendChild(img);
      item.addEventListener("click", function () { openLightbox(index); });
      gridEl.appendChild(item);
    });
    emptyEl.style.display = currentList.length === 0 ? "block" : "none";
    resultCountEl.textContent = currentList.length + " / " + data.images.length + " 枚";
  }

  function describeImage(image) {
    var names = (image.characters || []).map(function (id) {
      var c = charsById[id];
      return c ? c.name : id;
    });
    var effWorks = Core.effectiveWorkIds(data, image);
    var workNames = Array.from(effWorks).map(function (id) {
      var w = worksById[id];
      return w ? w.name : id;
    });
    return names.concat(workNames).join(" / ");
  }

  function openLightbox(index) {
    currentIndex = index;
    updateLightbox();
    lightbox.classList.add("open");
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    lightboxImg.src = "";
  }

  function updateLightbox() {
    var image = currentList[currentIndex];
    if (!image) return;
    lightboxImg.src = encodeURI(image.file);
    lightboxImg.alt = describeImage(image);

    lightboxTags.innerHTML = "";
    (image.characters || []).forEach(function (id) {
      var c = charsById[id];
      if (c) lightboxTags.appendChild(makeTagChip(c.name, "tag-chip--character", function () {
        filterByCharacter(id);
      }));
    });
    Core.effectiveWorkIds(data, image).forEach(function (id) {
      var w = worksById[id];
      if (w) lightboxTags.appendChild(makeTagChip(w.name, "tag-chip--work", function () {
        filterByWork(id);
      }));
    });

    renderLightboxSource(image);
  }

  function filterByCharacter(id) {
    characterFilterEl.value = id;
    workFilterEl.value = "";
    renderGrid();
    closeLightbox();
  }

  function filterByWork(id) {
    workFilterEl.value = id;
    characterFilterEl.value = "";
    renderGrid();
    closeLightbox();
  }

  function renderLightboxSource(image) {
    var source = image.source;
    lightboxSource.innerHTML = "";
    if (!source || (!source.name && !source.url)) {
      lightboxSource.style.display = "none";
      return;
    }
    lightboxSource.style.display = "block";
    lightboxSource.appendChild(document.createTextNode("出典: "));
    if (source.url) {
      var a = document.createElement("a");
      a.href = source.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = source.name || source.url;
      lightboxSource.appendChild(a);
    } else {
      lightboxSource.appendChild(document.createTextNode(source.name));
    }
  }

  function makeTagChip(text, extraClass, onClick) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tag-chip active " + extraClass;
    btn.textContent = text;
    btn.title = "このタグの画像一覧を表示";
    btn.addEventListener("click", onClick);
    return btn;
  }

  function showPrev() {
    if (currentList.length === 0) return;
    currentIndex = (currentIndex - 1 + currentList.length) % currentList.length;
    updateLightbox();
  }

  function showNext() {
    if (currentList.length === 0) return;
    currentIndex = (currentIndex + 1) % currentList.length;
    updateLightbox();
  }

  workFilterEl.addEventListener("change", renderGrid);
  characterFilterEl.addEventListener("change", renderGrid);
  sortOrderEl.addEventListener("change", renderGrid);

  clearBtn.addEventListener("click", function () {
    workFilterEl.value = "";
    characterFilterEl.value = "";
    renderGrid();
  });

  sizeToggle.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-size]");
    if (!btn) return;
    Array.from(sizeToggle.children).forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
    gridEl.style.setProperty("--row-height", btn.dataset.size + "px");
  });

  lightboxClose.addEventListener("click", closeLightbox);
  lightboxPrev.addEventListener("click", showPrev);
  lightboxNext.addEventListener("click", showNext);
  lightbox.addEventListener("click", function (e) {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", function (e) {
    if (!lightbox.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") showPrev();
    if (e.key === "ArrowRight") showNext();
  });

  populateFilterSelects();
  renderGrid();
})();
