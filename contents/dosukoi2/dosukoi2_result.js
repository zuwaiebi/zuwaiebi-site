(function (global) {
  'use strict';

  var Storage = global.Dosukoi2.Storage;
  var Assets = global.Dosukoi2.Assets;
  var Boss = global.Dosukoi2.Boss;

  function rankLabel(rankKey) {
    if (!rankKey) { return 'なし'; }
    return Boss.RANK_INFO[rankKey] ? Boss.RANK_INFO[rankKey].label : rankKey;
  }

  function buildLines(result) {
    return [
      '撃退数: ' + (result.defeatedZako + result.defeatedBosses),
      '倒したボス数: ' + result.defeatedBosses,
      '最高到達番付: ' + rankLabel(result.highestRank),
      '周回数: ' + result.laps,
      '生存時間: ' + result.survivalSec + '秒',
      'スコア: ' + result.score
    ];
  }

  function show(result) {
    document.getElementById('result-title').textContent =
      result.mode === 'extra' ? 'ゲームオーバー (EXTRA)' : 'ゲームオーバー';

    var statsEl = document.getElementById('result-stats');
    statsEl.innerHTML = '';
    buildLines(result).forEach(function (text) {
      var li = document.createElement('li');
      li.textContent = text;
      statsEl.appendChild(li);
    });

    var updated = Storage.saveIfBest(result.mode, result);
    var best = Storage.getBest(result.mode);
    var bestEl = document.getElementById('result-best');
    if (updated) {
      bestEl.textContent = '自己ベストを更新しました！';
    } else if (best) {
      bestEl.textContent = '自己ベスト: スコア ' + best.score;
    } else {
      bestEl.textContent = '';
    }

    var omakeWrap = document.getElementById('omake');
    var omakeImage = document.getElementById('omake-image');
    if (result.showOmake) {
      omakeWrap.hidden = false;
      var img = Assets.getImage('omakeArt');
      if (img) {
        omakeImage.style.backgroundImage = 'url(' + img.src + ')';
        omakeImage.classList.remove('placeholder');
      } else {
        omakeImage.style.backgroundImage = '';
        omakeImage.classList.add('placeholder');
      }
    } else {
      omakeWrap.hidden = true;
    }
  }

  global.Dosukoi2 = global.Dosukoi2 || {};
  global.Dosukoi2.Result = { show: show };
})(window);
