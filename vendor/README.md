# vendor

端末間の同期（QR で送る・受け取る）だけで使うライブラリ。CDN からは読まず、ここに置いたものを同期の画面を開いたときに読み込む（外部通信なし・オフラインでも動く）。手を加えずそのまま置いている。

| ファイル | 内容 | 版 | ライセンス |
|---|---|---|---|
| `qrcode.js` | QR を作る（[qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)） | 1.4.4 | MIT（ファイル冒頭に記載） |
| `jsQR.js` | カメラ映像から QR を読む（[jsQR](https://github.com/cozmo/jsQR)） | 1.4.0 | Apache-2.0（`jsQR.LICENSE`） |
