import { useApi } from '../lib.jsx';

const ORDER = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];
const LABEL = {
  dissolution: 'Dissolution',
  depolymerisation: 'Depolymerisation',
  purification: 'Purification',
  repolymerisation: 'Repolymerisation',
};

// The plant is drawn rather than photographed, and the diagram is generated
// from the four run types so it stays correct when a stage changes. It carries
// mass in and mass out per stage, and gets its text equivalent for free.
export function PlantDiagram() {
  const runs = useApi('/process-stages');
  const stages = ORDER.map((t) => {
    const row = (runs.data || []).find((r) => r.stage === t) || { mass_in_g: 0, mass_out_g: 0, losses_g: 0, runs: 0 };
    return { type: t, label: LABEL[t], mass_in_g: row.mass_in_g, mass_out_g: row.mass_out_g, losses_g: row.losses_g, runs: row.runs };
  });
  const known = (runs.data || []).length > 0;
  const fmt = (n) => `${Number(n).toLocaleString('en-GB')} g`;

  const W = 960;
  const H = 250;
  const boxW = 190;
  const gap = (W - 4 * boxW) / 5;

  return (
    <figure style="margin:1.5rem 0">
      <svg class="diagram" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="diagram-title diagram-desc" preserveAspectRatio="xMidYMid meet">
        <title id="diagram-title">The four process stages, with mass in and mass out at each</title>
        <desc id="diagram-desc">
          {known
            ? stages.map((s) => `${s.label}: ${fmt(s.mass_in_g)} in, ${fmt(s.mass_out_g)} out, ${fmt(s.losses_g)} lost.`).join(' ')
            : 'The masses per stage are not loaded, so the diagram shows the four stages without figures.'}
        </desc>
        {stages.map((s, i) => {
          const x = gap + i * (boxW + gap);
          return (
            <g key={s.type}>
              <rect x={x} y="52" width={boxW} height="120" rx="6" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.5" />
              <text x={x + boxW / 2} y="82" text-anchor="middle" font-family="var(--grotesk)" font-size="15" font-weight="600" fill="var(--ink)">
                {s.label}
              </text>
              <text x={x + boxW / 2} y="110" text-anchor="middle" font-family="var(--mono)" font-size="13" fill="var(--ink)">
                {known ? `in ${s.mass_in_g.toLocaleString('en-GB')} g` : 'in —'}
              </text>
              <text x={x + boxW / 2} y="130" text-anchor="middle" font-family="var(--mono)" font-size="13" fill="var(--ink)">
                {known ? `out ${s.mass_out_g.toLocaleString('en-GB')} g` : 'out —'}
              </text>
              <text x={x + boxW / 2} y="152" text-anchor="middle" font-family="var(--mono)" font-size="12" fill="var(--muted)">
                {known ? `lost ${s.losses_g.toLocaleString('en-GB')} g` : 'lost —'}
              </text>
              {i < 3 ? (
                <g>
                  <line x1={x + boxW + 4} y1="112" x2={x + boxW + gap - 10} y2="112" stroke="var(--ink)" stroke-width="1.5" />
                  <path d={`M${x + boxW + gap - 14} 106 L${x + boxW + gap - 6} 112 L${x + boxW + gap - 14} 118`} fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </g>
              ) : null}
            </g>
          );
        })}
        <text x={gap} y="34" font-family="var(--grotesk)" font-size="13" font-weight="600" fill="var(--muted)">
          Waste in
        </text>
        <text x={W - gap} y="34" text-anchor="end" font-family="var(--grotesk)" font-size="13" font-weight="600" fill="var(--muted)">
          Pellet out
        </text>
        <text x={gap} y="206" font-family="var(--grotesk)" font-size="13" fill="var(--muted)">
          Losses reduce the claim.
        </text>
      </svg>
      <figcaption class="note" style="margin-top:0.75rem">
        The four stages, with mass in and mass out at each, generated from the run records rather than drawn by hand.
        {runs.loading ? ' The figures are loading.' : ''}
      </figcaption>
      <div class="scroller" style="margin-top:1rem">
        <table>
          <caption class="visually-hidden">The same four stages as a table</caption>
          <thead>
            <tr>
              <th scope="col">Stage</th>
              <th scope="col" class="num">Mass in</th>
              <th scope="col" class="num">Mass out</th>
              <th scope="col" class="num">Losses</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s) => (
              <tr key={s.type}>
                <th scope="row" style="font-family:var(--serif);text-transform:none;letter-spacing:0;color:var(--ink);font-weight:600;font-size:var(--size-body-small)">
                  {s.label}
                </th>
                <td class="num">{known ? s.mass_in_g.toLocaleString('en-GB') : '—'}</td>
                <td class="num">{known ? s.mass_out_g.toLocaleString('en-GB') : '—'}</td>
                <td class="num">{known ? s.losses_g.toLocaleString('en-GB') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
