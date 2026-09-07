import { api } from '../api.js';
import { useAsync, Loading, Empty, StateWord, words, CarbonFigure, EnergyPair } from '../ui.jsx';

export default function CarbonView({ session, params }) {
  const reference = params.reference;
  const c = useAsync(() => api(`/lots/${reference}/carbon`), [reference]);
  const d = c.data;

  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Carbon</p>
        <h1 class="t-h3 mono">{reference}</h1>
        <p class="t-big">
          Inside the console the breakdown is always returned. A response carrying the aggregate
          value with no breakdown behind it does not exist here.
        </p>
      </div>

      {c.loading ? <Loading what="the carbon figure" /> : null}
      {c.error && c.error.status === 409 ? (
        <div class="banner" role="alert">
          <p class="t-eyebrow">Allocation basis mismatch</p>
          <p style="margin-bottom:0"><strong>{c.error.body.message}</strong></p>
        </div>
      ) : null}
      {c.error && c.error.status === 404 ? (
        <Empty>No carbon figure exists for this lot.</Empty>
      ) : null}

      {d ? (
        <>
          <section aria-labelledby="v">
            <h2 id="v" class="t-h4">The figure</h2>
            <p style="font-size:var(--size-h3);line-height:var(--lh-h3)" class="figure mono">
              {d.value_mg_per_kg.toLocaleString('en-GB')}
            </p>
            <p class="t-big">
              mg CO₂e per kg of product, on {d.boundary}, under {d.method_version}, with an
              uncertainty of {d.uncertainty_bp} basis points.
            </p>
            <p class="row">
              <StateWord word={d.default_led ? 'Default-led' : 'Not default-led'} heavy={d.default_led} />
              <StateWord word={d.cache_valid ? 'Cache valid' : 'Cache invalid'} heavy={!d.cache_valid} />
            </p>
            <p class="t-small" style="color:var(--muted)">
              The primary-data share is {d.primary_share_bp} basis points against a threshold of{' '}
              {d.primary_threshold_bp}. {d.default_led
                ? 'Below the threshold, so this figure is default-led and is not presented as though it were metered.'
                : 'Above the threshold, so this figure is not labelled as default-led.'}
            </p>
          </section>

          <section aria-labelledby="cmp" style="margin-top:2.5rem">
            <h2 id="cmp" class="t-h4">The comparator</h2>
            <p class="t-big">{d.comparator_statement}</p>
            <dl class="def">
              <dt>Material</dt><dd>{d.comparator.material}</dd>
              <dt>Dataset</dt><dd>{d.comparator.dataset}</dd>
              <dt>Dataset year</dt><dd class="mono">{d.comparator.dataset_year}</dd>
              <dt>Region</dt><dd class="mono">{d.comparator.region}</dd>
            </dl>
          </section>

          <section aria-labelledby="bd" style="margin-top:2.5rem">
            <h2 id="bd" class="t-h4">The breakdown</h2>
            <div class="table-scroll">
              <table>
                <caption>
                  The lines sum to the value: {d.breakdown_sum_mg_per_kg.toLocaleString('en-GB')} mg
                  CO₂e per kg.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Line</th>
                    <th scope="col" class="num">mg CO₂e/kg</th>
                    <th scope="col">Tag</th>
                  </tr>
                </thead>
                <tbody>
                  {d.breakdown.map((b) => (
                    <tr key={b.line}>
                      <th scope="row">{words(b.line)}</th>
                      <td class="num">{Number(b.mg_per_kg).toLocaleString('en-GB')}</td>
                      <td>{words(b.tag)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">Total</th>
                    <td class="num"><strong>{d.breakdown_sum_mg_per_kg.toLocaleString('en-GB')}</strong></td>
                    <td>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="en" style="margin-top:2.5rem">
            <h2 id="en" class="t-h4">The energy panel</h2>
            <p class="t-small" style="color:var(--muted)">
              Location-based and market-based side by side, never one alone.
            </p>
            <EnergyPair location={d.energy_location_mg_per_kg} market={d.energy_market_mg_per_kg} />
            <div class="figure-rows" style="margin-top:1.5rem">
              <div class="figure-row">
                <p class="t-label" style="margin:0">Metered consumption</p>
                <p class="figure mono" style="margin:0">{d.metered_kwh.toLocaleString('en-GB')} kWh</p>
                <p class="t-small" style="margin:0">For the period.</p>
              </div>
              <div class="figure-row">
                <p class="t-label" style="margin:0">Retired</p>
                <p class="figure mono" style="margin:0">{d.retired_kwh.toLocaleString('en-GB')} kWh</p>
                <p class="t-small" style="margin:0">Instruments applied against the period.</p>
              </div>
              <div class="figure-row">
                <p class="t-label" style="margin:0">Unmatched</p>
                <p class="figure mono" style="margin:0">{d.unmatched_kwh.toLocaleString('en-GB')} kWh</p>
                <p class="t-small" style="margin:0">Named rather than absorbed.</p>
              </div>
            </div>
            <h3 class="t-h4" style="margin-top:1.5rem">Retired instruments</h3>
            {d.retired_instruments.length === 0 ? (
              <Empty>No instrument has been applied against this period.</Empty>
            ) : (
              <div class="table-scroll">
                <table>
                  <caption>An instrument is refused when it is not retired, or its vintage or region does not match.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Instrument</th>
                      <th scope="col" class="num">Quantity</th>
                      <th scope="col" class="num">Vintage</th>
                      <th scope="col">Region</th>
                      <th scope="col">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.retired_instruments.map((i) => (
                      <tr key={i.reference}>
                        <th scope="row" class="mono">{i.reference}</th>
                        <td class="num">{i.quantity_kwh.toLocaleString('en-GB')} kWh</td>
                        <td class="num">{i.vintage}</td>
                        <td class="mono">{i.region}</td>
                        <td><StateWord word={words(i.state)} quiet /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="iv" style="margin-top:2.5rem">
            <h2 id="iv" class="t-h4">The versions this figure was computed against</h2>
            <dl class="def">
              {Object.entries(d.input_versions || {}).map(([k, v]) => (
                <><dt key={k}>{words(k)}</dt><dd class="mono">{Array.isArray(v) ? v.join(', ') : String(v)}</dd></>
              ))}
              <dt>Standard</dt><dd>{d.standard}</dd>
              <dt>Functional unit</dt><dd>{d.functional_unit}</dd>
              <dt>Allocation basis</dt><dd>{d.allocation_basis}</dd>
              <dt>Reviewer</dt><dd>{d.reviewer}</dd>
            </dl>
          </section>
        </>
      ) : null}
    </div>
  );
}
