import { api } from '../api.js';
import { Reveal, useAsync, useTitle, Loading, Empty } from '../ui.jsx';

export default function Careers() {
  useTitle(
    'Careers — Why this problem matters',
    'Open roles at Ravel, and why the problem is worth the years it will take.'
  );
  const positions = useAsync(() => api('/positions'));
  // The count is rendered from the collection it labels.
  const count = positions.data ? positions.data.length : null;

  return (
    <div class="page stack-lg" style="padding-top:3.5rem">
      <Reveal as="section" className="narrow">
        <p class="t-eyebrow">Careers</p>
        <h1 class="t-h2">Why this problem matters</h1>
        <p class="t-big">
          Polyamide is a good material that we throw away. It does not wear out at the molecular
          level; the article wears out, and then the molecule goes to an incinerator or a hole in
          the ground. Solving that is not a marketing problem and it is not a software problem.
          It is a chemistry problem with a bookkeeping problem bolted to it, and the bookkeeping
          problem is the one nobody wants.
        </p>
        <p>
          The chemistry has to work at contaminated, mixed, coloured, real waste rather than at a
          clean single stream, because a clean single stream is a different and much smaller
          business. The bookkeeping has to hold up in front of a market-surveillance authority
          ten years after the person who ran the plant has left.
        </p>
        <p>
          If you want a place where the arithmetic is taken seriously, where a figure that cannot
          say where it came from is not returned, and where a claim rounded up is treated as a
          claim the ledger cannot support, this is that place.
        </p>
      </Reveal>

      <Reveal as="section">
        <h2 class="t-h3">
          Open positions{count !== null ? <> <span class="mono">({count})</span></> : null}
        </h2>
        {positions.loading ? <Loading what="the open roles" /> : null}
        {positions.data && positions.data.length === 0 ? (
          <Empty>There is no open position at the moment. There is nothing to show here yet.</Empty>
        ) : null}
        {positions.data && positions.data.length > 0 ? (
          <div class="table-scroll">
            <table>
              <caption>
                {count === 1 ? 'One open role.' : `${count} open roles.`} The count above is
                rendered from this collection.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Location</th>
                  <th scope="col">Department</th>
                  <th scope="col">Contract</th>
                  <th scope="col">Closes</th>
                </tr>
              </thead>
              <tbody>
                {positions.data.map((p) => (
                  <tr key={p.reference}>
                    <th scope="row">{p.title}</th>
                    <td>{p.location}</td>
                    <td>{p.department}</td>
                    <td>{p.contract_type}</td>
                    <td class="mono">{p.closes_on}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p style="margin-top:1.5rem">
          To apply, write through <a href="/contact">the contact route</a> choosing a partnership
          enquiry, or to the address on that page.
        </p>
      </Reveal>
    </div>
  );
}
