import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Bunny, Logo, type Mood } from './components/Bunny';
import { Icon } from './components/Icon';
import { Composer } from './components/Composer';
import { Feed } from './components/Feed';
import { ServerView } from './components/ServerView';
import { boot, copyText, joinInvite, leaveBoard, startBoard, toast, useNow, useSession, useStore, useTheme, useToasts } from './store';
import type { Session, State } from './lib/net';
import { takeShare, type Shared } from './lib/share';

export default function App() {
  const { session, ready, error } = useStore();
  const s = useSession(session);
  const [theme, toggleTheme] = useTheme();
  const [serverOpen, setServerOpen] = useState(false);
  const [flash, setFlash] = useState<Mood | null>(null);
  const toasts = useToasts();
  const [dragging, setDragging] = useState(false);

  useEffect(() => { void boot(); }, []);

  // something shared from another Android app waits here until the board is connected
  const [shared, setShared] = useState<Shared | null>(null);
  useEffect(() => { void takeShare().then((x) => { if (x) { setShared(x); toast('Got your share. Sending as soon as you are connected.'); } }); }, []);
  useEffect(() => {
    if (!shared || !session || s?.phase !== 'connected') return;
    if (shared.text) void session.sendText(shared.text);
    shared.files.forEach((f) => void session.sendFile(f));
    setShared(null);
  }, [shared, session, s?.phase]);

  const bump = (m: Mood) => { setFlash(m); setTimeout(() => setFlash(null), 1500); };
  // the bunny celebrates anything that arrives
  const lastItem = s?.items[0]?.id;
  const seen = useRef<string | undefined>(undefined);
  useEffect(() => { if (lastItem && lastItem !== seen.current && s && !s.items[0].mine) bump('happy'); seen.current = lastItem; }, [lastItem, s]);

  const baseMood: Mood = !s ? 'idle' : s.phase === 'waiting' ? 'sleep' : s.phase === 'joining' ? 'think' : s.phase === 'ended' ? 'oops' : 'idle';
  const mood = flash ?? baseMood;

  // drag & drop anywhere once connected
  useEffect(() => {
    if (!session || s?.phase !== 'connected') return;
    let depth = 0;
    const on = (e: DragEvent) => { e.preventDefault(); };
    const enter = (e: DragEvent) => { e.preventDefault(); depth++; setDragging(true); };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const drop = (e: DragEvent) => {
      e.preventDefault(); depth = 0; setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) { files.forEach((f) => void session.sendFile(f)); bump('happy'); return; }
      const t = e.dataTransfer?.getData('text/plain'); if (t) { void session.sendText(t); bump('happy'); }
    };
    window.addEventListener('dragover', on); window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', on); window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop); };
  }, [session, s?.phase]);

  return (
    <div className="app">
      <header className="top">
        <Logo />
        <div className="right">
          {s?.phase === 'connected' && <button className="btn sm" onClick={() => setServerOpen(true)}><Icon name="eye" />Server's view</button>}
          <button className="btn icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        </div>
      </header>

      <main>
        {!ready && <div className="stage"><Bunny mood="think" size={150} /><p className="muted">Waking up Hop…</p></div>}
        {ready && !session && <Landing error={error} />}
        {ready && session && s && s.phase === 'waiting' && <Waiting s={s} mood={mood} />}
        {ready && session && s && s.phase === 'joining' && <Joining s={s} mood={mood} />}
        {ready && session && s && s.phase === 'connected' && <Board s={s} session={session} mood={mood} bump={bump} />}
        {ready && session && s && s.phase === 'ended' && <Ended s={s} mood={mood} />}
      </main>

      <footer className="foot">
        <nav className="foot-links" aria-label="Guides"><a href="/how-it-works">How it works</a><a href="/faq">FAQ</a><a href="/copy-text-from-phone-to-laptop">Copy text phone to laptop</a><a href="/send-photos-from-phone-to-pc">Send photos phone to PC</a></nav>
        <div><b>End-to-end encrypted.</b> The key lives in the link you scan and never reaches the server.</div>
        <div>Free and open source. Built by <a href="https://storm-bureau-portfolio.vercel.app/">Aiza Ali</a> · <a href="https://github.com/blacksinisterx/hopboard">GitHub</a></div>
      </footer>

      {session && s?.phase !== 'ended' && s && s.requests[0] && <RequestDialog s={s} session={session} />}
      {serverOpen && session && s && <ServerView s={s} session={session} onClose={() => setServerOpen(false)} />}
      {dragging && <div className="drop"><div>Drop it. It will hop.</div></div>}
      <div className="toasts" role="status">{toasts.map((t) => <div className="toast" key={t.id}>{t.text}</div>)}</div>
    </div>
  );
}

/* ───────────────────────── landing ───────────────────────── */

function Landing({ error }: { error?: string }) {
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { await startBoard(); } catch (e) { toast(String((e as Error).message)); setBusy(false); } };
  const join = async () => { try { await joinInvite(invite); } catch (e) { toast((e as Error).message); } };
  return (
    <div style={{ display: 'grid', gap: 34 }}>
      <section className="hero">
        <div>
          <h1>Hop your clipboard between <em>any</em> two devices.</h1>
          <p className="lead">Scan a QR code and your phone and laptop share a clipboard, photos and files. No account, no app, and the server only ever sees gibberish.</p>
          <div className="cta">
            <button className="btn big yellow" onClick={go} disabled={busy}><Icon name="bolt" />Start a board</button>
            <span className="muted">Takes about 5 seconds.</span>
          </div>
          {error && <p className="note">{error}</p>}
          <details style={{ marginTop: 18 }}>
            <summary className="muted" style={{ cursor: 'pointer', fontWeight: 800 }}>I already have an invite link</summary>
            <div className="join-box" style={{ marginTop: 10 }}>
              <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="Paste the invite link" aria-label="Invite link" />
              <button className="btn sm mint" onClick={join}>Join</button>
            </div>
          </details>
        </div>
        <div className="hero-art">
          <div className="blob" />
          <Bunny mood="idle" size={290} />
          <span className="float a">no account</span><span className="float b">end-to-end</span><span className="float c">photos too</span>
        </div>
      </section>

      <section className="steps" aria-label="How it works">
        <div className="step"><b>1</b><h2>Scan</h2><p>Open Hopboard on one device. Point the other one's camera at the QR code.</p></div>
        <div className="step"><b>2</b><h2>Allow</h2><p>Check the matching emoji on both screens and tap Let it in. Nobody sneaks in with a stolen QR.</p></div>
        <div className="step"><b>3</b><h2>Hop</h2><p>Type, paste or drop anything. It lands on the other device in a blink.</p></div>
      </section>

      <div className="trust">
        <span className="pill"><Icon name="lock" />Sealed before it leaves your device</span>
        <span className="pill"><Icon name="shield" />Server stores nothing</span>
        <span className="pill"><Icon name="image" />Pictures yes, video no</span>
      </div>
    </div>
  );
}

/* ───────────────────────── host waiting ───────────────────────── */

function Waiting({ s, mood }: { s: State; mood: Mood }) {
  const [qr, setQr] = useState('');
  const now = useNow(1000);
  const left = s.inviteExpiresAt ? s.inviteExpiresAt - now : Infinity;
  const expired = left <= 0;
  useEffect(() => {
    if (!s.inviteUrl) return;
    void QRCode.toDataURL(s.inviteUrl, { errorCorrectionLevel: 'M', margin: 1, width: 560, color: { dark: '#2B1B4E', light: '#FFFFFF' } }).then(setQr);
  }, [s.inviteUrl]);
  const mm = Math.max(0, Math.floor(left / 60000)); const ss = String(Math.max(0, Math.floor((left % 60000) / 1000))).padStart(2, '0');
  return (
    <section className="card pair">
      <div className="qr-card">
        <span className="tag qr-tag">scan me</span>
        {qr && !expired ? <img src={qr} alt="QR code to join this board" data-testid="qr" /> : <div style={{ width: 280, height: 280, display: 'grid', placeItems: 'center' }}>{expired ? 'This code expired.' : 'Drawing…'}</div>}
        <div className="timer">{expired ? 'Make a fresh one below' : Number.isFinite(left) ? `Good for ${mm}:${ss}` : ''}</div>
      </div>
      <div>
        <h2>Point your other device's camera here</h2>
        <ol className="list">
          <li><span>Open the camera on your phone and aim it at the code.</span></li>
          <li><span>Tap the link that pops up.</span></li>
          <li><span>Come back here and tap <b>Let it in</b>.</span></li>
        </ol>
        <div className="linkbox"><code data-testid="invite">{s.inviteUrl}</code>
          <button className="btn sm sky" onClick={() => copyText(s.inviteUrl ?? '')}><Icon name="copy" />Copy link</button></div>
        <div className="cta" style={{ marginTop: 16 }}>
          <button className="btn sm" onClick={() => void startBoard()}><Icon name="refresh" />New code</button>
          <span className={`pill ${s.wsUp ? 'ok' : 'warn'}`}><i />{s.wsUp ? 'Waiting for your other device' : 'Connecting…'}</span>
        </div>
      </div>
      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center' }}><Bunny mood={mood} size={110} /></div>
    </section>
  );
}

/* ───────────────────────── guest joining ───────────────────────── */

function Joining({ s, mood }: { s: State; mood: Mood }) {
  return (
    <section className="card stage" data-testid="joining">
      <Bunny mood={mood} size={170} />
      <h2>Knocking on the door…</h2>
      <p className="muted" style={{ margin: 0, maxWidth: '30em' }}>Your other device is asking whether to let you in. These emoji should match the ones on its screen.</p>
      <div className="sas" aria-label="Safety emoji">{s.sas.map((e, i) => <span key={i}>{e}</span>)}</div>
      <span className={`pill ${s.wsUp ? 'ok' : 'warn'}`}><i />{s.wsUp ? 'Connected to the relay' : 'Connecting…'}</span>
      <button className="btn sm" onClick={() => void leaveBoard()}>Cancel</button>
    </section>
  );
}

function RequestDialog({ s, session }: { s: State; session: Session }) {
  const r = s.requests[0];
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label="A device wants to join">
      <div className="card dialog">
        <Bunny mood="think" size={110} />
        <h2>{r.name} wants to hop in</h2>
        <p className="muted" style={{ margin: 0 }}>Do these emoji match the ones on that device? If not, say no.</p>
        <div className="sas" data-testid="request-sas">{r.sas.map((e, i) => <span key={i}>{e}</span>)}</div>
        <div className="row">
          <button className="btn yellow big" data-testid="allow" onClick={() => session.allow(r.id)}><Icon name="check" />Let it in</button>
          <button className="btn" onClick={() => session.deny(r.id)}>No thanks</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── connected ───────────────────────── */

function Board({ s, session, mood, bump }: { s: State; session: Session; mood: Mood; bump: (m: Mood) => void }) {
  const direct = s.link === 'p2p' && !s.forceRelay;
  return (
    <div className="board">
      <section className="card bar">
        <div className="who">
          <Bunny mood={mood} size={84} />
          <div><h2 data-testid="peer">{s.peer?.name ?? 'Connected'}</h2>
            <small>{s.peerAway ? 'Looks asleep right now' : direct ? 'Straight from device to device' : 'Going through the sealed relay'}</small></div>
        </div>
        <div className="acts">
          <span className={`pill ${s.peerAway ? 'warn' : 'ok'}`} data-testid="link"><i />{s.peerAway ? 'Away' : direct ? <>Direct <Icon name="bolt" /></> : <>Relay <Icon name="relay" /></>}</span>
          <button className="btn sm" onClick={() => { if (confirm('Forget this board on this device?')) void leaveBoard(); }}>Leave</button>
        </div>
      </section>
      <Composer session={session} mood={bump} />
      <Feed items={s.items} session={session} />
    </div>
  );
}

function Ended({ s, mood }: { s: State; mood: Mood }) {
  return (
    <section className="card stage">
      <Bunny mood={mood} size={150} />
      <h2>This board has closed</h2>
      <p className="muted" style={{ margin: 0, maxWidth: '30em' }}>{s.endReason}</p>
      <button className="btn yellow" onClick={() => void leaveBoard()}>Back to start</button>
    </section>
  );
}
