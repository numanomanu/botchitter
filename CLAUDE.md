# botchitter

一人用のつぶやき PWA。ビルドなし・依存なしの素の HTML/CSS/JS。データは端末内の IndexedDB だけに置く。
サーバー側は、リンクのタイトルを取る `api/ogp.js`（Vercel Function、CommonJS）だけ。
データ構造は `app.js` 冒頭のコメントを参照。

## ルール
- 状態を変えたら `save()` → `refresh(tweetId)`。DOM を個別に書き換えない（`refresh` がタイムラインと詳細画面の両方を直す）
- 日付の表示文字列は保存しない。`createdAt` から `formatTimestamp()` で作る
- タグは保存しない。本文の `#xxx` から `textTokens()` で都度読み取る（URL も同じ関数で切り出す）
- 画面と絞り込みは URL の # 以降で決まる（`parseRoute()` / `navigate()`）。`#tweet-<id>` 詳細、`#archive` 振り返り（草）、それ以外はタイムラインで `tag-<tag>`・`month-<YYYY-MM>` を & でつなぐ。hash を直接組み立てず `navigate()` を使う
- 入力欄の textarea は `.highlight-field`（`.highlight-backdrop` + textarea）で包む（#タグのハイライト）。プログラムから value を変えたら `syncHighlight()` を呼ぶ
- タグで絞り込み中は入力欄の先頭にそのタグを自動で入れる（`applyAutoTag()`）。手つかずなら解除時に外し、下書きにも残さない
- リンクのタイトル（`link`）は投稿・編集した時に1回だけ `attachLinkPreview()` で取って保存する。表示のたびに外へ通信しない（画像も出さない）
- `api/ogp.js` は誰でも呼べるので、内部ネットワーク宛ての拒否・時間・サイズ・リダイレクト回数の制限を外さない
- 編集は詳細画面からだけ。上書きせず、前の版を `history` に残す（過去の思考を消さないため）
- ユーザーが入力した文字列は `escapeHtml()` を通す。ID は onclick 属性に埋め込むので、外から来るデータは `normalizeTweets()` を通す（`isValidId` で弾く）
- 保存キー（`data.js` の `DB_NAME` / `STORE_NAME` / `STORAGE_KEY`）は変えない。変えると既存ユーザーのデータが読めなくなる。形式を変えるときは `normalizeTweets()` で旧形式から移行する
- 文言は `app.js` の `I18N`（ja / en）に置く。HTML に直接書かない
- ファイルを更新しても、バージョン番号やクエリ文字列（`?v=`）を上げる必要はない（Service Worker はネットワーク優先で、HTTP キャッシュも再検証する）
- フレームワークやビルドツールは入れない

## 動作確認
`python3 -m http.server 5173` で `http://localhost:5173` を開く（この方法では `api/ogp` は動かないので、リンクカードは出ない）。
