import { useEffect, useState } from 'react';

const INTRO_KEY = 'brightloop-intro-seen-v1';

export default function BrandedIntro() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    try { if (window.localStorage.getItem(INTRO_KEY)) return undefined; } catch { /* Play once for this visit if storage is unavailable. */ }
    let timer;
    const frame = window.requestAnimationFrame(() => {
      try { window.localStorage.setItem(INTRO_KEY, '1'); } catch { /* Intro still works when storage is blocked. */ }
      setVisible(true);
      timer = window.setTimeout(() => setVisible(false), 1650);
    });
    return () => { window.cancelAnimationFrame(frame); if (timer) window.clearTimeout(timer); };
  }, []);

  if (!visible) return null;
  return <div className="brand-intro" aria-hidden="true"><div className="intro-mark"><span>B</span></div><p>BRIGHTLOOP</p></div>;
}
