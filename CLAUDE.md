# botchitter

一人用のつぶやき PWA。ビルドなし・依存なしの素の HTML/CSS/JS で、サーバーは無い（データは端末内の IndexedDB だけ）。
データ構造は `app.js` 冒頭のコメントを参照。

## ルール
- 状態を変えたら `save()` → `refresh(tweetId)`。DOM を個別に書き換えない（`refresh` がタイムラインと詳細画面の両方を直す）
- 日付の表示文字列は保存しない。`createdAt` から `formatTimestamp()` で作る
- ユーザーが入力した文字列は `escapeHtml()` を通す。ID は onclick 属性に埋め込むので、外から来るデータは `normalizeTweets()` を通す（`isValidId` で弾く）
- 保存キー（`data.js` の `DB_NAME` / `STORE_NAME` / `STORAGE_KEY`）は変えない。変えると既存ユーザーのデータが読めなくなる。形式を変えるときは `normalizeTweets()` で旧形式から移行する
- 文言は `app.js` の `I18N`（ja / en）に置く。HTML に直接書かない
- ファイルを更新しても、バージョン番号やクエリ文字列（`?v=`）を上げる必要はない（Service Worker はネットワーク優先で、HTTP キャッシュも再検証する）
- フレームワークやビルドツールは入れない

## 動作確認
`python3 -m http.server 5173` で `http://localhost:5173` を開く。
