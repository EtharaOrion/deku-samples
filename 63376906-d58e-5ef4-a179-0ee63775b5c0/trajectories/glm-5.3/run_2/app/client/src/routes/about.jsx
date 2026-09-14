import { h } from "preact";
import { useApi, Reveal, DocMeta, Loading, Empty } from "../api.jsx";

export default function About() {
  const stats = useApi("/statistics");
  return (
    <div>
      <DocMeta
        title="About — Ravel Materials"
        description="Three statistics under The hard facts, each with its source, its year and its geography beside it."
      />
      <section class="container">
        <p class="eyebrow">About</p>
        <Reveal as="h1">Ravel Materials SAS</Reveal>
        <p class="body-big">
          We return mixed polyamide waste to virgin-quality polymer, and we publish the
          record behind every claim we make.
        </p>
      </section>

      <section class="container section">
        <Reveal as="h2">The hard facts</Reveal>
        {stats.loading ? <Loading /> : stats.data?.length ? (
          <div class="grid-3">
            {stats.data.map((s) => (
              <div class="card" key={s.key}>
                <p class="body-big" style="margin-top:0">{s.value}</p>
                <p class="body-small grotesk" style="margin-bottom:0">
                  {s.source} · {s.year} · {s.geography}
                </p>
              </div>
            ))}
          </div>
        ) : <Empty>No published figures are held right now.</Empty>}
        <p class="body-small">
          The plastics figure is stated as a mass: 1.8 gigatonnes of carbon dioxide
          equivalent a year, from plastics production, globally, measured in 2023.
        </p>
      </section>

      <section class="container section">
        <Reveal as="h2">What we hold ourselves to</Reveal>
        <p class="body-regular">
          Every recycled-content figure we publish is a mass-balance figure. It is computed
          from a ledger of credits granted at consumption and attached to lots, and it is
          never a number somebody chose. Losses reduce the claim: material that disappears
          in processing does not carry its claim forward.
        </p>
        <p class="body-regular">
          Every carbon figure carries its boundary, its method version and its uncertainty,
          and the two energy figures always appear together. A certificate that rests on a
          provisional conversion factor says so on its face.
        </p>
      </section>
    </div>
  );
}
