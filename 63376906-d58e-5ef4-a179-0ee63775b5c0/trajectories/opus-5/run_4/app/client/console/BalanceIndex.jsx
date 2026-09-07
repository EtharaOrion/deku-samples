import { api } from '../api.js';
import { useAsync, Loading, Empty, StateWord, Icon, grams, words } from '../ui.jsx';

export default function BalanceIndex({ session }) {
  const periods = useAsync(() => api('/balance-periods'));
  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Balance</p>
        <h1 class="t-h3">Balance periods</h1>
        <p class="t-big">Per site, per grade and per period. A balance is the sum of its movements.</p>
      </div>
      {periods.loading ? <Loading what="the balance periods" /> : null}
      {periods.data && periods.data.length === 0 ? <Empty>No balance period exists.</Empty> : null}
      {periods.data && periods.data.length > 0 ? (
        <div class="table-scroll">
          <table>
            <caption>{periods.data.length} periods.</caption>
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">Site</th>
                <th scope="col">Grade</th>
                <th scope="col">Window</th>
                <th scope="col">State</th>
                <th scope="col" class="num">Post-consumer available</th>
                <th scope="col" class="num">Pre-consumer available</th>
              </tr>
            </thead>
            <tbody>
              {periods.data.map((p) => (
                <tr key={p.id}>
                  <th scope="row" class="mono"><a href={`/console/balance/${p.id}`}>{p.id}</a></th>
                  <td class="mono">{p.site}</td>
                  <td class="mono">{p.grade}</td>
                  <td class="mono t-small">{p.period.from} → {p.period.to}</td>
                  <td>
                    <StateWord
                      word={p.state === 'closed' ? 'Closed' : 'Open'}
                      heavy={p.state === 'closed'}
                      icon={p.state === 'closed' ? <Icon name="lock" label="Closed" /> : null}
                    />
                  </td>
                  <td class="num">{p.post_consumer.credits_available_g.toLocaleString('en-GB')}</td>
                  <td class="num">{p.pre_consumer.credits_available_g.toLocaleString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
