(function (global) {
  'use strict';

  function show(name) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.remove('active');
    }
    var target = document.getElementById('screen-' + name);
    if (target) { target.classList.add('active'); }
  }

  global.Dosukoi2 = global.Dosukoi2 || {};
  global.Dosukoi2.State = { show: show };
})(window);
