/*
 * gallery.html から読み込む共通ロジック。
 * GALLERY_DATA (gallery_data.js) の形を前提にした純粋な関数のみを置く。
 */
(function (global) {
  "use strict";

  function findWork(data, workId) {
    return data.works.find(function (w) { return w.id === workId; }) || null;
  }

  function findCharacter(data, charId) {
    return data.characters.find(function (c) { return c.id === charId; }) || null;
  }

  // 画像に設定された作品タグ = 手動で設定した作品 + 登場キャラクターの所属作品(自動)
  function effectiveWorkIds(data, image) {
    var ids = new Set(image.works || []);
    (image.characters || []).forEach(function (charId) {
      var c = findCharacter(data, charId);
      if (c) {
        (c.works || []).forEach(function (w) { ids.add(w); });
      }
    });
    return ids;
  }

  // 作品タグのうち、キャラクターから自動付与されたもの(手動設定と重複しないもの)
  function autoWorkIds(data, image) {
    var manual = new Set(image.works || []);
    var auto = new Set();
    (image.characters || []).forEach(function (charId) {
      var c = findCharacter(data, charId);
      if (c) {
        (c.works || []).forEach(function (w) {
          if (!manual.has(w)) auto.add(w);
        });
      }
    });
    return auto;
  }

  function slugify(text) {
    return String(text)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9぀-ヿ㐀-鿿]+/g, "_")
      .replace(/^_+|_+$/g, "") || "item";
  }

  function uniqueId(base, existingIds) {
    var id = base;
    var n = 2;
    while (existingIds.has(id)) {
      id = base + "_" + n;
      n++;
    }
    return id;
  }

  global.GalleryCore = {
    findWork: findWork,
    findCharacter: findCharacter,
    effectiveWorkIds: effectiveWorkIds,
    autoWorkIds: autoWorkIds,
    slugify: slugify,
    uniqueId: uniqueId
  };
})(window);
