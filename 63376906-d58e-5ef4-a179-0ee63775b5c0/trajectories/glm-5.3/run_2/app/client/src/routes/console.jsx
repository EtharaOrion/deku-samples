import { h } from "preact";
import { Link } from "../api.jsx";
import { useApi, Loading, Empty, Banner, Reveal, DocMeta, fmtG, fmtBP, fmtMg, dateOnly, Words, getToken } from "../api.jsx";

const stages = ["dissolution", "depolymerisation", "purification", "repolymerisation"];

function SchemeBanner() {
  const certs = useApi("/sites");
  return null;
}

export function ConsoleNav({ path }) {
  const links = [
    ["/console", "Board"],
    ["/console/intake", "Feedstock intake"],
    ["/console/record", "Operational record"],
    ["/console/reconciliation", "Reconciliation"],
    ["/console/certificates", "Certificates"],
  ];
  return (
    <nav class="topnav" aria-label="Console sections">
      {links.map(([href, label]) => (
        <Link href={href} aria-current={path === href || (href !== "/console" && path.startsWith(href)) ? "page" : null}>{label}</Link>
      ))}
    </nav>
  );
}

export function ConsoleFrame({ title, description, path, children }) {
  const me = useApi("/auth/me", [path]);
  return (
    <div>
      <DocMeta title={`${title} — Ravel console`} description={description} />
      <div class="container" style="padding-bottom:0.6rem">
        <p class="eyebrow">Console</p>
        <Reveal as="h1" style="margin:0">{title}</Reveal>
        {me.data && (
          <p class="body-small">
            Signed in as <span class="mono ref">{me.data.email}</span> · role{" "}
            <span class="grotesk">{(me.data.roles || []).join(", ")}</span> · sites{" "}
            <span class="mono ref">{(me.data.sites || []).join(", ")}</span> · grant ends{" "}
            <span class="mono ref">{me.data.grant_ends_on}</span>
          </p>
        )}
      </div>
      <div class="container" style="padding-top:0">{children}</div>
    </div>
  );
}

function RunCard({ run }) {
  return (
    <div class="card run-card" style="margin-top:0.7rem">
      <p class="eyebrow" style="margin:0">
        <span class="mono ref">{run.reference}</span> · stage <strong>{run.run_type}</strong>
      </p>
      <p class="body-regular" style="margin:0.3rem 0">
        <Words>{run.state}</Words>{" "}
        {run.state === "closed" && <>losses {fmtG(run.losses_g)}</>}
        {run.within_tolerance === false && <> · <Words>outside tolerance</Words></>}
        {run.queued_close && <> · <Words>close queued</Words></>}
      </p>
      <p class="body-small grotesk" style="margin:0">
        mass in {fmtG(run.mass_in_g)} · mass out {fmtG(run.mass_out_g)} · recipe{" "}
        <span class="mono ref">{run.recipe_version}</span>
      </p>
      {(run.flags || []).length > 0 && (
        <p class="body-small" style="margin:0.3rem 0 0">
          {(run.flags || []).map((f) => <Words>{f}</Words>)}
        </p>
      )}
      <p class="body-small" style="margin:0.4rem 0 0">
        <Link href={`/console/record/runs/${run.reference}`}>Open the run</Link>
      </p>
    </div>
  );
}

function Board() {
  const runs = useApi("/runs");
  const lots = useApi("/lots");
  return (
    <ConsoleFrame title="Board" description="One column per process stage, one card per run." path="/">
      {runs.loading ? <Loading /> : runs.error ? <Banner refusal>{runs.error.message}</Banner> : runs.data?.length ? (
        <div class="board">
          {stages.map((stage) => (
            <section class="column" aria-label={stage}>
              <h4 class="grotesk" style="margin-top:0">{stage}</h4>
              {runs.data.filter((r) => r.run_type === stage).length === 0 ? (
                <p class="body-small">No runs in this stage.</p>
              ) : (
                runs.data.filter((r) => r.run_type === stage).map((r) => <RunCard run={r} />)
              )}
            </section>
          ))}
        </div>
      ) : <Empty>There are no runs yet. A run opens from feedstock intake.</Empty>}

      <section class="section">
        <h2>Lots</h2>
        {lots.loading ? <Loading /> : lots.data?.length ? (
          <div class="tablewrap">
            <table>
              <thead>
                <tr><th>Lot</th><th>Grade</th><th>Site</th><th class="figure">Mass</th><th>Disposition</th><th>Claim type</th><th class="figure">Content</th><th>Flags</th></tr>
              </thead>
              <tbody>
                {lots.data.map((l) => (
                  <tr key={l.reference}>
                    <td><Link class="mono ref" href={`/console/record/lots/${l.reference}`}>{l.reference}</Link></td>
                    <td>{l.grade}</td>
                    <td class="mono ref">{l.site}</td>
                    <td class="figure mono">{fmtG(l.mass_g)}</td>
                    <td class="grotesk"><Words>{l.disposition}</Words></td>
                    <td class="grotesk">{l.claim_type}</td>
                    <td class="figure mono">{fmtBP(l.content_bp)} <span class="grotesk">({l.claim_type})</span></td>
                    <td>{(l.flags || []).map((f) => <Words>{f}</Words>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>There are no lots yet.</Empty>}
      </section>
    </ConsoleFrame>
  );
}

export default function Console(props) {
  const path = "/console" + (props.rest ? "/" + props.rest.replace(/^\/+/, "") : "");
  const token = getToken();

  if (!token) {
    // /console and everything under it redirect an anonymous reader to /login.
    if (typeof location !== "undefined" && location.pathname !== "/login") {
      location.replace("/login");
    }
    return <div class="container"><p class="body-regular">Redirecting to sign-in…</p></div>;
  }

  if (path === "/console" || path === "/console/") return <Board />;

  // Lazy-rendered sections
  if (path.startsWith("/console/intake")) {
    const Intake = require_intake();
    return <Intake {...props} />;
  }
  if (path.startsWith("/console/record")) {
    const RecordSection = require_record();
    return <RecordSection rest={props.rest.replace(/^record\/?/, "")} />;
  }
  if (path.startsWith("/console/reconciliation")) {
    const Recon = require_recon();
    return <Recon {...props} />;
  }
  if (path.startsWith("/console/certificates")) {
    const Certs = require_certs();
    return <Certs rest={props.rest.replace(/^certificates\/?/, "")} />;
  }
  if (path.startsWith("/console/balance")) {
    const Balance = require_balance();
    return <Balance rest={props.rest.replace(/^balance\/?/, "")} />;
  }
  if (path.startsWith("/console/lots/") && path.endsWith("/genealogy")) {
    const Genealogy = require_genealogy();
    const ref = path.replace("/console/lots/", "").replace("/genealogy", "");
    return <Genealogy reference={ref} />;
  }
  return <Board />;
}

// Sections are split by file; each is imported statically below to keep the
// bundle one chunk and the first paint small.
import Intake from "./console/intake.jsx";
import RecordSection from "./console/record.jsx";
import Recon from "./console/reconciliation.jsx";
import Certs from "./console/certificates.jsx";
import Balance from "./console/balance.jsx";
import Genealogy from "./genealogy.jsx";

const require_intake = () => Intake;
const require_record = () => RecordSection;
const require_recon = () => Recon;
const require_certs = () => Certs;
const require_balance = () => Balance;
const require_genealogy = () => Genealogy;
