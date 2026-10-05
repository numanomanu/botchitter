# botchitter

一人用のつぶやき PWA。ビルドなしの素の HTML/CSS/JS。データは端末内の IndexedDB だけに置く。
外部ライブラリは端末間の同期で使う QR の生成・読み取りの2つだけ（`vendor/` に同梱、同期画面を開いたときだけ読み込む）。
サーバー側は、リンクのタイトルを取る `api/ogp.js`（Vercel Function、CommonJS）だけ。
データ構造は `app.js` 冒頭のコメントを参照。

## ファイル構成
- `index.html`: 画面の骨格
- `style.css`: 基本スタイル（テーマ変数・リセット・レイアウト・ヘッダー・共通ダイアログ・トースト）
- `compose.css`: 投稿フォーム・編集・返信・引用・タグハイライト・気分選択のスタイル
- `timeline.css`: タイムライン・カード・アクション・インライン返信・フィルターバー・日付区切りのスタイル
- `detail.css`: 詳細画面・フォーカスカード・編集履歴・引用先・前後投稿ナビゲーションのスタイル
- `search.css`: 検索バー・入力ラッパー・ハイライト・クリアボタンのスタイル
- `archive.css`: 振り返り（草）・直近2週間ポコポコ・ヒートマップ・思い出カードのスタイル
- `data.js`: 初期データ・IndexedDB/localStorage キー定数
- `i18n.js`: 多言語辞書（`I18N` ja/en）・文言取得 `t()`
- `storage.js`: データの永続化（IndexedDB/localStorage）・エクスポート/インポート
- `app.js`: コア状態管理・DOM要素・日付/共通ヘルパー・ルーティング・キーボードショートカット・起動
- `compose.js`: 投稿・編集・返信・引用・下書き・#タグハイライト・気分選択・テキストエリア自動伸縮
- `search.js`: 検索（インクリメンタル・ハイライト・開閉）
- `timeline.js`: タイムライン表示・カードHTML生成・日付区切り・部分更新（refresh）
- `detail.js`: 詳細画面・コメントスレッド・前後投稿ナビゲーション
- `archive.js`: 振り返り（草）・年間/月間ヒートマップ・直近2週間のポコポコアニメーション
- `sync.css` / `sync.js`: 端末間の同期（前回送ってからの変更を QR で送る・アプリ内カメラで受け取る）
- `vendor/`: `qrcode.js`（QR 生成、MIT）・`jsQR.js`（QR 読み取り、Apache-2.0）。手を加えずそのまま置く
- `sw.js`: Service Worker（オフライン用キャッシュ）
- `api/ogp.js`: リンクの OGP タイトル取得 API

## ルール
- 状態を変えたら `save()` → `refresh(tweetId)`。DOM を個別に書き換えない（`refresh` がタイムラインと詳細画面の両方を直す）
- 日付の表示文字列は保存しない。`createdAt` から `formatTimestamp()` で作る
- タグは保存しない。本文の `#xxx` から `textTokens()` で都度読み取る（URL も同じ関数で切り出す）
- 画面と絞り込みは URL の # 以降で決まる（`parseRoute()` / `navigate()`）。`#tweet-<id>` 詳細、`#archive` 振り返り（草）、それ以外はタイムラインで `tag-<tag>`・`month-<YYYY-MM>`・`q-<検索語>` を & でつなぐ。hash を直接組み立てず `navigate()` を使う（検索のインクリメンタル時は `replace: true`）
- 日付区切りは `syncDayDividers()` が投稿の並びから動的に生成する。区切り直前の下線は CSS (`:has(+ .timeline-day-divider)`) で消す
- 入力欄の textarea は `.highlight-field`（`.highlight-backdrop` + textarea）で包む（#タグのハイライト）。プログラムから value を変えたら `syncHighlight()` を呼ぶ
- タグで絞り込み中は入力欄の先頭にそのタグを自動で入れる（`applyAutoTag()`）。手つかずなら解除時に外し、下書きにも残さない
- リンクのタイトル（`link`）は投稿・編集した時に1回だけ `attachLinkPreview()` で取って保存する。表示のたびに外へ通信しない（画像も出さない）
- `api/ogp.js` は誰でも呼べるので、内部ネットワーク宛ての拒否・時間・サイズ・リダイレクト回数の制限を外さない
- ポスト・コメントを変えたら `updatedAt` も更新する（作成・本文の編集・気分の変更）。同期で新しい方を選ぶのに使う
- 削除したら `recordDeletion(id)` を呼ぶ。消した ID は次に送れたら捨てる（中身は残さない）
- 読み込み・同期は `mergeTweets(incoming, deletedIds)` で混ぜる。項目ごとに `updatedAt` が新しい方を採用し、負けた方の文は `history` に残す。こちらで消して未送信のものは戻さない
- 同期の QR は1枚 200 バイト・誤り訂正 L（`SYNC_CHUNK_BYTES` / `SYNC_QR_ECC`）。増やすとカメラで読めなくなる（ぼけ・傾き・縮小を混ぜた試験で確認済み）
- 編集は詳細画面からだけ。上書きせず、前の版を `history` に残す（過去の思考を消さないため）
- ユーザーが入力した文字列は `escapeHtml()` を通す。ID は onclick 属性に埋め込むので、外から来るデータは `normalizeTweets()` を通す（`isValidId` で弾く）
- 保存キー（`data.js` の `DB_NAME` / `STORE_NAME` / `STORAGE_KEY`）は変えない。変えると既存ユーザーのデータが読めなくなる。形式を変えるときは `normalizeTweets()` で旧形式から移行する
- 文言は `i18n.js` の `I18N`（ja / en）に置く。HTML に直接書かない
- ファイルを更新しても、バージョン番号やクエリ文字列（`?v=`）を上げる必要はない（Service Worker はネットワーク優先で、HTTP キャッシュも再検証する）
- ファイルを追加・削除・リネームした場合は `sw.js` の `ASSETS` リストも必ず同期する
- フレームワークやビルドツールは入れない

## 動作確認
`python3 -m http.server 5173` で `http://localhost:5173` を開く（この方法では `api/ogp` は動かないので、リンクカードは出ない）。
