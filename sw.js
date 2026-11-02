// Wattly service worker
// - La app (index.html) se pide primero a internet para recibir actualizaciones;
//   si no hay conexión o tarda más de 3 s, se usa la copia guardada.
// - Iconos, manifest y fuentes: se sirven de la copia guardada.
// - Las llamadas a la API de IA nunca se guardan.
const CACHE = 'wattly-v3'; // solo borra cachés antiguas de Wattly, nunca las de otras apps
const BASICOS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASICOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith('wattly-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function conTiempoLimite(promesa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promesa.then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'api.anthropic.com') return;

  // La propia app: primero red (actualizaciones), si no, copia guardada
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const red = fetch(req).then((resp) => {
        if (resp && resp.ok) cache.put('./index.html', resp.clone());
        return resp;
      });
      try {
        return await conTiempoLimite(red, 3000);
      } catch (err) {
        const guardada = await cache.match('./index.html');
        if (guardada) { red.catch(() => {}); return guardada; }
        return red;
      }
    })());
    return;
  }

  // Fuentes de Google y ficheros propios: copia guardada primero, se rellena al vuelo
  const esFuente = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const esPropio = url.origin === self.location.origin;
  if (esFuente || esPropio) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const guardada = await cache.match(req);
      if (guardada) return guardada;
      const resp = await fetch(req);
      if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
      return resp;
    })());
  }
});
