// =============================================================
// botchitter — Service Worker (オフライン動作 & 高速起動キャッシュ)
// =============================================================

const CACHE_NAME = "botchitter-cache-v4";
const ASSETS = [
  "./",
  "index.html",
  "style.css?v=2.3",
  "data.js?v=2.3",
  "app.js?v=2.3",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png"
];

// インストール時にコア資産をプリキャッシュ
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// 古いキャッシュを即時クリア
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// フェッチ処理（Network-First: 最新のコードを優先取得しつつオフライン時はキャッシュ）
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
