# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

個人サイト「ずわいえびのホームページ」。ビルドツールやフレームワークを使わない静的HTML/CSS/JSサイトで、GitHub Pages(`zuwaiebi.github.io`)想定のリポジトリ構成だが、実運用は自作Webサーバーで配信する。バックエンド・パッケージマネージャ・ビルドステップは存在しない。

## 開発コマンド

ビルド・lint・テストの仕組みは無い。ローカル確認は静的ファイルサーバーを立てて `index.html` から辿る、あるいは対象HTMLを直接ブラウザで開く。

```
python -m http.server 8000   # 例: リポジトリルートで簡易サーバーを起動
```

## 構成

- `index.html` — トップページ。コンテンツへのリンクと更新履歴を手動で列挙している。新しいコンテンツを追加したら、ここにリンクと更新履歴の行を追加する。
- `flavor_quiz.html` / `script.js` / `styles.css` — デュエマフレーバークイズ本体。`script.js` が `EMBEDDED_CARDS`（`embedded_cards.js`)からカードデータを読み込みDOM操作で画面遷移(`title`/`quiz`/`result`/`ginko`)を行う素のJSアプリ。
- `dm_cards_data.csv` — フレーバークイズのカード元データ(カード名/型番/画像ファイル名/フレーバー)。
- `embedded_cards.js` — 上記CSVと同内容を`EMBEDDED_CARDS`定数としてJS配列に埋め込んだもの(ローカルファイル実行時にfetchできないCSV/JSONの代わりに使う)。**CSVを更新したら`embedded_cards.js`も手動で同期させる**(自動生成スクリプトは無い)。
- `images/` — フレーバークイズで使うカード画像。ファイル名は`embedded_cards.js`/CSVの「画像ファイル名」列と一致させる。
- `contents/reverse/` — p5.jsで実装されたブラウザゲーム「REVE"Я"SE」。`reverse.html`がp5.js(CDN)を読み込み`sketch.js`を実行する。`reverse.pde`は移植元のProcessing版、`processing.min.js`は未使用の残骸。画像・音声は`data/`配下に置く前提(`sketch.js`冒頭のコメント参照)。
- `contents/` 直下の他HTML(`dosukoi.html`等) — 個別コンテンツページ、または外部ゲームへのリンクページ。
- `orenoheyaland/` — 別セクション「オレノヘヤランド公国ホームページ跡地」のページ群。
- `*.ttc` — 埋め込みフォント(游明朝・游ゴシック系)。

## 開発時の注意

- 各コンテンツは基本的に自己完結したHTML+JS+CSSで、共通のビルドパイプラインを介さない。新規コンテンツを追加する際は既存の`contents/`配下の構成に倣い、`index.html`からリンクを張る。
- 日本語のファイル名・変数キー(CSVのヘッダーやJSONキーなど)が使われているため、そのまま維持する。
