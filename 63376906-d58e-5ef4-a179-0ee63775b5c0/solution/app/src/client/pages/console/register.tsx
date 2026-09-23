/**
 * The batch register. A batch resolves its claim against the approval in force
 * on its receipt date, so the register prints the claim as a word and the
 * sentence that explains it rather than a flag a reader has to interpret.
 */

import type { JSX } from 'preact';
import { STATEMENTS } from '../../../shared/copy';
import { WarningMark } from '../../components/marks';
import { Empty, Loading } from '../../components/status';
import { words } from '../../format';
import { useFetch } from './hooks';
import type { BatchView } from './views';

export function claimWord(batch: BatchView): string {
  return batch.claimable ? 'claimable' : 'non-claimable';
}

function claimSentence(batch: BatchView): string | null {
  if (batch.claimable) return null;
  if (batch.statements.length > 0) return batch.statements[0] ?? null;
  if (batch.claimable_reason === 'collector_approval_lapsed' && batch.approval_lapsed_on !== null) {
    return STATEMENTS.collectorLapsed(batch.approval_lapsed_on);
  }
  const missing = batch.missing_custody[0];
  return STATEMENTS.nonClaimable(
    missing ? `${missing} custody link` : words(batch.claimable_reason ?? 'not claimable'),
  );
}

export function BatchRegister(): JSX.Element {
  const batches = useFetch<BatchView[]>('/batches');
  if (batches.loading) return <Loading what="the batch register" />;
  if (batches.error) {
    return <Empty sentence={`The batch register could not be read: ${batches.error}.`} />;
  }
  const rows = batches.data ?? [];
  if (rows.length === 0) return <Empty sentence="No batch has been booked in." />;
  return (
    <div class="scroller">
      <table>
        <caption>Every batch booked in, with the claim its collector approval and its custody allow.</caption>
        <thead>
          <tr>
            <th scope="col">Reference</th>
            <th scope="col">Collector</th>
            <th scope="col">Category</th>
            <th scope="col" class="num">Net</th>
            <th scope="col" class="num">Dry mass</th>
            <th scope="col">Claim</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((batch) => {
            const sentence = claimSentence(batch);
            return (
              <tr key={batch.reference}>
                <td class="mono">{batch.reference}</td>
                <td>{batch.collector_name}</td>
                <td>{words(batch.category)}</td>
                <td class="num">{batch.net_g}</td>
                <td class="num">{batch.dry_mass_g}</td>
                <td>
                  <span>{claimWord(batch)}</span>
                  {sentence ? <p class="quiet">{sentence}</p> : null}
                  {batch.flags.includes('lapsed_calibration') ? (
                    <span class="word-beside">
                      <WarningMark label="lapsed calibration" />
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
