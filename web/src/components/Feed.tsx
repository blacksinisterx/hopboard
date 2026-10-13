import { useState } from 'react';
import type { Item, Session } from '../lib/net';
import { isHttpUrl, prettySize } from '../lib/media';
import { copyImage, copyText, toast } from '../store';
import { readText } from '../lib/ocr';
import { Icon } from './Icon';
import { Bunny } from './Bunny';

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const OTP = /^\d{4,8}$/;

function Status({ i }: { i: Item }) {
  if (i.status === 'delivered') return <span title="Delivered" className="muted"><Icon name="checks" /></span>;
  if (i.status === 'sent' || i.status === 'done') return <span title="Sent" className="muted"><Icon name="check" /></span>;
  if (i.status === 'sending' || i.status === 'receiving') return <span className="muted">{Math.round(i.progress * 100)}%</span>;
  return null;
}

function Card({ i, session, onZoom }: { i: Item; session: Session; onZoom: (url: string) => void }) {
  const text = i.text?.trim() ?? '';
  const [ocr, setOcr] = useState<{ busy: boolean; pct: number; text?: string }>({ busy: false, pct: 0 });
  const read = async () => {
    setOcr({ busy: true, pct: 0 });
    try {
      const blob = await (await fetch(i.url!)).blob();
      const t = await readText(blob, (p) => setOcr((o) => ({ ...o, pct: p })));
      setOcr({ busy: false, pct: 1, text: t || '' });
      if (!t) toast('No readable text found in that picture.');
    } catch { setOcr({ busy: false, pct: 0 }); toast('Could not read that picture.'); }
  };
  const busy = i.status === 'sending' || i.status === 'receiving';
  return (
    <article className={`item ${i.kind} ${i.mine ? 'mine' : ''}`} data-testid="item">
      <div className="meta">
        <span>{i.mine ? 'You' : 'From your other device'}</span><span>·</span><span>{time(i.at)}</span><span className="sp" /><Status i={i} />
      </div>

      {i.kind === 'text' && (OTP.test(text)
        ? <div className="otp" aria-label={`Code ${text.split('').join(' ')}`}>{text}</div>
        : <div className="txt">{i.text}</div>)}

      {i.kind === 'image' && i.url && <img className="pic" src={i.url} alt={i.name ?? 'Picture'} onClick={() => onZoom(i.url!)} />}
      {i.kind === 'file' && (
        <div className="file-row"><div className="file-ico"><Icon name="file" /></div>
          <div><b>{i.name}</b><div className="muted">{prettySize(i.size ?? 0)}</div></div></div>
      )}
      {i.kind === 'image' && !i.url && <div className="muted">{i.name} · {prettySize(i.size ?? 0)}</div>}

      {ocr.text && (
        <div className="ocr" data-testid="ocr-result"><div className="txt">{ocr.text}</div>
          <button className="btn sm sky" onClick={() => copyText(ocr.text!)}><Icon name="copy" />Copy text</button></div>
      )}

      {busy && <div className="prog" role="progressbar" aria-valuenow={Math.round(i.progress * 100)}><i style={{ width: `${Math.max(4, i.progress * 100)}%` }} /></div>}
      {(i.status === 'rejected' || i.status === 'failed') && <div className="note">{i.note ?? 'That did not go through.'}</div>}

      <div className="acts">
        {i.kind === 'text' && <button className="btn sm sky" onClick={() => copyText(i.text ?? '')}><Icon name="copy" />{OTP.test(text) ? 'Copy code' : 'Copy'}</button>}
        {i.kind === 'text' && isHttpUrl(text) && <a className="btn sm mint" href={text} target="_blank" rel="noopener noreferrer"><Icon name="open" />Open link</a>}
        {i.kind === 'image' && i.url && <><button className="btn sm sky" onClick={() => copyImage(i.url!)}><Icon name="copy" />Copy picture</button>
          <a className="btn sm yellow" href={i.url} download={i.name}><Icon name="download" />Save</a>
          <button className="btn sm mint" onClick={read} disabled={ocr.busy} data-testid="read-text"><Icon name="eye" />{ocr.busy ? `Reading… ${Math.round(ocr.pct * 100)}%` : 'Read text'}</button></>}
        {i.kind === 'file' && i.url && <a className="btn sm yellow" href={i.url} download={i.name}><Icon name="download" />Save</a>}
        <button className="btn sm" onClick={() => session.remove(i.id)} aria-label="Remove from this screen"><Icon name="trash" /></button>
      </div>
    </article>
  );
}

export function Feed({ items, session }: { items: Item[]; session: Session }) {
  const [zoom, setZoom] = useState<string | null>(null);
  return (
    <section className="feed" aria-live="polite" aria-label="Things that hopped">
      {items.length === 0 && (
        <div className="empty"><Bunny mood="idle" size={120} /><h3>Nothing has hopped yet</h3><p>Type something, paste a picture, or drop a file above.</p></div>
      )}
      {items.map((i) => <Card key={i.id} i={i} session={session} onZoom={setZoom} />)}
      {zoom && (
        <div className="scrim lightbox" role="dialog" aria-label="Picture" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Full size" />
        </div>
      )}
    </section>
  );
}
