/**
 * The four steps of the wizard. Nothing on the claim step is typed, and the
 * review step renders the document that will be signed rather than a form that
 * generates it.
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { STATEMENTS } from '../../../shared/copy';
import { CarbonFigure, RecycledContent } from '../../components/figures';
import { Mark } from '../../components/marks';
import { Banner, Empty } from '../../components/status';
import { grams, words } from '../../format';
import type { Identity } from '../../routes';
import type { CertificateView, CustomerView } from './artefacts';
import { detailOf, holdsRole, navigate, post } from './hooks';
import { categorySplitText } from './states';
import type { LotView } from './views';

export function LotStep({ lots, chosen, onChoose }: { lots: LotView[]; chosen: string | null; onChoose: (reference: string) => void }): JSX.Element {
  if (lots.length === 0) return <Empty sentence="No lot is on the register." />;
  return (
    <div class="stack">
      <h2 class="console-heading">Choose the lot</h2>
      <p>
        Only a released lot can carry a certificate. A lot held at any other disposition states that
        disposition here rather than disappearing from the list.
      </p>
      <ul class="list-plain stack">
        {lots.map((lot) => (
          <li key={lot.reference}>
            {lot.disposition === 'released' ? (
              <button
                type="button"
                class="button-quiet"
                onClick={() => onChoose(lot.reference)}
                aria-pressed={lot.reference === chosen}
              >
                {`${lot.reference}, ${grams(lot.mass_g)}, ${lot.site}${lot.reference === chosen ? ', chosen' : ''}`}
              </button>
            ) : (
              <p>
                <span class="mono">{`${lot.reference}, ${grams(lot.mass_g)}, ${lot.site}. `}</span>
                {words(lot.disposition)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ClaimStep({ lot }: { lot: LotView | null }): JSX.Element {
  if (!lot) return <Empty sentence="No lot has been chosen, so there is no claim to read." />;
  return (
    <div class="stack">
      <h2 class="console-heading">The claim this lot carries</h2>
      <p>
        Nothing on this step is typed. The claim type, the percentage and the category split are
        computed from the ledger and are shown here as they will be printed.
      </p>
      <dl class="pair-list">
        <div>
          <dt>Claim type</dt>
          <dd>{words(lot.claim_type)}</dd>
        </div>
        <div>
          <dt>Recycled content</dt>
          <dd>
            <RecycledContent content_bp={lot.content_bp} claim_type={lot.claim_type} />
          </dd>
        </div>
        <div>
          <dt>Category split</dt>
          <dd class="mono">{categorySplitText(lot.category_split)}</dd>
        </div>
        <div>
          <dt>Conversion factor</dt>
          <dd>{lot.provisional_factor ? 'provisional' : 'derived from a stated window'}</dd>
        </div>
      </dl>
    </div>
  );
}

export function RecipientStep({
  customers,
  chosen,
  onChoose,
}: {
  customers: CustomerView[];
  chosen: string | null;
  onChoose: (reference: string) => void;
}): JSX.Element {
  if (customers.length === 0) return <Empty sentence="No customer is on the register." />;
  return (
    <div class="stack">
      <h2 class="console-heading">Choose the recipient</h2>
      <p>
        The permitted and prohibited statements are generated for the recipient who receives them, so
        the document is addressed before it is signed.
      </p>
      <ul class="list-plain stack">
        {customers.map((customer) => (
          <li key={customer.reference}>
            <button
              type="button"
              class="button-quiet"
              onClick={() => onChoose(customer.reference)}
              aria-pressed={customer.reference === chosen}
            >
              {`${customer.name}, ${customer.application}, ${customer.industry}${customer.reference === chosen ? ', chosen' : ''}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReviewStep({
  lot,
  customer,
  identity,
}: {
  lot: LotView | null;
  customer: CustomerView | null;
  identity: Identity | null;
}): JSX.Element {
  const [password, setPassword] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const maySign = holdsRole(identity, 'certificate_signer');

  async function sign(event: Event): Promise<void> {
    event.preventDefault();
    setRefusal(null);
    if (!lot || !customer) {
      setRefusal('a lot and a recipient are chosen before anything is signed');
      return;
    }
    setWorking(true);
    try {
      const signed = await post<CertificateView>('/certificates', {
        lot: lot.reference,
        recipient: customer.reference,
        password,
      });
      navigate(`/console/certificates/${signed.number}`);
    } catch (error) {
      setRefusal(detailOf(error));
    }
    setWorking(false);
  }

  if (!lot || !customer) {
    return <Empty sentence="A lot and a recipient are chosen on the earlier steps before the document can be read." />;
  }

  return (
    <div class="stack-wide">
      <h2 class="console-heading">The document that will be signed</h2>
      <article class="card document">
        <h3 class="console-subheading">Claim type</h3>
        <p>{words(lot.claim_type)}</p>
        <h3 class="console-subheading">Recycled content</h3>
        <p>
          <RecycledContent content_bp={lot.content_bp} claim_type={lot.claim_type} />
        </p>
        <p class="mono">{categorySplitText(lot.category_split)}</p>
        <h3 class="console-subheading">Carbon</h3>
        {lot.carbon ? (
          <CarbonFigure
            value_mg_per_kg={lot.carbon.value_mg_per_kg}
            boundary={lot.carbon.boundary}
            method_version={lot.carbon.method_version}
            uncertainty_bp={lot.carbon.uncertainty_bp}
          />
        ) : (
          <p>No carbon figure has been computed for this lot, so no carbon figure is printed.</p>
        )}
        <h3 class="console-subheading">What the recipient may state</h3>
        <p class="permitted-statement">{STATEMENTS.massBalanceClaim}</p>
        <h3 class="console-subheading">What the recipient may not state</h3>
        <p class="permitted-statement">{STATEMENTS.massBalanceProhibited}</p>
        <h3 class="console-subheading">Lot and recipient</h3>
        <p class="mono">{`${lot.reference}, ${grams(lot.mass_g)}, ${lot.site}, grade ${lot.grade}`}</p>
        <p>{`${customer.name}, ${customer.reference}, holding specification version ${customer.holds_specification_version}`}</p>
      </article>

      <p>The recipient files this document with a regulator.</p>

      {refusal ? <Banner word="Refused">{refusal}</Banner> : null}

      {maySign ? (
        <div class="form-column">
          <form class="form" onSubmit={sign} noValidate>
            <div class="field">
              <label class="field__label" for="sign-password">
                Password, because signing re-authenticates the signer
              </label>
              <input
                id="sign-password"
                class="field__control"
                type="password"
                autocomplete="current-password"
                value={password}
                onInput={(event) => setPassword((event.currentTarget as HTMLInputElement).value)}
              />
            </div>
            <button type="submit" class="submit" disabled={working}>
              <Mark name="arrow" labelFirst label={working ? 'Signing …' : 'Sign certificate'} />
            </button>
          </form>
        </div>
      ) : (
        <p>Signing a certificate requires the certificate signer role.</p>
      )}
    </div>
  );
}
