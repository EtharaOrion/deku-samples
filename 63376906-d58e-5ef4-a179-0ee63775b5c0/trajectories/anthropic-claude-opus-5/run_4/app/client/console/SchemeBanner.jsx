import { api } from '../api.js';
import { useAsync } from '../ui.jsx';

/**
 * Where a site's certification is suspended, every surface that can issue
 * anything says so, names the effective window and links to the enumeration of
 * affected certificates. It is not dismissible.
 */
export default function SchemeBanner() {
  const sites = useAsync(async () => {
    const list = await api('/sites');
    return Promise.all(list.map((s) => api(`/sites/${s.reference}`)));
  });
  if (!sites.data) return null;
  const suspended = sites.data.filter((s) =>
    (s.certification_periods || []).some((p) => p.state === 'suspended' && !p.effective_to)
  );
  if (!suspended.length) return null;
  return (
    <>
      {suspended.map((s) => {
        const period = s.certification_periods.filter((p) => p.state === 'suspended' && !p.effective_to).pop();
        return (
          <div class="banner" role="alert" key={s.reference}>
            <p class="t-eyebrow">Certification suspended</p>
            <p>
              <strong>
                The certification for {s.name} ({s.reference}) is suspended from{' '}
                <span class="mono">{period.effective_from}</span>
                {period.effective_to ? <> to <span class="mono">{period.effective_to}</span></> : ', with no end date recorded'}.
              </strong>
            </p>
            <p>Issuing has stopped for this site. {period.reason || ''}</p>
            <p style="margin-bottom:0">
              <a href={`/console/sites/${s.reference}`}>
                Read the enumeration of certificates signed inside the window
              </a>
              . This notice cannot be dismissed.
            </p>
          </div>
        );
      })}
    </>
  );
}
