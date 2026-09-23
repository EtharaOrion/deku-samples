/**
 * The four panels the record needs beside its six figures: the scheme status,
 * the contract projection, the energy pair and the replay result.
 */

import type { JSX } from 'preact';
import { CarbonFigure, RecycledContent } from '../../components/figures';
import { Banner, Empty, Loading } from '../../components/status';
import { grams, percent, words } from '../../format';
import { useFetch } from './hooks';
import type { CarbonView, CertificateView, ProjectionView, ReplayView, SiteView } from './artefacts';
import type { LotView } from './views';

/** Not dismissible: every surface that can issue anything says where the site stands. */
export function SchemeBanner(): JSX.Element {
  const sites = useFetch<SiteView[]>('/sites');
  const certificates = useFetch<CertificateView[]>('/certificates');
  if (sites.loading) return <Loading what="the scheme status" />;
  const rows = sites.data ?? [];
  if (rows.length === 0) return <Empty sentence="No site is on the register." />;
  const scheme = certificates.data?.[0]?.scheme;
  return (
    <Banner word="Scheme status">
      {rows.map((site) => (
        <span key={site.reference} class="scheme-line">
          {`${site.reference} is ${words(site.certification_state)}${scheme ? ` under ${scheme}` : ''}. `}
          {site.certification_state === 'suspended'
            ? 'Issuing stops for this site and grade while the suspension stands. '
            : ''}
        </span>
      ))}
      This statement carries no control that closes it.
    </Banner>
  );
}

export function ContractPanel({ contract }: { contract: string }): JSX.Element {
  const projection = useFetch<ProjectionView>(`/contracts/${contract}/projection`);
  const answer = projection.data;
  const allocated = answer?.allocations[0]?.lot ?? null;
  const lot = useFetch<LotView>(allocated === null ? null : `/lots/${allocated}`);

  if (projection.loading) return <Loading what={`the projection for ${contract}`} />;
  if (projection.error || !answer) {
    return <Empty sentence={`The projection for ${contract} could not be read: ${projection.error ?? 'no answer'}.`} />;
  }

  return (
    <article class="card card--quiet">
      <h3 class="mono">{answer.contract}</h3>
      <dl class="pair-list">
        <div>
          <dt>State</dt>
          <dd>
            {answer.state === 'unreachable'
              ? `unreachable, since ${answer.unreachable_since ?? 'the allocation that made it so'}`
              : 'on track'}
          </dd>
        </div>
        <div>
          <dt>Supplying site</dt>
          <dd class="mono">
            {answer.site}
            {answer.planned_site_flag ? <span class="word-beside">planned site</span> : null}
          </dd>
        </div>
        <div>
          <dt>Delivered</dt>
          <dd class="mono">{`${answer.delivered_kg} kg of ${answer.committed_kg} kg committed`}</dd>
        </div>
        <div>
          <dt>Running content</dt>
          <dd>
            {answer.delivered_kg > 0 && lot.data ? (
              <RecycledContent content_bp={answer.running_content_bp} claim_type={lot.data.claim_type} />
            ) : (
              'No volume has been delivered against this contract, so there is no running content to state.'
            )}
          </dd>
        </div>
        <div>
          <dt>Floor</dt>
          <dd class="mono">{percent(answer.floor_bp)}</dd>
        </div>
        <div>
          <dt>Required of the remaining volume</dt>
          <dd class="mono">{percent(answer.required_remaining_bp)}</dd>
        </div>
        <div>
          <dt>Shortfall consequence</dt>
          <dd>{answer.shortfall_consequence}</dd>
        </div>
      </dl>
      {answer.planned_site_flag ? (
        <Banner word="Planned site">
          {`${answer.site} carries a confidence of planned, so this contract rests on capacity that does not exist yet. This statement is not dismissible.`}
        </Banner>
      ) : null}
    </article>
  );
}

export function EnergyPanel({ lot }: { lot: string }): JSX.Element {
  const carbon = useFetch<CarbonView>(`/lots/${lot}/carbon`);
  if (carbon.loading) return <Loading what={`the carbon figure for ${lot}`} />;
  const answer = carbon.data;
  if (carbon.error || !answer) {
    return <Empty sentence={`The carbon figure for ${lot} could not be read: ${carbon.error ?? 'no answer'}.`} />;
  }
  const comparator = `${answer.comparator.material} from ${answer.comparator.dataset} ${answer.comparator.dataset_year} in ${answer.comparator.region}`;
  return (
    <article class="card card--quiet">
      <h3 class="mono">{answer.lot}</h3>
      <CarbonFigure
        value_mg_per_kg={answer.value_mg_per_kg}
        boundary={answer.boundary}
        method_version={answer.method_version}
        uncertainty_bp={answer.uncertainty_bp}
        comparator={comparator}
      />
      <div class="grid grid--pair">
        <div class="stat">
          <span class="label">Location-based</span>
          <CarbonFigure
            value_mg_per_kg={answer.energy_location_mg_per_kg}
            boundary={answer.boundary}
            method_version={answer.method_version}
            uncertainty_bp={answer.uncertainty_bp}
          />
        </div>
        <div class="stat">
          <span class="label">Market-based</span>
          <CarbonFigure
            value_mg_per_kg={answer.energy_market_mg_per_kg}
            boundary={answer.boundary}
            method_version={answer.method_version}
            uncertainty_bp={answer.uncertainty_bp}
          />
        </div>
      </div>
      <dl class="pair-list">
        <div>
          <dt>Metered consumption</dt>
          <dd class="mono">{`${answer.metered_kwh} kWh`}</dd>
        </div>
        <div>
          <dt>Retired against the period</dt>
          <dd class="mono">{`${answer.retired_kwh} kWh`}</dd>
        </div>
        <div>
          <dt>Unmatched consumption</dt>
          <dd class="mono">{`${answer.unmatched_kwh} kWh`}</dd>
        </div>
        <div>
          <dt>Primary data share</dt>
          <dd class="mono">
            {percent(answer.primary_share_bp)}
            <span class="word-beside">{answer.default_led ? 'default-led' : 'not default-led'}</span>
          </dd>
        </div>
      </dl>
      <div class="scroller">
        <table>
          <caption>
            {`Every line behind the figure, and the lines sum to it. Boundary ${words(answer.boundary)}, method version ${answer.method_version}, uncertainty ${percent(answer.uncertainty_bp)}.`}
          </caption>
          <thead>
            <tr>
              <th scope="col">Line</th>
              <th scope="col">Data quality</th>
              <th scope="col" class="num">Contribution, mg CO2e per kg</th>
            </tr>
          </thead>
          <tbody>
            {answer.breakdown.map((line) => (
              <tr key={line.line}>
                <td>{words(line.line)}</td>
                <td>{words(line.tag)}</td>
                <td class="num">{line.mg_per_kg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function ReplayPanel({ number }: { number: string }): JSX.Element {
  const replay = useFetch<ReplayView>(`/certificates/${number}/replay`);
  const certificate = useFetch<CertificateView>(`/certificates/${number}`);
  if (replay.loading || certificate.loading) return <Loading what={`the replay of ${number}`} />;
  const answer = replay.data;
  const issued = certificate.data;
  if (replay.error || !answer) {
    return <Empty sentence={`The replay of ${number} could not be read: ${replay.error ?? 'no answer'}.`} />;
  }
  const carbon = issued?.carbon ?? null;
  return (
    <article class="card card--quiet">
      <h3 class="mono">{answer.certificate}</h3>
      <div class="grid grid--pair">
        <div class="stat">
          <span class="label">Issued</span>
          {issued ? <RecycledContent content_bp={answer.issued} claim_type={issued.claim_type} /> : null}
          {carbon && answer.carbon_issued !== null ? (
            <CarbonFigure
              value_mg_per_kg={answer.carbon_issued}
              boundary={carbon.boundary}
              method_version={carbon.method_version}
              uncertainty_bp={carbon.uncertainty_bp}
            />
          ) : null}
        </div>
        <div class="stat">
          <span class="label">Recomputed</span>
          {issued ? <RecycledContent content_bp={answer.recomputed} claim_type={issued.claim_type} /> : null}
          {carbon && answer.carbon_recomputed !== null ? (
            <CarbonFigure
              value_mg_per_kg={answer.carbon_recomputed}
              boundary={carbon.boundary}
              method_version={carbon.method_version}
              uncertainty_bp={carbon.uncertainty_bp}
            />
          ) : null}
        </div>
      </div>
      <p>
        {`The recomputation ${answer.agrees ? 'agrees' : 'disagrees'} with the certificate as issued.`}
        {answer.differing_input !== null ? ` The input that moved is ${answer.differing_input}.` : ''}
        {answer.reproducible ? '' : ` This figure is not reproducible: ${answer.reason ?? 'an input is gone'}.`}
      </p>
      {issued?.lots[0] ? (
        <p class="quiet">{`Against lot ${issued.lots[0].reference} at ${grams(issued.lots[0].mass_g)}.`}</p>
      ) : null}
    </article>
  );
}
