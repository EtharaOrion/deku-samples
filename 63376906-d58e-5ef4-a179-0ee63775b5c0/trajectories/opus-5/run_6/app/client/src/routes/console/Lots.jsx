import { api } from '../../lib/api.js';
import { Link } from '../../lib/router.jsx';
import {
  Loading, Empty, StateWord, Content, useAsync, formatInt,
} from '../../components/common.jsx';

export default function Lots() {
  const lots = useAsync(() => api.get('/lots'), []);
  return (
    <div className="page section" style={{ paddingTop: '2rem' }}>
      <h1 className="t-h3">Lots</h1>
      <p style={{ marginTop: '0.75rem' }}>
        Every lot names its site, its disposition and its claim. A percentage never appears without
        its claim type beside it.
      </p>

      {lots.loading ? <Loading what="the lot register" /> : null}
      {lots.error ? <Empty>The lot register could not be read.</Empty> : null}
      {lots.data && lots.data.length === 0 ? <Empty>No lots have been produced.</Empty> : null}

      {lots.data && lots.data.length ? (
        <div className="stack" style={{ marginTop: '2rem' }}>
          {lots.data.map((l) => (
            <article className="card" key={l.reference}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <Link href={`/console/lots/${l.reference}`} className="ref t-body">{l.reference}</Link>
                <StateWord quiet>{l.disposition}</StateWord>
                {l.open_deviation ? <StateWord icon="warning">Open deviation</StateWord> : null}
                {l.unreviewed_override_count ? <StateWord icon="warning">Unreviewed override</StateWord> : null}
                {l.flags.includes('lapsed_calibration') ? <StateWord icon="warning">Lapsed calibration</StateWord> : null}
                {l.flags.includes('non_claimable') ? <StateWord icon="flag">Non-claimable input upstream</StateWord> : null}
              </div>
              <dl className="dl" style={{ marginTop: '0.75rem' }}>
                <dt>Site</dt><dd className="mono">{l.site}</dd>
                <dt>Grade</dt><dd className="mono">{l.grade}</dd>
                <dt>Mass</dt><dd className="mono">{formatInt(l.mass_g)} g</dd>
                <dt>Claim</dt><dd><Content contentBp={l.content_bp} claimType={l.claim_type} /></dd>
              </dl>
              <p className="t-small" style={{ marginTop: '0.5rem' }}>
                <Link href={`/console/lots/${l.reference}/genealogy`}>Genealogy</Link>
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
