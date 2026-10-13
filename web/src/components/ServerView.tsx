import type { Session, State } from '../lib/net';
import { prettySize } from '../lib/media';
import { Icon } from './Icon';

const hhmmss = (t: number) => new Date(t).toLocaleTimeString([], { hour12: false });
const KIND = { handshake: 'handshake', signal: 'connection setup', data: 'your stuff' } as const;

export function ServerView({ s, session, onClose }: { s: State; session: Session; onClose: () => void }) {
  const lastText = s.items.find((i) => i.kind === 'text');
  const lastData = s.frames.find((f) => f.kind === 'data');
  return (
    <aside className="drawer" aria-label="What the server sees" data-testid="server-view">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Server's view</h2>
        <button className="btn sm" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
      </div>
      <p className="muted" style={{ margin: 0 }}>Hopboard's server only passes sealed envelopes between your devices. It has no key, so this is everything it can ever see.</p>

      <div className="card" style={{ padding: 16 }}>
        <div className="muted">Bytes of your stuff that touched the server</div>
        <div className="big-num" data-testid="relayed-bytes" style={{ color: s.relayedBytes ? 'var(--orange)' : 'var(--mint)' }}>{prettySize(s.relayedBytes)}</div>
        <div className="muted">{s.link === 'p2p' && !s.forceRelay ? 'You are connected directly, so your stuff skips the server entirely.' : 'Relay mode: your stuff goes through the server, but sealed.'}</div>
      </div>

      <label className="switch"><input type="checkbox" checked={s.forceRelay} onChange={(e) => session.setForceRelay(e.target.checked)} />
        Force the relay path (to watch the sealed envelopes)</label>

      {lastText && (
        <div className="sees">
          <div className="you"><b>Your device shows</b><code>{lastText.text?.slice(0, 120)}</code></div>
          <div className="srv"><b>The server saw</b><code>{lastData ? lastData.preview : 'nothing. It went device to device.'}</code></div>
        </div>
      )}

      <h3 style={{ fontSize: 20 }}>Every frame it relayed</h3>
      <div className="frames">
        {s.frames.length === 0 && <div className="muted">Nothing yet.</div>}
        {s.frames.slice(0, 24).map((f, i) => (
          <div className="frame" key={f.at + '-' + i}>
            <header><span>{f.dir === 'out' ? '↑ sent' : '↓ received'}</span><span className="tag" style={{ background: f.kind === 'data' ? 'var(--pink)' : 'var(--soft)', color: f.kind === 'data' ? '#2B1B4E' : 'inherit' }}>{KIND[f.kind]}</span><span className="muted">{prettySize(f.bytes)} · {hhmmss(f.at)}</span></header>
            <code>{f.preview}</code>
          </div>
        ))}
      </div>
    </aside>
  );
}
