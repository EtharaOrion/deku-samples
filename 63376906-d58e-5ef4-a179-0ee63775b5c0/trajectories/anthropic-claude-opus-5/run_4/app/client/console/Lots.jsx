import { api } from '../api.js';
import { useAsync, Loading, Empty, StateWord, Icon, grams, words, ContentFigure } from '../ui.jsx';

export default function Lots({ session }) {
  const lots = useAsync(() => api('/lots'));
  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Lots</p>
        <h1 class="t-h3">The lot register</h1>
        <p class="t-big">The unit of work. Every lot carries exactly one claim type.</p>
      </div>
      {lots.loading ? <Loading what="the lot register" /> : null}
      {lots.data && lots.data.length === 0 ? <Empty>No lot has been produced.</Empty> : null}
      {lots.data && lots.data.length > 0 ? (
        <div class="table-scroll">
          <table>
            <caption>{lots.data.length} lots.</caption>
            <thead>
              <tr>
                <th scope="col">Lot</th>
                <th scope="col">Site</th>
                <th scope="col" class="num">Mass</th>
                <th scope="col">Disposition</th>
                <th scope="col">Claim</th>
                <th scope="col">Held by</th>
                <th scope="col">Flags</th>
              </tr>
            </thead>
            <tbody>
              {lots.data.map((l) => (
                <tr key={l.reference}>
                  <th scope="row" class="mono">
                    <a href={`/console/lots/${l.reference}`}>{l.reference}</a>
                  </th>
                  <td class="mono">{(l.sites_named || [l.site]).join(', ')}</td>
                  <td class="num">{l.mass_g.toLocaleString('en-GB')}</td>
                  <td><StateWord word={words(l.disposition)} heavy={l.disposition !== 'released'} /></td>
                  <td><ContentFigure content_bp={l.content_bp} claim_type={l.claim_type} compact /></td>
                  <td>
                    {l.open_deviation_count ? <StateWord word="Deviation open" heavy /> : null}
                    {l.unreviewed_override_count ? <StateWord word="Override unreviewed" heavy /> : null}
                    {!l.open_deviation_count && !l.unreviewed_override_count ? (
                      <span class="t-small" style="color:var(--muted)">nothing</span>
                    ) : null}
                  </td>
                  <td>
                    {(l.flags || []).map((f) => (
                      <StateWord key={f} word={f} icon={<Icon name="flag" label="Flag" />} />
                    ))}
                    {(l.flags || []).length === 0 ? <span class="t-small" style="color:var(--muted)">none</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
