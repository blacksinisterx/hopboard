// Android "Share to Hopboard": the service worker parks the shared content in a cache and redirects to /?share=<id>.
// We pick it up here, delete it, and send it as soon as the board is connected.

export interface Shared { text: string; files: File[] }

export async function takeShare(): Promise<Shared | null> {
  const id = new URLSearchParams(location.search).get('share');
  if (!id || !/^\d+$/.test(id)) return null;
  history.replaceState(null, '', location.pathname); // drop ?share= so a refresh does not resend
  try {
    const cache = await caches.open('hopboard-share');
    const metaRes = await cache.match(`/__share/${id}/meta`);
    if (!metaRes) return null;
    const meta = await metaRes.json() as { title: string; text: string; url: string; files: { name: string; type: string }[] };
    const files: File[] = [];
    for (let i = 0; i < meta.files.length; i++) {
      const r = await cache.match(`/__share/${id}/f${i}`);
      if (r) files.push(new File([await r.blob()], meta.files[i].name, { type: meta.files[i].type }));
    }
    for (const k of await cache.keys()) if (k.url.includes(`/__share/${id}/`)) await cache.delete(k);
    const text = [meta.text, meta.url].filter(Boolean).join('\n').trim() || meta.title;
    return files.length || text ? { text: files.length ? '' : text, files } : null;
  } catch {
    return null;
  }
}
