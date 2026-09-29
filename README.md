# botchitter — 一人Twitter

今を観る。点を残す。いつか線になる。
思考のログを淡々と残し、過去の自分と対話する「一人Twitter」PWAアプリ。

## 特徴
- **一人Twitterモデル**: 投稿、引用リツイート（Quote Tweet）、コメント（返信スレッド）、削除のシンプルな操作体系。
- **引用による思考の引き上げ**: 過去のポストやコメントを引用すると、最新のメモとしてタイムライン最前線に浮上。
- **完全なパーマリンク & 詳細ビュー**: 各ポストが固有リンク（`#tweet-id`）を持ち、引用元やそのポストを引用した未来のポストとのつながりを可視化。
- **完全ローカル保存 & 任意のSNSシェア**: データはすべて端末内のみに静かに保存され、誰にも見られません。能動的にシェアボタンを押したときだけ、X（Twitter）などお好みのSNSへ投稿できます。
- **IndexedDB & LocalStorage ハイブリッド保存**: 大容量・非同期かつ堅牢な二重永続化。
- **PWA（Progressive Web App）完全対応**: iOS/Android のホーム画面に追加することで、URLバーなしの全画面ネイティブ感覚で起動。オフライン対応（Service Worker 搭載）。
- **徹底したパフォーマンス最適化**:
  - CSS オクルージョンカリング（`content-visibility: auto` + `contain-intrinsic-size`）による超高速スクロール（60fps/120fps維持）
  - DOM 差分更新（Incremental DOM update）による O(1) 投稿・削除・コメント反映
  - Forced Reflow（レイアウトスラッシング）撲滅（`requestAnimationFrame`）
  - ダークモード対応（OS連動＋ヘッダートグル）

## 構成
- `index.html`: セマンティックマークアップ
- `style.css`: スタイル、アニメーション、テーマ変数
- `data.js`: 定数および初期シードデータ
- `app.js`: アプリケーションロジック、IndexedDB連携、差分DOM更新、Web Share API
- `manifest.json`: Web App Manifest（スタンドアロンアプリ設定）
- `sw.js`: Service Worker（オフラインキャッシュ）
- `icon-*.png`, `apple-touch-icon.png`: PWAアプリアイコン
