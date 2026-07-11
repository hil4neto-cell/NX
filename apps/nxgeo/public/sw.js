const CACHE_NAME = 'nxgeo-shell-v1'
const scopeUrl = new URL('./', self.registration.scope)
const appShellUrl = scopeUrl.href
const appShell = [
  appShellUrl,
  new URL('manifest.webmanifest', scopeUrl).href,
  new URL('pwa/icon-192.png', scopeUrl).href,
  new URL('pwa/icon-512.png', scopeUrl).href,
  new URL('pwa/apple-touch-icon.png', scopeUrl).href,
]
const cacheableAsset = /\.(?:css|js|mjs|svg|png|webmanifest|woff2?)$/i

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(appShell))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith('nxgeo-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  )
})

async function cacheResponse(request, response) {
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(request, response.clone())
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)
  if (requestUrl.origin !== self.location.origin || !requestUrl.pathname.startsWith(scopeUrl.pathname)) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => cacheResponse(appShellUrl, response))
        .catch(() => caches.match(appShellUrl)),
    )
    return
  }

  if (cacheableAsset.test(requestUrl.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => cacheResponse(request, response))),
    )
  }
})
