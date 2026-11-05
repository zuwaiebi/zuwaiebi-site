// 中国語の表示: 静的な HTML を置き換え、後から足される文も置き換え続ける（sm_i18n.js）。
// ほかのスクリプトが要素を掴む前に置き換えるので、<body> の最後のスクリプトの先頭で読み込む
window.SuperMahjong.I18n.applyStatic();
window.SuperMahjong.I18n.observe();
