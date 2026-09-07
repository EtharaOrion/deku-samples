import { useEffect, useState } from 'preact/hooks';

// A reader who is not on macOS still gets a working control and a line saying
// what the application is, because fetching an installer on a work laptop for a
// machine at home is an ordinary thing to do.
export default function PlatformNote() {
  const [mac, setMac] = useState(true);

  useEffect(() => {
    const platform = String(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '');
    setMac(/mac/i.test(platform));
  }, []);

  if (mac) return null;
  return <p class="platform-note">Arranger is a macOS application.</p>;
}
