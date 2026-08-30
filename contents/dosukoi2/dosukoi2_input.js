(function (global) {
  'use strict';

  // Pointer Eventsはタッチ・マウス・ペンを統一的に扱い、マルチタッチも
  // 指ごとに独立したイベントとして発火するため、多点管理コードは書かなくてよい。
  function attach(canvas, onTapAt) {
    canvas.addEventListener('pointerdown', function (evt) {
      evt.preventDefault();
      var rect = canvas.getBoundingClientRect();
      var px = evt.clientX - rect.left;
      var py = evt.clientY - rect.top;
      onTapAt(px, py);
    });
  }

  global.Dosukoi2 = global.Dosukoi2 || {};
  global.Dosukoi2.Input = { attach: attach };
})(window);
