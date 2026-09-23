/**
 * The eight issuing conditions, as eight statements. None of them is waivable,
 * so nothing here renders a control that dismisses one.
 */

import type { JSX } from 'preact';
import { Empty, Loading } from '../../components/status';
import { referencePath } from './hooks';
import type { ConditionView, PreviewView } from './artefacts';

function Blocking({ reference }: { reference: string }): JSX.Element {
  const path = referencePath(reference);
  return (
    <p class="condition__blocking">
      {'Blocked by '}
      {path === null ? <span class="mono">{reference}</span> : (
        <a class="mono" href={path}>
          {reference}
        </a>
      )}
      {'.'}
    </p>
  );
}

function Row({ condition }: { condition: ConditionView }): JSX.Element {
  return (
    <div class="condition">
      <span class="condition__word">{condition.satisfied ? 'satisfied' : 'not satisfied'}</span>
      <div>
        <p>{condition.statement}</p>
        {!condition.satisfied && condition.blocking_reference !== null ? (
          <Blocking reference={condition.blocking_reference} />
        ) : null}
      </div>
    </div>
  );
}

export function Conditions({
  answer,
  loading,
}: {
  answer: PreviewView | null;
  loading: boolean;
}): JSX.Element {
  if (loading) return <Loading what="the eight conditions" />;
  if (!answer) return <Empty sentence="No lot has been chosen, so there is nothing to check yet." />;
  return (
    <div class="stack">
      <p>
        {answer.all_satisfied
          ? `All eight conditions are satisfied against ${answer.lot} as the records stand now. They are decided again on the server at the moment of signing.`
          : `One or more of the eight conditions is unsatisfied against ${answer.lot}. No control on this screen dismisses a condition, and none of the eight is waivable.`}
      </p>
      <div class="conditions">
        {answer.conditions.map((condition) => (
          <Row key={condition.condition} condition={condition} />
        ))}
      </div>
    </div>
  );
}
