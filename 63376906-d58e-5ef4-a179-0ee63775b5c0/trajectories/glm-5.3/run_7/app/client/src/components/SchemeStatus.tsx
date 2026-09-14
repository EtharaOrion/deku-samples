// The scheme status banner: not dismissible, names the window, links to the
// enumeration of affected certificates.
import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api';
import { Link } from '../router';

type Site = { reference: string; name: string; certification_state: string; suspension?: { from: string; to: string | null; reason: string | null } | null };

export function SchemeStatusBanner() {
  const [sites, setSites] = useState<Site[] | null>(null);
  useEffect(() => { api<Site[]>('/sites').then(setSites).catch(() => setSites([])); }, []);
  const suspended = (sites || []).filter((s) => s.certification_state === 'suspended');
  if (suspended.length === 0) return null;
  return (
    <div class="banner" role="alert">
      <span class="label">Scheme status</span>
      {suspended.map((s) => (
        <p key={s.reference}>
          The certification of <span class="mono">{s.reference}</span> is suspended from {s.suspension?.from}
          {s.suspension?.to ? ` to ${s.suspension.to}` : ' with no end recorded'}.
          {s.suspension?.reason ? ` Reason: ${s.suspension.reason}.` : ''}
          {' '}Issuing is stopped for that site and grade: <Link href="/console/certificates">the enumeration of affected certificates</Link>.
        </p>
      ))}
    </div>
  );
}
