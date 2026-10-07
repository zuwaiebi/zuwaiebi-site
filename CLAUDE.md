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
- `contents/reverse/` — p5.jsで実装されたブラウザゲーム「REVE"Я"SE」。`reverse.html`がp5.js(CDN)を読み込み`sketch.js`を実行する。`reverse.pde`は移植元のProcessing版。画像・音声は`data/`配下に置く前提(`sketch.js`冒頭のコメント参照)。
- `contents/` 直下の他HTML(`dosukoi.html`等) — 個別コンテンツページ、または外部ゲームへのリンクページ。
- `contents/gallery/` — 個人用画像ギャラリーの閲覧ページ。`gallery.html`がタグ絞り込み(作品/キャラクターのプルダウン + 並び順)・ポップアップ拡大表示を行い、`gallery_data.js`(`window.GALLERY_DATA`に作品/キャラクター/画像とタグを保持する自己完結データファイル)と`gallery_core.js`(共通ロジック)を読み込む。画像本体は`contents/gallery/images/`。キャラクタータグには所属作品が紐づいており、画像にキャラクタータグを付けると対応する作品タグが自動的に(表示上)付与される。作品タグは`gallery_data.js`の`works`配列の並び順を固定順として扱う(並べ替えない)。画像には出典名/出典URL(`source: {name, url}`)を任意で設定でき、未設定なら`source`キー自体を持たない。**画像追加/削除・タグ編集の管理ツールはこのリポジトリの外、`webproject/gallery_admin/`に置いてあり、公開サイトからは一切リンクしない。** `gallery_admin/launch_admin.bat`をダブルクリックすると、`gallery_admin/server.py`(標準ライブラリのみ、Pillow不要)がローカル専用(`127.0.0.1:8877`)のHTTPサーバーとして起動し、既定ブラウザで`admin.html`が自動的に開く。`admin.html`はページを開いた時点で`../website/contents/gallery/gallery_data.js`を自動`fetch()`する(フォルダ選択は不要、`contents/gallery`との相対位置が固定である前提)。編集(タグ付け・出典編集・作品/キャラクター管理)は数百msデバウンスの上`POST /api/save-data`で即座に`gallery_data.js`へ反映され、画像の追加/削除も`POST /api/add-image`・`POST /api/delete-image`で`images/`フォルダへ即座に反映される(手動でのダウンロード/コピーは不要)。全APIは`X-Gallery-Admin`ヘッダー必須(他タブからのdrive-by POST対策)、ファイル名はサーバー側でサニタイズ・重複回避・パストラバーサル対策済み。
- `contents/cube/` — デュエマ独自キューブドラフト「エンチャント付きキューブ」のカードリスト参照ページ。仕様は`webproject/cube_spec.md`参照。`cube.html`が`cube.js`(絞り込み・並べ替え・詳細モーダル・タブ切替)を読み込み、`data/<cubeId>/cube_data.json`(カード・エンチャント定義)、`data/<cubeId>/cube_history.json`(カードの追加・削除履歴)、`data/<cubeId>/trash.json`(削除済み=ゴミ箱のカード・エンチャント)、`data/<cubeId>/decks.json`(記録済みデッキ)を`fetch()`する。画像は`data/<cubeId>/images/base/`(カード画像)・`images/enchant/`(エンチャントの透過オーバーレイ画像、タイプごとに1枚を使い回す)、ゴミ箱行きの画像は`trash_images/base/`・`trash_images/enchant/`。カードは複数の文明を持てる(多色)ほか、ツインパクトカード(`isTwinpact`)は上面(トップレベルのフィールド)と下面(`bottomFace`)でそれぞれ独立した文明・コスト・パワー・種族・カードタイプ・能力テキストを持つ。「デッキ登録」「デッキ一覧」タブでは、キューブドラフトで完成したデッキを記録・閲覧できる(カード名サジェスト・エンチャント設定・実戦/シミュレータの種別表示。詳細は`cube_spec.md`9章)。デッキ一覧の詳細ポップアップ・シミュレーターの完成デッキ画面には、[ユドナリウム](https://github.com/TK11235/udonarium)にそのまま読み込めるzip(山札データ)を出力する機能もある(外部ライブラリなしでZIP/SHA-256を自前実装。詳細は`cube_spec.md`9.5節)。「ドラフトシミュレータ」タブでは、一人でパック生成からピック進行・最終調整までを体験できる(`simulator.js`、`cube.js`の`window.CubeShared`経由でデータ・描画ヘルパーを再利用。詳細は`cube_spec.md`10章)。「ドラフト形式」タブは`draft.md`(作業用メモ)の内容をそのままHTMLで掲載した閲覧専用ページ(詳細は`cube_spec.md`11章)。デッキ記録・シミュレーターの保存/削除のみ、`cube_admin`側に認証なし・共通の編集用パスワードで保護された公開API(`POST`/`DELETE /api/cube/<cubeId>/decks...`)がある。**データの追加/編集/削除・画像アップロードの管理画面はこのリポジトリの外、`webproject/cube_admin/`に置いてあり、公開サイトからは一切リンクしない。** `gallery_admin/`と異なりVPS上に常時デプロイして使う想定(詳細は`cube_admin/README.md`)。
- `contents/dosukoi2/` — ブラウザゲーム「どす恋2 ～恋に千秋楽なし～」。前作`dosukoi.html`(外部サイトplicy.net製)のストーリー的続編で、こちらは素のCanvas2D+Vanilla JS(外部ライブラリ・CDN依存なし)による自作実装。`dosukoi2.html`が`dosukoi2_*.js`(状態遷移・入力・エンティティ・難易度・描画・localStorage等、責務ごとに分割)を読み込む。画像・音声素材は未用意で、`dosukoi2_assets.js`が画像読み込み失敗時に図形描画のフォールバックへ自動的に切り替える。`data/images/`・`data/story/`に規約通りのファイル名(`dosukoi2_assets.js`のマニフェスト参照)で画像を置くだけでコード変更なしに差し替わる。ハイスコア等は`dosukoi2_`接頭辞を付けて`localStorage`に保存する。
- `contents/super_mahjong/` — 3〜4人オンライン対戦麻雀「スーパー麻雀」（カード付き）の画面側。素のVanilla JS(外部ライブラリなし。フォントのみGoogle Fonts)で、`super_mahjong.html`が`js/sm_*.js`(IIFEで`window.SuperMahjong.*`に登録: `cards_data`=カード定義(自動生成)、`tiles`=SVG牌描画・同じ牌を光らせる(PCはホバー、スマホはタップ)・ドラの牌の光沢(ワイマール憲法などカードの効果でドラになっている牌も)・カードの効果で別の牌として扱っている牌のフェード表示・赤ドラ(5以外もカードで赤ドラになる)・黄金の国ジパングの間は見えている牌をすべて光らせる・牌種38はオールマイティ牌(サーバーの`doraKinds`/`doraTiles`/`asKinds`/`reds`/`allDora`)、`cards`=カード描画・詳細表示(カードの文やログ・選択ウィンドウの文の《カード名》は押すとそのカードの詳細。`SM.Cards.linkify`で付ける。フルパワーはテキストの最後に共通ルールの注釈を灰色の小さい文字で足す。注釈の文は`sm_cards.js`の`FULL_NOTE`)、`icons`=プレイヤーアイコン(カードのイラストから選ぶ。`super_mahjong_icon`に保存)と演出の「使用者 >>> 選んだもの」の行、`fx`=サイコロを投げる・じゃんけんの手を出す・全員が切った牌を比べる(勝利宣言鬼丸「覇」)演出、`net`=WebSocket接続/自動再接続、`audio`=BGM(タイトルで選んだ曲を対局中だけ流し、和了から次の局までは一時停止)と効果音、`deck`=部屋のルールの「カード枚数設定」(山札に入れるカードと枚数。「すべて0枚にする」(すべて0枚の時は「すべて1枚にする」)もある。部屋を作る時の設定は`super_mahjong_card_counts`にカードのkeyで保存)、`lobby`=部屋作成・待機室(連荘のON/OFFもここ。既定は東風戦・四麻35000点/三麻45000点。カードはいつも使う)、`table`=卓描画・出来事ごとの演出と効果音・場のパワーの詳細にメモ(唯我独尊の宣言など)・タイルフォースが有効な手牌とパワーの緑の縁・カードの効果で和了れない時の表示(フリテンと同じ所)・他の人が割り込みや鳴きを考えている間の「他プレイヤーが思考中…」、`input`=打牌・行動ボタン(鳴き・和了・リーチ・スキップは自分の領域の上に出す)・カードとフルパワーのプレイ(どちらも画像を押す)、`prompt`=カード効果などの選択ウィンドウ(画面の上に出し、一時的に隠せる。どのカードの処理かを見出しに出す(割り込みはきっかけのカードも)。選べない項目は灰色。自分の手牌から選ぶ問い合わせ`handPick`はウィンドウを出さず画面の手牌を押して選ばせる)・フルパワー選択、`log`=出来事のログ(新しく対局を始めたら前の対局の分を消す。部屋情報の`gameNo`で見分ける)、`result`=局/最終結果(和了画面ではカードの効果で別の牌として使った牌を変更先の牌で見せる。他家の変化した牌・赤ドラは結果に入っている`tiles`/`reds`で描く。勝利宣言鬼丸「覇」で同時に和了した人(`more`)も順に出し、飛びで終わった時は「飛び」)、`monty`=モンティホール問題の盤(サーバーの`game.monty`を全員に見せ、仕掛けられた人だけが押せる。表向きにする時はその場でカードを回転させる)、`main`=画面遷移・途中退出。新しい対局になったら`prompt`/`input`の答えた問い合わせの覚えを消す)を読み込む。幅699px以下（スマホ縦画面）では他家を上から下家・対面・上家の順に縦に並べる(`super_mahjong.css`末尾のメディアクエリ)。**ゲームロジックは一切持たず**、対戦サーバー(このリポジトリの外、`webproject/super_mahjong_server/`、Node.js+ws。詳細はその`README.md`と`docs/card_rules.md`)から届く「自席から見える状態」と「問い合わせ（手番の行動・鳴き・選択・割り込み）」を描画して、回答を送り返すだけ。接続先は同一ホストの`/super-mahjong/ws`(nginxでサーバーへプロキシ)、`?server=`で上書き可。ローカル確認は`super_mahjong_server/`で`npm run dev`(静的配信も兼ねる)。
  - カードの元データは`super_mahjong_cards_list.csv`(カード名,カードタイプ,能力,備考)。**CSVを編集したら`super_mahjong_server/`で`node tools/build-cards.mjs`を実行**し、サーバー用`src/cards/cards.json`と画面用`js/sm_cards_data.js`を作り直す(備考は画面には出さない。誤記の修正・没カードは同スクリプト内の`OVERRIDES`/`EXCLUDE`、山札に複数枚入るカードは`COPIES`で、その枚数が「カード枚数設定」の既定値になる)。カード画像は`data/card_img/<カード名>.webp`(カード名と一致させる。表記ゆれはスクリプトの`IMG_ALIASES`)。新しいカードを足した時は、サーバーの`src/cards/impl_*.js`に効果の実装も必要。
  - 牌は自作SVGで、`data/tile_img/`に画像を置けば差し替わる(`1m.png`の有無で判定。画像が無い牌だけSVGに戻る)。ファイル名は数牌`1m`〜`9s.png`、字牌`東南西北白發中.png`、花牌`春夏秋冬.png`、オールマイティ牌`almighty.png`、裏`裏.png`。赤ドラは後ろに`r`(`5mr.png`・`3pr.png`・`東r.png`・`春r.png`・`almightyr.png`など。5以外の赤ドラはカードでだけ出る)(旧名の`0m.png`・`1z.png`・`back.png`も可)。名前・アイコン・再接続トークン・操作設定・BGMと音量は`super_mahjong_`接頭辞で`localStorage`に保存。三麻も全136枚を使う(チーなし・北抜きあり・ツモ損)。
  - BGMは`data/bgm/`(ファイル名の先頭の番号順に並ぶ)。**曲を足したり消したりしたら`super_mahjong_server/`で`node tools/build-bgm.mjs`を実行**し、一覧`js/sm_bgm_data.js`(自動生成)を作り直す。効果音は`data/se/`の決まった名前(打牌・ツモる・ドロー・イベント発動・パワー使用・和了・役満和了・洗牌・破壊・サイコロ)で、割り当ては`js/sm_table.js`の`soundOf`。
- `orenoheyaland/` — 別セクション「オレノヘヤランド公国ホームページ跡地」のページ群。
- `*.ttc` — 埋め込みフォント(游明朝・游ゴシック系)。

## 開発時の注意

- 各コンテンツは基本的に自己完結したHTML+JS+CSSで、共通のビルドパイプラインを介さない。新規コンテンツを追加する際は既存の`contents/`配下の構成に倣い、`index.html`からリンクを張る。
- 日本語のファイル名・変数キー(CSVのヘッダーやJSONキーなど)が使われているため、そのまま維持する。
