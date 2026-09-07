import { api } from '../api.js';
import { useAsync, Loading, Empty, StateWord, Icon, grams, words, Reveal } from '../ui.jsx';
import SchemeBanner from './SchemeBanner.jsx';

const STAGES = [
  ['dissolution', 'Dissolution'],
  ['depolymerisation', 'Depolymerisation'],
  ['purification', 'Purification'],
  ['repolymerisation', 'Repolymerisation'],
];

export default function Board({ session }) {
  const runs = useAsync(() => api('/runs'));

  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Board</p>
        <h1 class="t-h3">Runs by process stage</h1>
        <p class="t-big">
          One column per process stage and one card per run. Each card names the column it sits in,
          so the stage is a word rather than a position.
        </p>
        {session ? (
          <p class="t-small" style="color:var(--muted)">
            Signed in as {session.name} ({session.email}) · role {(session.roles || []).map(words).join(', ')} ·
            scope {(session.sites || []).join(', ')} · grant ends {session.grant_ends_on}
          </p>
        ) : null}
      </div>

      <SchemeBanner />

      {runs.loading ? <Loading what="the run board" /> : null}
      {runs.error ? <Empty>The run board could not be read just now.</Empty> : null}
      {runs.data && runs.data.length === 0 ? (
        <Empty>No run has been opened yet. There is nothing on the board.</Empty>
      ) : null}

      {runs.data && runs.data.length > 0 ? (
        <div class="board">
          {STAGES.map(([key, label]) => {
            const cards = runs.data.filter((r) => r.run_type === key);
            return (
              <section class="board-col" key={key} aria-labelledby={`col-${key}`}>
                <h3 id={`col-${key}`}>
                  {label} <span class="mono t-small">({cards.length})</span>
                </h3>
                {cards.length === 0 ? (
                  <p class="empty t-small">No run at this stage.</p>
                ) : (
                  cards.map((r) => (
                    <Reveal as="article" className="run-card" key={r.reference}>
                      <p class="t-eyebrow" style="margin-bottom:0.35rem">Stage: {label}</p>
                      <h4 class="t-h4" style="margin-bottom:0.5rem">
                        <a href={`/console/runs/${r.reference}`} class="mono">{r.reference}</a>
                      </h4>
                      <p class="t-small" style="margin-bottom:0.5rem">
                        Recipe <span class="mono">{r.recipe_version}</span> · equipment{' '}
                        <span class="mono">{r.equipment}</span> · site <span class="mono">{r.site}</span>
                      </p>
                      <dl class="t-small" style="margin:0 0 0.75rem">
                        <div class="spread">
                          <dt>Mass in</dt><dd class="mono" style="margin:0">{grams(r.mass_in_g)}</dd>
                        </div>
                        <div class="spread">
                          <dt>Mass out</dt><dd class="mono" style="margin:0">{grams(r.mass_out_g)}</dd>
                        </div>
                        <div class="spread">
                          <dt>Losses</dt>
                          <dd class="mono" style="margin:0">{r.losses_g == null ? 'not computed until close' : grams(r.losses_g)}</dd>
                        </div>
                      </dl>
                      <p class="row" style="gap:0.4rem">
                        <StateWord word={r.state === 'closed' ? 'Closed' : 'Open'}
                          icon={r.state === 'closed' ? <Icon name="lock" label="Closed" /> : null} />
                        {r.within_tolerance === false ? (
                          <StateWord word="Outside tolerance" heavy icon={<Icon name="warning" label="Warning" />} />
                        ) : null}
                        {(r.deviations || []).filter((d) => d.state === 'open').length ? (
                          <StateWord word="Deviation open" heavy />
                        ) : null}
                        {(r.flags || []).map((f) => (
                          <StateWord key={f} word={f} icon={<Icon name="flag" label="Flag" />} />
                        ))}
                      </p>
                    </Reveal>
                  ))
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      <nav class="row" style="margin-top:3rem" aria-label="Other console surfaces">
        <a class="btn btn-quiet" href="/console/lots">Lots</a>
        <a class="btn btn-quiet" href="/console/balance">Balance periods</a>
        <a class="btn btn-quiet" href="/console/contracts">Contracts</a>
        <a class="btn btn-quiet" href="/console/intake">Intake</a>
      </nav>
    </div>
  );
}
