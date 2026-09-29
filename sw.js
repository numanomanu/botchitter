// =============================================================
// botchitter — Service Worker (オフライン動作 & 高速起動キャッシュ)
// =============================================================

const CACHE_NAME = "botchitter-cache-v1";
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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 古いキャッシュをクリア
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// フェッチ処理（Stale-While-Revalidate: キャッシュから即時返しつつバックグラウンドで最新取得）
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse); // オフライン時はキャッシュ

      return cachedResponse || fetchPromise;
    })
  );
});
