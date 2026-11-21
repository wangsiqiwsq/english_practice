/* 英语练习室 Service Worker —— 让装到桌面的 App 离线可用
   策略：页面导航走"网络优先"，保证一联网就能拿到新版本；
   静态资源走"缓存优先 + 后台更新"。 */
const CACHE = 'en-practice-v5';
const ASSETS = [
  './',
  './index.html',
  './listening.html',
  './interactive.html',
  './vocab.js',
  './vocab-ui.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms){
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 页面：网络优先。失败或超时才用缓存，避免"旧 HTML 配新脚本"的错位
  if (req.mode === 'navigate') {
    e.respondWith(
      Promise.race([fetch(req), timeout(4000)])
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // 静态资源：缓存优先，同时后台刷新
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200 && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

// 允许页面主动要求更新 / 清缓存
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  if (e.data === 'clearCache') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
