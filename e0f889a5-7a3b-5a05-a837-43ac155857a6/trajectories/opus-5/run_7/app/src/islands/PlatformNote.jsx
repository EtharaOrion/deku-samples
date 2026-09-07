import { useEffect, useState } from 'preact/hooks';

/**
 * A reader who is not on macOS still gets a working control and a line saying so.
 * The control itself is never disabled and never hidden.
 */
export default function PlatformNote() {
  const [mac, setMac] = useState(true);

  useEffect(() => {
    const p = `${navigator.userAgentData?.platform || navigator.platform || ''} ${navigator.userAgent || ''}`;
    setMac(/mac/i.test(p));
  }, []);

  if (mac) return null;
  return (
    <p class="small muted" style="margin-top:calc(var(--unit)*3)">
      Arranger is a macOS application.
    </p>
  );
}
