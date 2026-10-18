// Keeps the app openable when the venue Wi-Fi is down: a tablet that reloads offline
// (pull to refresh, the browser killed in the background) still gets the app, and its
// saved scores, from this cache. Pages always try the network first, so a new deploy
// reaches every online tablet on its next load. The API is never cached.

const CACHE = 'cendekiawan-app-v1'
const PAGE_TIMEOUT_MS = 4000

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    const res = await fetch('/', { cache: 'no-cache' })
    const html = await res.clone().text()
    await cache.put('/', res)
    // The hashed bundles index.html loads; the page that installed us fetched them
    // before we were in control.
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
    await cache.addAll(assets)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  if (req.mode === 'navigate') event.respondWith(page(req))
  else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/brand/')) event.respondWith(file(req))
})

/** Network first (fresh deploys), the cached app when the network fails or hangs. */
async function page(req) {
  const cache = await caches.open(CACHE)
  // A slow answer still refreshes the cache, so the next open gets the new build.
  const fresh = fetch(req).then(async (res) => {
    if (res.ok) await cache.put('/', res.clone())
    return res
  })
  fresh.catch(() => {})
  try {
    return await Promise.race([
      fresh,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), PAGE_TIMEOUT_MS)),
    ])
  } catch {
    return (await cache.match('/')) ?? Response.error()
  }
}

/** Hashed bundles never change; brand images change rarely, so refresh them in the background. */
async function file(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  if (hit && new URL(req.url).pathname.startsWith('/assets/')) return hit
  const fresh = fetch(req).then(async (res) => {
    if (res.ok) await cache.put(req, res.clone())
    return res
  })
  if (hit) {
    fresh.catch(() => {})
    return hit
  }
  return fresh
}
