/**
 * The reconciliation view. Six figures rather than six verdicts, with the mass
 * balance residual first and largest. Nothing here is styled as passing.
 */

import type { JSX } from 'preact';
import { INBOUND_SOURCES } from '../../../shared/enums';
import { Empty, Loading } from '../../components/status';
import { grams, words } from '../../format';
import { useFetch } from './hooks';
import { ContractPanel, EnergyPanel, ReplayPanel, SchemeBanner } from './panels';
import type { CertificateView, ReconciliationView } from './artefacts';
import type { LotView } from './views';
import { counted, derivationLines } from './states';

interface ContractSummary {
  reference: string;
}

function Figure({
  label,
  value,
  lead,
}: {
  label: string;
  value: string;
  lead?: boolean;
}): JSX.Element {
  return (
    <div class={lead ? 'stat stat--lead' : 'stat'}>
      <span class="label">{label}</span>
      <span class="stat__value mono">{value}</span>
    </div>
  );
}

function IntegrationAges({ ages }: { ages: Record<string, number | null> }): JSX.Element {
  return (
    <div class="scroller">
      <table>
        <caption>
          The age of the most recent record from each inbound source. A source that has never sent
          reads as never rather than as nothing at all.
        </caption>
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col" class="num">Age of the most recent record</th>
          </tr>
        </thead>
        <tbody>
          {INBOUND_SOURCES.map((source) => {
            const age_hours = ages[source];
            return (
              <tr key={source}>
                <td>{words(source)}</td>
                <td class="num">
                  {age_hours === null || age_hours === undefined
                    ? 'never'
                    : counted(age_hours, 'hour', 'hours')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ReconciliationScreen(): JSX.Element {
  const reconciliation = useFetch<ReconciliationView>('/reconciliation');
  const contracts = useFetch<ContractSummary[]>('/contracts');
  const lots = useFetch<LotView[]>('/lots');
  const certificates = useFetch<CertificateView[]>('/certificates');
  const answer = reconciliation.data;
  const energyLot = lots.data?.[0]?.reference ?? null;
  const replayed = certificates.data?.find((row) => row.state === 'issued') ?? certificates.data?.[0];

  return (
    <section class="section">
      <span class="eyebrow">Console</span>
      <h1 class="console-title">Reconciliation</h1>
      <p>
        Six figures, not six verdicts. These are numbers a working plant expects to be non-zero, and
        none of them is a badge to be cleared: a residual of nothing would mean the weighbridge, the
        control system and the operator agreed to the gram.
      </p>

      <SchemeBanner />

      {reconciliation.loading ? <Loading what="the reconciliation figures" /> : null}
      {reconciliation.error ? (
        <Empty sentence={`The reconciliation figures could not be read: ${reconciliation.error}.`} />
      ) : null}

      {answer ? (
        <>
          <Figure label="Mass balance residual" value={grams(answer.mass_balance_residual_g)} lead />
          <div class="grid grid--figures">
            <Figure label="Credit margin" value={grams(answer.credit_margin_g)} />
            <Figure label="Consumptions on open runs" value={String(answer.consumptions_on_open_runs)} />
            <Figure label="Batches with broken custody" value={String(answer.batches_with_broken_custody)} />
            <Figure
              label="Certificates with superseded figures"
              value={String(answer.certificates_with_superseded_figures)}
            />
          </div>

          <h2 class="console-heading">Integration ages</h2>
          <IntegrationAges ages={answer.integration_ages} />

          <h2 class="console-heading">Where these figures come from</h2>
          <dl class="pair-list">
            {derivationLines(answer.derivation).map((line) => (
              <div key={line.label}>
                <dt>{line.label}</dt>
                <dd>{line.statement}</dd>
              </div>
            ))}
            <div>
              <dt>Read at</dt>
              <dd class="mono">{answer.read_at}</dd>
            </div>
          </dl>
        </>
      ) : null}

      <h2 class="console-heading">Contract projection</h2>
      {contracts.loading ? <Loading what="the contracts on record" /> : null}
      {(contracts.data ?? []).map((contract) => (
        <ContractPanel key={contract.reference} contract={contract.reference} />
      ))}

      <h2 class="console-heading">Energy</h2>
      {lots.loading ? <Loading what="the lots on record" /> : null}
      {energyLot === null ? null : <EnergyPanel lot={energyLot} />}

      <h2 class="console-heading">Replay</h2>
      {certificates.loading ? <Loading what="the certificates on record" /> : null}
      {replayed === undefined ? null : <ReplayPanel number={replayed.number} />}
    </section>
  );
}
