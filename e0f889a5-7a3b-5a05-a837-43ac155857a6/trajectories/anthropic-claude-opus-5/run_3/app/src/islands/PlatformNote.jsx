import { useEffect, useState } from 'preact/hooks';

/**
 * A reader who is not on macOS still gets a working control and a line saying
 * so, because fetching an installer on a work laptop for a machine at home is
 * an ordinary thing to do. The control itself is never disabled and never
 * hidden; only this line appears.
 */
export default function PlatformNote() {
  const [mac, setMac] = useState(true);

  useEffect(() => {
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    setMac(/mac/i.test(platform));
  }, []);

  if (mac) return null;
  return <p class="small muted platform-note">Arranger is a macOS application.</p>;
}
