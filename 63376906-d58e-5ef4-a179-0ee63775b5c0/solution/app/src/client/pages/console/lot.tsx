/**
 * One lot, and the allocation that attaches claim to it. An allocation larger
 * than the ledger holds is refused here rather than warned about, and the
 * figures already on the screen do not move when it is.
 */

import type { JSX } from 'preact';
import { STATEMENTS } from '../../../shared/copy';
import { CarbonFigure, RecycledContent } from '../../components/figures';
import { FlagMark } from '../../components/marks';
import { Empty, Loading } from '../../components/status';
import { grams, words } from '../../format';
import type { Identity } from '../../routes';
import { AllocationForm } from './allocate';
import { holdsRole, useFetch } from './hooks';
import { categorySplitText, derivationLines, flagWord } from './states';
import type { LotView } from './views';

function Overrides({ lot }: { lot: LotView }): JSX.Element {
  if (lot.overrides.length === 0) return <Empty sentence="No separation has been overridden on this lot." />;
  return (
    <ul class="list-plain stack">
      {lot.overrides.map((override) => (
        <li key={override.reference}>
          <p>
            <a class="mono" href={`/console/overrides/${override.reference}`}>
              {override.reference}
            </a>
            {` ${STATEMENTS.overridden(override.authorised_by, override.authorised_on)} `}
            {override.reviewed ? 'reviewed' : 'unreviewed override'}
          </p>
          <p class="quiet">{`Separation broken: ${words(override.separation)}.`}</p>
        </li>
      ))}
    </ul>
  );
}

export function LotScreen({
  reference,
  identity,
}: {
  reference: string;
  identity: Identity | null;
}): JSX.Element {
  const lot = useFetch<LotView>(`/lots/${reference}`);
  const held = lot.data;
  const mayAllocate = holdsRole(identity, 'claims_manager');

  return (
    <section class="section">
      <span class="eyebrow">Lot</span>
      <h1 class="console-title mono">{reference}</h1>

      {lot.loading ? <Loading what={`lot ${reference}`} /> : null}
      {lot.error ? <Empty sentence={`Lot ${reference} could not be read: ${lot.error}.`} /> : null}

      {held ? (
        <>
          <p>
            {`This lot is the unit of work. It carries two claims that are not properties of the material and that are worth money: how much recycled input it represents, and what it emitted. Both are computed from the records beneath it rather than entered against it.`}
          </p>

          <dl class="pair-list">
            <div>
              <dt>Mass</dt>
              <dd class="mono">{grams(held.mass_g)}</dd>
            </div>
            <div>
              <dt>Disposition</dt>
              <dd>{words(held.disposition)}</dd>
            </div>
            <div>
              <dt>Claim type</dt>
              <dd>{words(held.claim_type)}</dd>
            </div>
            <div>
              <dt>Recycled content</dt>
              <dd>
                <RecycledContent content_bp={held.content_bp} claim_type={held.claim_type} />
              </dd>
            </div>
            <div>
              <dt>Claim attached</dt>
              <dd class="mono">{grams(held.claim_g)}</dd>
            </div>
            <div>
              <dt>Category split</dt>
              <dd class="mono">{categorySplitText(held.category_split)}</dd>
            </div>
            <div>
              <dt>Conversion factor</dt>
              <dd>{held.provisional_factor ? 'provisional' : 'derived from a stated window'}</dd>
            </div>
            <div>
              <dt>Site</dt>
              <dd class="mono">{held.site}</dd>
            </div>
            <div>
              <dt>Carbon</dt>
              <dd>
                {held.carbon ? (
                  <CarbonFigure
                    value_mg_per_kg={held.carbon.value_mg_per_kg}
                    boundary={held.carbon.boundary}
                    method_version={held.carbon.method_version}
                    uncertainty_bp={held.carbon.uncertainty_bp}
                  />
                ) : (
                  'no carbon figure has been computed for this lot'
                )}
              </dd>
            </div>
            <div>
              <dt>Balance periods</dt>
              <dd class="mono">
                {held.periods_drawn.length === 0
                  ? 'none yet'
                  : held.periods_drawn.map((period) => (
                      <a key={period} href={`/console/balance/${period}`}>
                        {`Balance period ${period} `}
                      </a>
                    ))}
              </dd>
            </div>
            <div>
              <dt>Genealogy</dt>
              <dd>
                <a href={`/console/lots/${reference}/genealogy`}>
                  {`The graph and the nested list behind ${reference}`}
                </a>
              </dd>
            </div>
          </dl>

          <h2 class="console-heading">What is flagged</h2>
          {held.flags.length === 0 ? (
            <Empty sentence="Nothing anywhere in this lot's graph is flagged." />
          ) : (
            <ul class="list-plain flag-list">
              {held.flags.map((flag) => (
                <li key={flag}>
                  <FlagMark label={flagWord(flag)} />
                </li>
              ))}
            </ul>
          )}

          <h2 class="console-heading">Deviations</h2>
          {held.deviations.length === 0 ? (
            <Empty sentence="No deviation touches this lot." />
          ) : (
            <ul class="list-plain">
              {held.deviations.map((deviation) => (
                <li key={deviation}>
                  <a class="mono" href={`/console/deviations/${deviation}`}>
                    {deviation}
                  </a>
                  {held.open_deviations.includes(deviation) ? ' open deviation' : ' closed'}
                </li>
              ))}
            </ul>
          )}

          <h2 class="console-heading">Overrides</h2>
          <Overrides lot={held} />

          <h2 class="console-heading">What this lot states</h2>
          <ul class="list-marked">
            {held.statements.map((statement) => (
              <li key={statement}>{words(statement)}</li>
            ))}
          </ul>

          {mayAllocate ? (
            <AllocationForm lot={held} onAllocated={() => lot.reload()} />
          ) : (
            <p>Allocating claim to a lot requires the claims manager role.</p>
          )}

          <h2 class="console-heading">Derivation</h2>
          <dl class="pair-list">
            {derivationLines(held.derivation).map((line) => (
              <div key={line.label}>
                <dt>{line.label}</dt>
                <dd>{line.statement}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </section>
  );
}
