/**
 * The console: one router over the address bar, one persistent top bar and one
 * secondary navigation row. Every screen below renders alone on a hard refresh.
 */

import type { JSX } from 'preact';
import { readIdentity } from '../../api';
import { PageShell } from '../../components/layout';
import { Empty } from '../../components/status';
import type { Identity } from '../../routes';
import { BalanceScreen } from './balance';
import { BoardScreen } from './board';
import { CertificateScreen } from './certificate';
import { CertificatesScreen } from './certificates';
import { GenealogyScreen } from './genealogy';
import { useFetch, usePath } from './hooks';
import { IntakeScreen } from './intake';
import { LotScreen } from './lot';
import { RecordScreen } from './record';
import { ReconciliationScreen } from './reconciliation';
import { DeviationScreen, OverrideScreen } from './small';
import type { PeriodView } from './views';
import { WizardScreen, isWizardStep, type WizardStep } from './wizard';

interface ConsoleAppProps {
  identity: Identity | null;
}

type Screen =
  | { name: 'board' }
  | { name: 'intake' }
  | { name: 'record' }
  | { name: 'reconciliation' }
  | { name: 'certificates' }
  | { name: 'certificate'; number: string }
  | { name: 'wizard'; step: WizardStep }
  | { name: 'balance'; id: string }
  | { name: 'lot'; reference: string }
  | { name: 'genealogy'; reference: string }
  | { name: 'override'; reference: string }
  | { name: 'deviation'; reference: string }
  | { name: 'unknown'; path: string };

function screenFor(path: string): Screen {
  const parts = path.split('/').filter((part) => part !== '');
  const section = parts[1];
  const first = parts[2];
  const second = parts[3];
  if (section === undefined) return { name: 'board' };
  if (section === 'intake') return { name: 'intake' };
  if (section === 'record') return { name: 'record' };
  if (section === 'reconciliation') return { name: 'reconciliation' };
  if (section === 'certificates') {
    if (first === undefined) return { name: 'certificates' };
    if (first === 'new') return { name: 'wizard', step: isWizardStep(second) ? second : 'lot' };
    return { name: 'certificate', number: first };
  }
  if (section === 'balance' && first !== undefined) return { name: 'balance', id: first };
  if (section === 'lots' && first !== undefined) {
    return second === 'genealogy'
      ? { name: 'genealogy', reference: first }
      : { name: 'lot', reference: first };
  }
  if (section === 'overrides' && first !== undefined) return { name: 'override', reference: first };
  if (section === 'deviations' && first !== undefined) return { name: 'deviation', reference: first };
  return { name: 'unknown', path };
}

function body(screen: Screen, identity: Identity | null): JSX.Element {
  switch (screen.name) {
    case 'board':
      return <BoardScreen />;
    case 'intake':
      return <IntakeScreen identity={identity} />;
    case 'record':
      return <RecordScreen />;
    case 'reconciliation':
      return <ReconciliationScreen />;
    case 'certificates':
      return <CertificatesScreen identity={identity} />;
    case 'certificate':
      return <CertificateScreen number={screen.number} identity={identity} />;
    case 'wizard':
      return <WizardScreen step={screen.step} identity={identity} />;
    case 'balance':
      return <BalanceScreen id={screen.id} />;
    case 'lot':
      return <LotScreen reference={screen.reference} identity={identity} />;
    case 'genealogy':
      return <GenealogyScreen reference={screen.reference} />;
    case 'override':
      return <OverrideScreen reference={screen.reference} identity={identity} />;
    case 'deviation':
      return <DeviationScreen reference={screen.reference} />;
    case 'unknown':
      return (
        <section class="section">
          <span class="eyebrow">Console</span>
          <h1>No such console address</h1>
          <Empty
            sentence={`Nothing is recorded at ${screen.path}. The board, intake, certificates, balance, reconciliation and record addresses are listed above.`}
          />
        </section>
      );
  }
}

const SECTIONS: { href: string; label: string }[] = [
  { href: '/console', label: 'Board' },
  { href: '/console/intake', label: 'Intake' },
  { href: '/console/certificates', label: 'Certificates' },
  { href: '/console/reconciliation', label: 'Reconciliation' },
  { href: '/console/record', label: 'Record' },
];

function ConsoleNav({ path }: { path: string }): JSX.Element {
  const periods = useFetch<PeriodView[]>('/balance-periods');
  return (
    <nav class="console-nav" aria-label="Console sections">
      {SECTIONS.map((link) => (
        <a key={link.href} href={link.href} aria-current={link.href === path ? 'page' : undefined}>
          {link.label}
        </a>
      ))}
      <span class="console-nav__group">
        <span class="label">Balance</span>
        {(periods.data ?? []).map((period) => (
          <a
            key={period.reference}
            class="mono"
            href={`/console/balance/${period.reference}`}
            aria-current={`/console/balance/${period.reference}` === path ? 'page' : undefined}
          >
            {period.reference}
          </a>
        ))}
      </span>
    </nav>
  );
}

export function ConsoleApp({ identity }: ConsoleAppProps): JSX.Element {
  const path = usePath();
  const reader = identity ?? readIdentity();
  return (
    <PageShell route="console" surface="console" identity={reader}>
      <ConsoleNav path={path} />
      {body(screenFor(path), reader)}
    </PageShell>
  );
}
