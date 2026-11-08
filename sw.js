/* ============================================================
   sw.js — service worker: app instalable y 100% offline.
   Estrategia: cache-first para el shell; los datos viven en
   IndexedDB, así que no hay peticiones de datos que cachear.
   Sube CACHE_VERSION al publicar cambios.
   ============================================================ */

const CACHE_VERSION = 'voto-seguro-v1.0.0';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/estilos.css',
  './js/app.js',
  './js/views.js',
  './js/store.js',
  './js/db.js',
  './js/chain.js',
  './js/crypto.js',
  './js/demo.js',
  './js/utils.js',
  './assets/logo.svg',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    })
  );
});
