/**
 * The certificate wizard: four steps at four addresses, each reachable on its
 * own and each showing the eight conditions as they stand. The fourth renders
 * the document that will be signed, and signing is a separate deliberate act.
 */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Banner, Loading } from '../../components/status';
import type { Identity } from '../../routes';
import type { CustomerView, PreviewView } from './artefacts';
import { Conditions } from './conditions';
import { detailOf, navigate, post, useFetch } from './hooks';
import { ClaimStep, LotStep, RecipientStep, ReviewStep } from './steps';
import type { LotView } from './views';

const STEPS = ['lot', 'claim', 'recipient', 'review'] as const;
export type WizardStep = (typeof STEPS)[number];

const LOT_KEY = 'ravel_wizard_lot';
const RECIPIENT_KEY = 'ravel_wizard_recipient';

export function isWizardStep(value: string | undefined): value is WizardStep {
  return value !== undefined && (STEPS as readonly string[]).includes(value);
}

function remembered(key: string): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(key);
}

function remember(key: string, value: string): void {
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, value);
}

function Steps({ step }: { step: WizardStep }): JSX.Element {
  return (
    <nav class="wizard-steps" aria-label="Certificate steps">
      {STEPS.map((held, index) => (
        <a
          key={held}
          href={`/console/certificates/new/${held}`}
          aria-current={held === step ? 'step' : undefined}
        >
          {`${index + 1}. ${held === 'lot' ? 'Lot' : held === 'claim' ? 'Claim' : held === 'recipient' ? 'Recipient' : 'Review and sign'}`}
        </a>
      ))}
    </nav>
  );
}

export function WizardScreen({ step, identity }: { step: WizardStep; identity: Identity | null }): JSX.Element {
  const lots = useFetch<LotView[]>('/lots');
  const customers = useFetch<CustomerView[]>('/customers');
  const [lotChosen, setLotChosen] = useState<string | null>(remembered(LOT_KEY));
  const [recipientChosen, setRecipientChosen] = useState<string | null>(remembered(RECIPIENT_KEY));

  const released = (lots.data ?? []).filter(
    (lot) => lot.disposition === 'released' && (identity === null || identity.sites.includes(lot.site)),
  );
  const lot =
    (lots.data ?? []).find((held) => held.reference === lotChosen) ?? released[0] ?? null;
  const customer =
    (customers.data ?? []).find((held) => held.reference === recipientChosen) ?? customers.data?.[0] ?? null;

  const [previewed, setPreviewed] = useState<PreviewView | null>(null);
  const [previewRefusal, setPreviewRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (!lot || !customer) return;
    let live = true;
    post<PreviewView>('/certificates/preview', { lot: lot.reference, recipient: customer.reference })
      .then((answer) => {
        if (live) setPreviewed(answer);
      })
      .catch((reason: unknown) => {
        if (live) setPreviewRefusal(detailOf(reason));
      });
    return () => {
      live = false;
    };
  }, [lot?.reference, customer?.reference]);

  function chooseLot(reference: string): void {
    setLotChosen(reference);
    remember(LOT_KEY, reference);
    navigate('/console/certificates/new/claim');
  }

  function chooseRecipient(reference: string): void {
    setRecipientChosen(reference);
    remember(RECIPIENT_KEY, reference);
    navigate('/console/certificates/new/review');
  }

  return (
    <section class="section">
      <span class="eyebrow">Issue a certificate</span>
      <h1 class="console-title">Certificate wizard</h1>
      <p>
        Eight conditions are checked on the server and none of them is waivable. They are shown on
        every step as they stand, and they are decided again at the moment of signing against the
        records as they stand then.
      </p>
      <Steps step={step} />

      {lots.loading || customers.loading ? <Loading what="the lots and the customers" /> : null}

      {previewRefusal ? (
        <Banner word="Not previewed">{`The eight conditions could not be read: ${previewRefusal}.`}</Banner>
      ) : null}

      <h2 class="console-heading">The eight conditions</h2>
      <Conditions answer={previewed} loading={previewed === null && previewRefusal === null} />

      {step === 'lot' ? <LotStep lots={lots.data ?? []} chosen={lot?.reference ?? null} onChoose={chooseLot} /> : null}
      {step === 'claim' ? <ClaimStep lot={lot} /> : null}
      {step === 'recipient' ? (
        <RecipientStep
          customers={customers.data ?? []}
          chosen={customer?.reference ?? null}
          onChoose={chooseRecipient}
        />
      ) : null}
      {step === 'review' ? <ReviewStep lot={lot} customer={customer} identity={identity} /> : null}
    </section>
  );
}
