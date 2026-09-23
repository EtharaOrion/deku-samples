/**
 * Feedstock intake. The category has no default and can never be changed after
 * acceptance, so it is asked for first and refused first when it is missing.
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { CATEGORIES, COMPOSITION_BASES, CUSTODY_KINDS } from '../../../shared/enums';
import { Banner } from '../../components/status';
import { Mark } from '../../components/marks';
import { grams, words } from '../../format';
import type { Identity } from '../../routes';
import { Choice, Field, type FieldSpec } from './fields';
import { detailOf, holdsRole, post, useFetch } from './hooks';
import { BatchRegister, claimWord } from './register';
import type { CollectorView } from './artefacts';
import type { BatchView } from './views';

type Draft = Record<string, string>;

const MASS_FIELDS: FieldSpec[] = [
  { name: 'gross_g', label: 'Gross mass, grams', kind: 'integer' },
  { name: 'tare_g', label: 'Tare mass, grams', kind: 'integer' },
  { name: 'net_g', label: 'Net mass, grams', kind: 'integer' },
  { name: 'moisture_bp', label: 'Moisture, basis points', kind: 'integer' },
  { name: 'moisture_method', label: 'Moisture method', kind: 'text' },
  { name: 'device', label: 'Weighing device', kind: 'text' },
  { name: 'received_on', label: 'Received on', kind: 'date' },
];

const COMPOSITION_FIELDS: FieldSpec[] = [
  { name: 'polymer', label: 'Polymer', kind: 'text' },
  { name: 'fraction_bp', label: 'Declared fraction, basis points', kind: 'integer' },
];

const CONTAMINATION_FIELDS: FieldSpec[] = [
  { name: 'non_nylon_bp', label: 'Non-nylon, basis points', kind: 'integer' },
  { name: 'elastane_bp', label: 'Elastane, basis points', kind: 'integer' },
  { name: 'coatings', label: 'Coatings', kind: 'text' },
  { name: 'colour_load', label: 'Colour load', kind: 'text' },
  { name: 'foreign_matter', label: 'Foreign matter', kind: 'text' },
];

const REQUIRED: { name: string; sentence: string }[] = [
  { name: 'category', sentence: 'the category is required at intake and has no default' },
  { name: 'collector', sentence: 'the collector who delivered the batch is required' },
  { name: 'site', sentence: 'the receiving site is required' },
  { name: 'gross_g', sentence: 'the gross mass in grams is required' },
  { name: 'tare_g', sentence: 'the tare mass in grams is required' },
  { name: 'net_g', sentence: 'the net mass in grams is required' },
  { name: 'moisture_bp', sentence: 'the moisture in basis points is required' },
  { name: 'moisture_method', sentence: 'the moisture method is required' },
  { name: 'device', sentence: 'the weighing device is required' },
  { name: 'received_on', sentence: 'the receipt date is required' },
  { name: 'polymer', sentence: 'the declared polymer is required' },
  { name: 'fraction_bp', sentence: 'the declared fraction in basis points is required' },
  { name: 'basis', sentence: 'the composition basis is required' },
];

function integer(draft: Draft, name: string): number {
  const held = Number.parseInt(draft[name] ?? '', 10);
  return Number.isFinite(held) ? held : 0;
}

function bodyOf(draft: Draft): Record<string, unknown> {
  return {
    collector: draft.collector,
    site: draft.site,
    category: draft.category,
    gross_g: integer(draft, 'gross_g'),
    tare_g: integer(draft, 'tare_g'),
    net_g: integer(draft, 'net_g'),
    moisture_bp: integer(draft, 'moisture_bp'),
    moisture_method: draft.moisture_method,
    device: draft.device,
    received_on: draft.received_on,
    composition: {
      polymer: draft.polymer,
      fraction_bp: integer(draft, 'fraction_bp'),
      basis: draft.basis,
    },
    contamination: {
      non_nylon_bp: integer(draft, 'non_nylon_bp'),
      elastane_bp: integer(draft, 'elastane_bp'),
      coatings: draft.coatings ?? '',
      colour_load: draft.colour_load ?? '',
      foreign_matter: draft.foreign_matter ?? '',
    },
    custody: CUSTODY_KINDS.filter((kind) => (draft[`custody_${kind}_on`] ?? '') !== '').map((kind) => ({
      kind,
      on: draft[`custody_${kind}_on`],
      party: draft[`custody_${kind}_party`] ?? draft.collector,
    })),
  };
}

export function IntakeScreen({ identity }: { identity: Identity | null }): JSX.Element {
  const collectors = useFetch<CollectorView[]>('/collectors');
  const [draft, setDraft] = useState<Draft>({ category: '', collector: '', site: '', basis: '' });
  const [refusal, setRefusal] = useState<string | null>(null);
  const [booked, setBooked] = useState<BatchView | null>(null);
  const [working, setWorking] = useState(false);
  const mayBook = holdsRole(identity, 'plant_operator');

  function onSet(name: string, next: string): void {
    setDraft((held) => ({ ...held, [name]: next }));
  }

  async function submit(event: Event): Promise<void> {
    event.preventDefault();
    setRefusal(null);
    const missing = REQUIRED.find((entry) => (draft[entry.name] ?? '') === '');
    if (missing) {
      setRefusal(`${missing.name} was not given: ${missing.sentence}`);
      return;
    }
    setWorking(true);
    try {
      setBooked(await post<BatchView>('/batches', bodyOf(draft)));
    } catch (reason) {
      setRefusal(detailOf(reason));
    }
    setWorking(false);
  }

  return (
    <section class="section">
      <span class="eyebrow">Console</span>
      <h1 class="console-title">Feedstock intake</h1>
      <p>
        A batch is booked in against the collector approval in force on its receipt date, never a
        current flag. The category is asked for once here and can never be changed afterwards, and
        every figure below is computed on dry mass rather than on the mass as delivered.
      </p>

      {mayBook ? (
        <div class="form-column stack">
          {refusal ? <Banner word="Refused">{`This batch was not booked in: ${refusal}.`}</Banner> : null}
          {booked ? (
            <Banner word="Booked in">
              {`${booked.reference} was booked in. Dry mass ${grams(booked.dry_mass_g)}. The batch reads ${claimWord(booked)}${booked.claimable_reason ? `: ${words(booked.claimable_reason)}` : ''}.`}
            </Banner>
          ) : null}

          <form class="form" onSubmit={submit} noValidate>
            <Choice
              name="category"
              label="Category"
              placeholder="Choose a category"
              value={draft.category ?? ''}
              options={CATEGORIES.map((category) => ({ value: category, label: words(category) }))}
              onSet={onSet}
            />

            <Choice
              name="collector"
              label="Collector"
              placeholder="Choose a collector"
              value={draft.collector ?? ''}
              options={(collectors.data ?? []).map((collector) => ({
                value: collector.reference,
                label: `${collector.name}, approval ${words(collector.approval_state)}`,
              }))}
              onSet={onSet}
            />

            <Choice
              name="site"
              label="Site"
              placeholder="Choose a site"
              value={draft.site ?? ''}
              options={(identity?.sites ?? []).map((site) => ({ value: site, label: site }))}
              onSet={onSet}
            />

            {MASS_FIELDS.map((spec) => (
              <Field key={spec.name} spec={spec} value={draft[spec.name] ?? ''} onSet={onSet} />
            ))}

            {COMPOSITION_FIELDS.map((spec) => (
              <Field key={spec.name} spec={spec} value={draft[spec.name] ?? ''} onSet={onSet} />
            ))}

            <Choice
              name="basis"
              label="Composition basis"
              placeholder="Choose a basis"
              value={draft.basis ?? ''}
              options={COMPOSITION_BASES.map((basis) => ({ value: basis, label: basis }))}
              onSet={onSet}
            />

            {CONTAMINATION_FIELDS.map((spec) => (
              <Field key={spec.name} spec={spec} value={draft[spec.name] ?? ''} onSet={onSet} />
            ))}

            {CUSTODY_KINDS.flatMap((kind) => [
              <Field
                key={`custody_${kind}_on`}
                spec={{ name: `custody_${kind}_on`, label: `Custody, ${words(kind)}, date`, kind: 'date' }}
                value={draft[`custody_${kind}_on`] ?? ''}
                onSet={onSet}
              />,
              <Field
                key={`custody_${kind}_party`}
                spec={{ name: `custody_${kind}_party`, label: `Custody, ${words(kind)}, party`, kind: 'text' }}
                value={draft[`custody_${kind}_party`] ?? ''}
                onSet={onSet}
              />,
            ])}

            <button type="submit" class="submit" disabled={working}>
              <Mark name="arrow" labelFirst label={working ? 'Booking in …' : 'Book in the batch'} />
            </button>
          </form>
        </div>
      ) : (
        <p>Booking a batch requires the plant operator role.</p>
      )}

      <h2 class="console-heading">Batch register</h2>
      <BatchRegister />
    </section>
  );
}
