import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

type Detector = { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> };

// Camera QR scanner: the native BarcodeDetector where it exists (Chrome/Android), jsQR otherwise. Frames never leave the page.
export function Scanner({ onText, onClose }: { onText: (t: string) => Promise<boolean>; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [msg, setMsg] = useState('Starting the camera…');

  useEffect(() => {
    let stop = false; let stream: MediaStream | undefined; let last = '';
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch { setMsg('Camera blocked. Allow it in the browser, or paste the invite link instead.'); return; }
      const v = video.current!; v.srcObject = stream; await v.play().catch(() => undefined);
      setMsg('Point it at the QR code on your other screen.');
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      const native = BD ? new BD({ formats: ['qr_code'] }) : null;
      const jsQR = native ? null : (await import('jsqr')).default;
      const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true })!;
      while (!stop) {
        await new Promise((r) => setTimeout(r, 200));
        if (v.readyState < 2 || !v.videoWidth) continue;
        let text = '';
        if (native) text = (await native.detect(v).catch(() => []))[0]?.rawValue ?? '';
        else if (jsQR) {
          cv.width = v.videoWidth; cv.height = v.videoHeight; cx.drawImage(v, 0, 0);
          text = jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height)?.data ?? '';
        }
        if (!text || text === last) continue;
        last = text;
        if (await onText(text)) return;
        setMsg('That QR is not a Hopboard code. Try the one on your other screen.');
      }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [onText]);

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label="Scan a Hopboard QR code">
      <div className="card dialog">
        <h2>Scan the QR code</h2>
        <video ref={video} className="scan-video" playsInline muted aria-label="Camera preview" />
        <p className="muted" role="status" style={{ margin: 0 }}>{msg}</p>
        <div className="row"><button className="btn sm" onClick={onClose}><Icon name="x" />Cancel</button></div>
      </div>
    </div>
  );
}
