/**
 * The balance screen. There is no input control on this surface at all: every
 * figure is derived and every figure links to the records it came from.
 */

import type { JSX } from 'preact';
import { CATEGORIES } from '../../../shared/enums';
import { STATEMENTS } from '../../../shared/copy';
import { LockMark } from '../../components/marks';
import { Banner, Empty, Loading } from '../../components/status';
import { grams, percent, words } from '../../format';
import { useFetch } from './hooks';
import { derivationLines } from './states';
import type { CategoryFigures, PeriodView } from './views';

function Derived({ label, value, to }: { label: string; value: string; to: string }): JSX.Element {
  return (
    <div class="stat">
      <span class="label">{label}</span>
      <a class="stat__value mono" href={to}>
        {value}
      </a>
    </div>
  );
}

function Count({ label, value, to }: { label: string; value: number; to: string }): JSX.Element {
  return (
    <div class="count">
      <span class="label">{label}</span>
      <a class="count__value" href={to}>
        {value}
      </a>
    </div>
  );
}

function held(figures: CategoryFigures, category: string): number {
  return category === 'post_consumer' ? figures.post_consumer : figures.pre_consumer;
}

function Movements({ period }: { period: PeriodView }): JSX.Element {
  if (period.movements.length === 0) {
    return <Empty sentence="No credit has moved in this period." />;
  }
  return (
    <div class="scroller">
      <table>
        <caption>A balance is the sum of its movements and is never held as a total.</caption>
        <thead>
          <tr>
            <th scope="col">Reference</th>
            <th scope="col">Kind</th>
            <th scope="col">Category</th>
            <th scope="col" class="num">Mass</th>
            <th scope="col">Lot</th>
            <th scope="col">Batch</th>
            <th scope="col">Effective on</th>
          </tr>
        </thead>
        <tbody>
          {period.movements.map((movement) => (
            <tr key={movement.reference}>
              <td class="mono">{movement.reference}</td>
              <td>{words(movement.kind)}</td>
              <td>{words(movement.category)}</td>
              <td class="num">{movement.mass_g}</td>
              <td class="mono">
                {movement.lot ? <a href={`/console/lots/${movement.lot}`}>{movement.lot}</a> : 'none'}
              </td>
              <td class="mono">{movement.batch ?? 'none'}</td>
              <td class="mono">{movement.effective_on}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BalanceScreen({ id }: { id: string }): JSX.Element {
  const balance = useFetch<PeriodView>(`/balance-periods/${id}`);
  const period = balance.data;
  const workings = `/console/balance/${id}#derivation`;
  const movements = `/console/balance/${id}#movements`;

  return (
    <section class="section">
      <span class="eyebrow">Balance period</span>
      <h1 class="console-title mono">{id}</h1>
      <p>
        Every figure below is derived from the credit movements listed further down, and each one
        links to the records it came from. A claims manager who cannot get from a total to its
        workings rebuilds it in a spreadsheet, and the spreadsheet becomes the real ledger.
      </p>

      {balance.loading ? <Loading what={`balance period ${id}`} /> : null}
      {balance.error ? <Empty sentence={`Balance period ${id} could not be read: ${balance.error}.`} /> : null}

      {period ? (
        <>
          {period.state === 'closed' ? (
            <Banner word="Closed">
              <>
                <LockMark label="closed" /> {STATEMENTS.periodClosed}
                {` Closed on ${period.closed_on ?? 'a date not recorded'}, with a cut-off of ${period.cut_off ?? 'none'}.`}
              </>
            </Banner>
          ) : null}

          <dl class="pair-list">
            <div>
              <dt>Site and grade</dt>
              <dd class="mono">{`${period.site}, ${period.grade}`}</dd>
            </div>
            <div>
              <dt>Window</dt>
              <dd class="mono">{`${period.starts_on} to ${period.ends_on}`}</dd>
            </div>
            <div>
              <dt>State</dt>
              <dd>{words(period.state)}</dd>
            </div>
            <div>
              <dt>Allocation basis</dt>
              <dd>{`${words(period.allocation_basis)}, held once per period and applying to the ledger and the carbon method alike`}</dd>
            </div>
          </dl>

          {CATEGORIES.map((category) => (
            <div key={category} class="stack">
              <h2 class="console-heading">{words(category)}</h2>
              <div class="grid grid--figures">
                <Derived
                  label="Credits in"
                  value={grams(held(period.credits_in_g, category))}
                  to={movements}
                />
                <Derived
                  label="Credits out"
                  value={grams(held(period.credits_out_g, category))}
                  to={movements}
                />
                <Derived
                  label="Credits available"
                  value={grams(held(period.credits_available_g, category))}
                  to={workings}
                />
                <Derived
                  label="Carried forward at the close"
                  value={grams(held(period.carried_forward_g, category))}
                  to={workings}
                />
                <Derived label="Expired at the close" value={grams(held(period.expired_g, category))} to={workings} />
              </div>
            </div>
          ))}

          <h2 class="console-heading">The margin, and what it is not</h2>
          <p>
            The margin is the claimable mass still available across both categories. It is a mass
            rather than a state, and the two categories are never netted against one another.
          </p>
          <div class="grid grid--figures">
            <Derived
              label="Credit margin"
              value={grams(period.credit_margin_g)}
              to={workings}
            />
            <Derived label="Carry-over limit" value={percent(period.carry_over_limit_bp)} to={workings} />
            <Derived label="Non-claimable input" value={grams(period.non_claimable_input_g)} to={workings} />
          </div>

          <h2 class="console-heading">Three counts, side by side</h2>
          <div class="counts">
            <Count label="Overrides this period" value={period.override_count} to={workings} />
            <Count label="Open restatements" value={period.open_restatement_count} to={workings} />
            <Count label="Findings past their date" value={period.open_finding_count} to={workings} />
          </div>

          <h2 class="console-heading">Conversion factors in force</h2>
          <div class="scroller">
            <table>
              <caption>A factor is the arithmetic of a stated window rather than a number somebody chose.</caption>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col" class="num">Version</th>
                  <th scope="col" class="num">Factor</th>
                  <th scope="col">Derivation window</th>
                  <th scope="col">Standing</th>
                </tr>
              </thead>
              <tbody>
                {period.conversion_factors.map((factor) => (
                  <tr key={`${factor.reference}/${factor.version}`}>
                    <td class="mono">{factor.reference}</td>
                    <td class="num">{factor.version}</td>
                    <td class="num">{percent(factor.factor_bp)}</td>
                    <td class="mono">
                      {factor.derived_from === null
                        ? 'no window at all'
                        : `${factor.derived_from} to ${factor.derived_to ?? 'open'}, ${factor.derived_in_g} g in and ${factor.derived_out_g} g out`}
                    </td>
                    <td>{factor.provisional ? 'provisional' : 'derived'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 class="console-heading">Inbound credits</h2>
          {period.inbound_credits.length === 0 ? (
            <Empty sentence="No credit has arrived from another site." />
          ) : (
            <ul class="list-marked">
              {period.inbound_credits.map((credit) => (
                <li key={credit.movement}>
                  <span class="mono">{`${credit.movement}, ${grams(credit.mass_g)} of ${words(credit.category)} from ${credit.origin_site ?? 'an unnamed site'} on ${credit.on}. `}</span>
                  not a fresh credit
                </li>
              ))}
            </ul>
          )}

          <h2 class="console-heading">Lots drawing on this period</h2>
          {period.lots.length === 0 ? (
            <Empty sentence="No lot draws credit from this period." />
          ) : (
            <ul class="list-plain">
              {period.lots.map((lot) => (
                <li key={lot} class="mono">
                  <a href={`/console/lots/${lot}`}>{lot}</a>
                </li>
              ))}
            </ul>
          )}

          <h2 class="console-heading" id="movements">
            Movements
          </h2>
          <Movements period={period} />

          <h2 class="console-heading" id="derivation">
            Derivation
          </h2>
          <dl class="pair-list">
            {derivationLines(period.derivation).map((line) => (
              <div key={line.label}>
                <dt>{line.label}</dt>
                <dd>{line.statement}</dd>
              </div>
            ))}
            <div>
              <dt>Credit margin</dt>
              <dd>
                the post-consumer credit available plus the pre-consumer credit available, each read
                from the movements above
              </dd>
            </div>
            <div>
              <dt>Read at</dt>
              <dd class="mono">{period.read_at}</dd>
            </div>
          </dl>
        </>
      ) : null}
    </section>
  );
}
