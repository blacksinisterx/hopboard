import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Session, INVITE_RE, type State } from './lib/net';

/* ── which board this browser is on ── */
interface Store { session: Session | null; ready: boolean; error?: string }
let store: Store = { session: null, ready: false };
const subs = new Set<() => void>();
const emit = (p: Partial<Store>) => { store = { ...store, ...p }; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };

let booting: Promise<void> | null = null;
export function boot() {
  booting ??= Session.boot().then((session) => emit({ session, ready: true })).catch((e) => emit({ ready: true, error: String(e?.message ?? e) }));
  return booting;
}
export async function startBoard() { await store.session?.leave(); emit({ session: await Session.createHost(), error: undefined }); }
export async function joinInvite(text: string) {
  const m = text.match(/([A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{87})/);
  if (!m || !INVITE_RE.test('#' + m[1])) throw new Error('That does not look like a Hopboard invite.');
  await store.session?.leave();
  emit({ session: await Session.join('#' + m[1]), error: undefined });
}
export async function leaveBoard() { await store.session?.leave(); emit({ session: null }); }
export const useStore = () => useSyncExternalStore(subscribe, () => store);

const noop = () => () => undefined;
export function useSession(s: Session | null): State | null {
  return useSyncExternalStore(s ? s.subscribe : noop, s ? s.getState : () => null);
}

/* ── toasts ── */
interface Toast { id: number; text: string }
let toasts: Toast[] = [];
const tsubs = new Set<() => void>();
export function toast(text: string) {
  const t = { id: Date.now() + Math.random(), text };
  toasts = [...toasts, t].slice(-3);
  tsubs.forEach((f) => f());
  setTimeout(() => { toasts = toasts.filter((x) => x !== t); tsubs.forEach((f) => f()); }, 2200);
}
export const useToasts = () => useSyncExternalStore((f) => { tsubs.add(f); return () => tsubs.delete(f); }, () => toasts);

/* ── theme ── */
export function useTheme(): ['light' | 'dark', () => void] {
  const [t, setT] = useState<'light' | 'dark'>(() => (document.documentElement.dataset.theme as 'light' | 'dark') || 'light');
  const toggle = useCallback(() => {
    const n = t === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = n;
    try { localStorage.setItem('hopboard-theme', n); } catch { /* private mode */ }
    setT(n);
  }, [t]);
  return [t, toggle];
}

export function useNow(ms: number) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setN(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return n;
}

/* ── clipboard helpers ── */
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast('Copied!');
}
export async function copyImage(url: string) {
  try {
    const img = await createImageBitmap(await (await fetch(url)).blob());
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d')!.drawImage(img, 0, 0);
    const png = await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('encode'))), 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    toast('Picture copied!');
  } catch { toast('Could not copy the picture here. Use Save instead.'); }
}
/** Read whatever is on the clipboard: pictures first, then text. Needs a user gesture. */
export async function readClipboard(): Promise<{ files: File[]; text: string }> {
  const files: File[] = []; let text = '';
  try {
    for (const it of await navigator.clipboard.read()) {
      const img = it.types.find((t) => t.startsWith('image/'));
      if (img) files.push(new File([await it.getType(img)], `clipboard.${img.split('/')[1] || 'png'}`, { type: img }));
      else if (it.types.includes('text/plain')) text = await (await it.getType('text/plain')).text();
    }
  } catch { try { text = await navigator.clipboard.readText(); } catch { /* denied */ } }
  return { files, text };
}
