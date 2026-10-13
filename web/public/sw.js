// Minimal service worker. Its one job: catch the Android "Share to Hopboard" POST, park the shared
// text/files in a cache, and hand them to the page. No offline caching, nothing leaves the device.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/share') return;
  event.respondWith((async () => {
    try {
      const form = await event.request.formData();
      const id = String(Date.now());
      const cache = await caches.open('hopboard-share');
      const files = form.getAll('files').filter((f) => f instanceof File);
      const meta = { title: String(form.get('title') || ''), text: String(form.get('text') || ''), url: String(form.get('url') || ''), files: files.map((f) => ({ name: f.name, type: f.type })) };
      await cache.put(`/__share/${id}/meta`, new Response(JSON.stringify(meta)));
      for (let i = 0; i < files.length; i++) await cache.put(`/__share/${id}/f${i}`, new Response(files[i], { headers: { 'Content-Type': files[i].type || 'application/octet-stream' } }));
      return Response.redirect(`/?share=${id}`, 303);
    } catch {
      return Response.redirect('/', 303);
    }
  })());
});
