import { useEffect, useRef, useState } from 'react';
import type { Session } from '../lib/net';
import { readClipboard, toast } from '../store';
import { readText } from '../lib/ocr';
import { Icon } from './Icon';

export function Composer({ session, mood }: { session: Session; mood: (m: 'happy' | 'oops') => void }) {
  const [text, setText] = useState('');
  const [shrink, setShrink] = useState(true);
  const photo = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const scan = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<number | null>(null);

  const scanText = async (f: File) => {
    setReading(0);
    try {
      const t = await readText(f, (p) => setReading(p));
      if (t) { setText((cur) => (cur ? cur + '\n' : '') + t); toast('Text found. Check it, then press Send.'); mood('happy'); }
      else { toast('No readable text found in that photo.'); mood('oops'); }
    } catch { toast('Could not read that photo.'); mood('oops'); }
    setReading(null);
  };

  const sendFiles = (files: FileList | File[]) => {
    for (const f of Array.from(files)) void session.sendFile(f, { shrink });
    mood('happy');
  };
  const sendText = () => { if (!text.trim()) return; void session.sendText(text); setText(''); mood('happy'); };

  // paste anywhere: pictures always hop; plain text hops when you are not typing in a box
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      const typing = (e.target as HTMLElement)?.closest('textarea,input');
      if (files.length) { e.preventDefault(); sendFiles(files); return; }
      const t = e.clipboardData?.getData('text/plain');
      if (t && !typing) { e.preventDefault(); void session.sendText(t); mood('happy'); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  const pasteAndSend = async () => {
    const { files, text: t } = await readClipboard();
    if (files.length) sendFiles(files);
    else if (t.trim()) { void session.sendText(t); mood('happy'); }
    else { toast('Your clipboard looks empty, or the browser blocked it.'); mood('oops'); }
  };

  return (
    <section className="card composer" aria-label="Send something">
      <label className="sr" htmlFor="msg">Message to send</label>
      <textarea id="msg" value={text} placeholder="Type, paste, or drop something to hop…" onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendText(); } }} />
      <div className="row">
        <button className="btn yellow" onClick={sendText} disabled={!text.trim()}><Icon name="send" />Send</button>
        <button className="btn pink" onClick={pasteAndSend}><Icon name="clipboard" />Paste &amp; send</button>
        <button className="btn sky" onClick={() => photo.current?.click()}><Icon name="camera" />Photo</button>
        <button className="btn mint" onClick={() => file.current?.click()}><Icon name="file" />File</button>
        <button className="btn grape" onClick={() => scan.current?.click()} disabled={reading !== null} data-testid="scan-text"
          title="Photograph a page or screen. The text is read on this device, nothing is uploaded."><Icon name="eye" />{reading !== null ? `Reading… ${Math.round(reading * 100)}%` : 'Scan text'}</button>
        <span className="grow" />
        <label className="switch" style={{ fontSize: 14 }} title="Resize big photos on your device before sending. Untick to send the original.">
          <input type="checkbox" checked={shrink} onChange={(e) => setShrink(e.target.checked)} />Shrink big photos</label>
      </div>
      <input ref={photo} data-testid="photo-input" type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) sendFiles(e.target.files); e.target.value = ''; }} />
      <input ref={scan} data-testid="scan-input" type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void scanText(f); e.target.value = ''; }} />
      <input ref={file} data-testid="file-input" type="file" multiple hidden onChange={(e) => { if (e.target.files) sendFiles(e.target.files); e.target.value = ''; }} />
      <div className="muted hint" style={{ fontSize: 13 }}>Pictures and files are welcome. Video is not allowed. Ctrl/Cmd + Enter sends.</div>
    </section>
  );
}
