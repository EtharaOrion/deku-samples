/**
 * The operational record. Nothing on this surface edits or removes an entry,
 * because a correction is a new entry naming what it corrects.
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Banner, Empty, Loading } from '../../components/status';
import { Mark } from '../../components/marks';
import { useFetch, detailOf, post } from './hooks';
import { counted } from './states';
import type { ChainView, ExportView, RecordEntryView } from './artefacts';

const SHORT_DIGEST = 12;

function shortened(digest: string): string {
  return digest.length > SHORT_DIGEST ? `${digest.slice(0, SHORT_DIGEST)}…` : digest;
}

function list(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function ChainLine(): JSX.Element {
  const chain = useFetch<ChainView>('/record/check');
  if (chain.loading) return <Loading what="the digest chain" />;
  if (chain.error) return <Empty sentence={`The digest chain could not be walked: ${chain.error}.`} />;
  const answer = chain.data;
  if (!answer) return <Empty sentence="The digest chain has not been walked." />;
  return (
    <p>
      {answer.holds
        ? `The chain holds. ${counted(answer.entries, 'entry was', 'entries were')} walked.`
        : `The chain fails at seq ${answer.first_failure ?? 0}.`}
    </p>
  );
}

function ExportPanel(): JSX.Element {
  const [period, setPeriod] = useState('');
  const [sites, setSites] = useState('');
  const [grades, setGrades] = useState('');
  const [certificates, setCertificates] = useState('');
  const [taken, setTaken] = useState<ExportView | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function submit(event: Event): Promise<void> {
    event.preventDefault();
    setRefusal(null);
    setWorking(true);
    try {
      setTaken(
        await post<ExportView>('/exports', {
          period: period === '' ? null : period,
          sites: list(sites),
          grades: list(grades),
          certificates: list(certificates),
        }),
      );
    } catch (reason) {
      setRefusal(detailOf(reason));
    }
    setWorking(false);
  }

  const fields: { id: string; label: string; value: string; set: (next: string) => void }[] = [
    { id: 'export-period', label: 'Period', value: period, set: setPeriod },
    { id: 'export-sites', label: 'Sites, separated by commas', value: sites, set: setSites },
    { id: 'export-grades', label: 'Grades, separated by commas', value: grades, set: setGrades },
    {
      id: 'export-certificates',
      label: 'Certificates, separated by commas',
      value: certificates,
      set: setCertificates,
    },
  ];

  return (
    <div class="form-column stack">
      <h2 class="console-heading">Export</h2>
      <p>
        An export states its scope before it reads anything, and the export is itself an entry in the
        record. An export that returns nothing is recorded too.
      </p>
      {refusal ? <Banner word="Refused">{`This export was not recorded: ${refusal}.`}</Banner> : null}
      {taken ? (
        <Banner word="Exported">
          {`${taken.reference} carries ${counted(taken.digests.length, 'digest', 'digests')} and read at ${taken.read_at}. The export scope was recorded before the read.`}
        </Banner>
      ) : null}
      <form class="form" onSubmit={submit} noValidate>
        {fields.map((field) => (
          <div key={field.id} class="field">
            <label class="field__label" for={field.id}>
              {field.label}
            </label>
            <input
              id={field.id}
              class="field__control"
              type="text"
              value={field.value}
              onInput={(event) => field.set((event.currentTarget as HTMLInputElement).value)}
            />
          </div>
        ))}
        <button type="submit" class="submit" disabled={working}>
          <Mark name="arrow" labelFirst label={working ? 'Recording the scope …' : 'Export'} />
        </button>
      </form>
    </div>
  );
}

export function RecordScreen(): JSX.Element {
  const entries = useFetch<RecordEntryView[]>('/record');
  const rows = entries.data ?? [];

  return (
    <section class="section">
      <span class="eyebrow">Console</span>
      <h1 class="console-title">The record</h1>
      <p>
        Every act is an entry with the person, the moment and the object it touched. Each digest is
        computed over the entry's own content and the digest before it, so an entry cannot be edited
        and none is removed from the sequence. A refusal is recorded as well as a success.
      </p>
      <ChainLine />

      {entries.loading ? <Loading what="the record" /> : null}
      {entries.error ? <Empty sentence={`The record could not be read: ${entries.error}.`} /> : null}
      {entries.data && rows.length === 0 ? <Empty sentence="No act has been recorded yet." /> : null}

      {rows.length > 0 ? (
        <div class="scroller scroller--tall">
          <table>
            <caption>{`${counted(rows.length, 'entry', 'entries')}, oldest first.`}</caption>
            <thead>
              <tr>
                <th scope="col" class="num">Seq</th>
                <th scope="col">Digest</th>
                <th scope="col">Previous digest</th>
                <th scope="col">Person</th>
                <th scope="col">At</th>
                <th scope="col">Act</th>
                <th scope="col">Object</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.seq}>
                  <td class="num">{entry.seq}</td>
                  <td class="mono" title={entry.digest}>
                    {shortened(entry.digest)}
                  </td>
                  <td class="mono" title={entry.prev_digest}>
                    {shortened(entry.prev_digest)}
                  </td>
                  <td>{entry.person}</td>
                  <td class="mono">{entry.at}</td>
                  <td>{entry.act}</td>
                  <td class="mono">{entry.object ?? 'none'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <ExportPanel />
    </section>
  );
}
