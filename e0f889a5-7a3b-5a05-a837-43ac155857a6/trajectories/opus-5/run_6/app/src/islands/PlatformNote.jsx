import { useEffect, useState } from 'preact/hooks';

// The primary control adapts to the reader's platform but is never disabled and
// never hidden: fetching an installer on a work laptop for a machine at home is
// an ordinary thing to do.
export default function PlatformNote() {
  const [mac, setMac] = useState(true);

  useEffect(() => {
    const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    setMac(/mac/i.test(platform));
  }, []);

  if (mac) return null;
  return (
    <p class="hint" style="margin-top:calc(var(--unit) * 3)" data-test="platform-note">
      Arranger is a macOS application. The download works here all the same.
    </p>
  );
}
