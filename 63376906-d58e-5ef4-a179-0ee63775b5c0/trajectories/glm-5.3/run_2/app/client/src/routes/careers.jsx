import { h } from "preact";
import { useApi, Reveal, DocMeta, Loading, Empty } from "../api.jsx";

export default function Careers() {
  const positions = useApi("/positions");
  const count = positions.data?.length ?? 0;
  return (
    <div>
      <DocMeta
        title="Careers — one open position at Ravel"
        description="Why this problem matters, and the roles we are hiring for today."
      />
      <section class="container">
        <p class="eyebrow">Careers</p>
        <Reveal as="h1">Why this problem matters</Reveal>
        <p class="body-big">
          Less than one per cent of textiles are recycled into new materials. The rest is
          burned, buried or shipped somewhere else to become somebody else's problem.
        </p>
        <p class="body-regular">
          Polyamide is the one common polymer that can be returned to its own monomer at
          mild conditions, which makes the obstacle engineering and economics rather than
          chemistry. The work is unglamorous, exacting and measured in grams, basis points
          and basis versions — and the record it leaves behind is the product.
        </p>
      </section>

      <section class="container section">
        <Reveal as="h2">Open positions</Reveal>
        <p class="body-regular">
          {count === 1
            ? "There is 1 open position."
            : `There are ${count} open positions.`}
        </p>
        {positions.loading ? <Loading /> : count === 0 ? (
          <Empty>There are no open positions right now. Write to us anyway: partnerships@example.com.</Empty>
        ) : (
          <div class="tablewrap">
            <table>
              <thead>
                <tr><th>Title</th><th>Location</th><th>Department</th><th>Contract</th><th>Closes</th></tr>
              </thead>
              <tbody>
                {positions.data.map((p) => (
                  <tr key={p.id}>
                    <td>{p.title}</td>
                    <td>{p.location}</td>
                    <td>{p.department}</td>
                    <td>{p.contract_type}</td>
                    <td class="mono ref">{p.closes_on}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
