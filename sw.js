'use strict';

const CACHE = 'academic-vocab-v2';
const SHELL = [
    '/',
    '/index.html',
    '/style.css',
    '/manifest.webmanifest',
    '/icons/icon.svg',
    '/js/data.js',
    '/js/grammar-data.js',
    '/js/auth.js',
    '/js/presence.js',
    '/js/pwa.js',
    '/js/app.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;
    if (url.pathname.startsWith('/api/')) return;

    event.respondWith(
        caches.match(request).then((cached) => {
            const network = fetch(request)
                .then((res) => {
                    if (res.ok && url.origin === self.location.origin) {
                        const clone = res.clone();
                        caches.open(CACHE).then((c) => c.put(request, clone));
                    }
                    return res;
                })
                .catch(() => cached);
            return cached || network;
        })
    );
});
