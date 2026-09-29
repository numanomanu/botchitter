// =============================================================
// botchitter — Service Worker (オフライン動作)
// 常にネットワークを優先し（HTTP キャッシュも再検証）、オフライン時だけキャッシュを返す。
// そのためファイルを更新してもバージョン番号やクエリ文字列を上げる必要はない。
// =============================================================

const CACHE_NAME = "botchitter-cache-v6";
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "data.js",
  "app.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png"
];

// インストール時にコア資産をプリキャッシュ
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

// 古いキャッシュを即時クリア
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
      .then((networkResponse) => {
        if (networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
