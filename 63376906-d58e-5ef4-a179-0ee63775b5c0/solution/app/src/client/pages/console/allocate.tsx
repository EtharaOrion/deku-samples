/**
 * The allocation. The ledger refuses rather than warns, and the refusal names
 * the margin at the instant of refusal beside the mass that was asked for.
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { CATEGORIES } from '../../../shared/enums';
import { ApiError } from '../../api';
import { Mark } from '../../components/marks';
import { Banner } from '../../components/status';
import { grams, words } from '../../format';
import { detailOf, post, useFetch } from './hooks';
import type { LotView, PeriodView } from './views';

function refusalSentences(error: unknown, category: string, lot: LotView): string[] {
  const figures = error instanceof ApiError ? error.refusedFigures : {};
  const available_g = figures.available_g;
  const requested_g = figures.requested_g;
  if (typeof available_g !== 'number' || typeof requested_g !== 'number') {
    return [detailOf(error)];
  }
  return [
    `This allocation is refused against ${lot.reference}.`,
    `Available: ${grams(available_g)}. Requested: ${grams(requested_g)}.`,
    `Attaching ${grams(available_g)} or less of ${words(category)} claim would be accepted, and nothing else on this screen has changed.`,
  ];
}

export function AllocationForm({ lot, onAllocated }: { lot: LotView; onAllocated: () => void }): JSX.Element {
  const periods = useFetch<PeriodView[]>('/balance-periods');
  const [category, setCategory] = useState('');
  const [mass_g, setMass_g] = useState('');
  const [refusal, setRefusal] = useState<string[] | null>(null);
  const [attached, setAttached] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const drawn = lot.periods_drawn[0];
  const open = (periods.data ?? []).find((period) => period.state === 'open' && period.site === lot.site);
  const period = drawn ?? open?.reference ?? null;

  async function submit(event: Event): Promise<void> {
    event.preventDefault();
    setRefusal(null);
    setAttached(null);
    if (period === null) {
      setRefusal([`No open balance period covers ${lot.site}, so there is nothing to attach claim against.`]);
      return;
    }
    if (category === '') {
      setRefusal(['The category was not chosen, and an allocation is never netted across categories.']);
      return;
    }
    const requested_g = Number.parseInt(mass_g, 10);
    if (!Number.isFinite(requested_g)) {
      setRefusal(['The mass in grams was not given.']);
      return;
    }
    setWorking(true);
    try {
      await post<{ reference: string }>(`/balance-periods/${period}/allocations`, {
        lot: lot.reference,
        category,
        mass_g: requested_g,
      });
      setAttached(`${grams(requested_g)} of ${words(category)} claim was attached to ${lot.reference}.`);
      onAllocated();
    } catch (error) {
      setRefusal(refusalSentences(error, category, lot));
    }
    setWorking(false);
  }

  return (
    <div class="form-column stack">
      <h2 class="console-heading">Allocate claim to this lot</h2>
      <p>
        {`Claim is attached against ${period ?? 'no period'}. No route on this screen accepts a percentage: the content is computed from the mass attached and the mass of the lot.`}
      </p>
      {refusal ? <Banner word="Refused">{refusal.join(' ')}</Banner> : null}
      {attached ? <Banner word="Attached">{attached}</Banner> : null}
      <form class="form" onSubmit={submit} noValidate>
        <div class="field">
          <label class="field__label" for="allocation-category">
            Category
          </label>
          <select
            id="allocation-category"
            name="category"
            class="field__control"
            value={category}
            onChange={(event) => setCategory((event.currentTarget as HTMLSelectElement).value)}
          >
            <option value="" disabled>
              Choose a category
            </option>
            {CATEGORIES.map((held) => (
              <option key={held} value={held}>
                {words(held)}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="allocation-mass">
            Mass to attach, grams
          </label>
          <input
            id="allocation-mass"
            name="mass_g"
            class="field__control"
            type="number"
            step={1}
            value={mass_g}
            onInput={(event) => setMass_g((event.currentTarget as HTMLInputElement).value)}
          />
        </div>
        <button type="submit" class="submit" disabled={working}>
          <Mark name="arrow" labelFirst label={working ? 'Attaching …' : 'Attach claim'} />
        </button>
      </form>
    </div>
  );
}
