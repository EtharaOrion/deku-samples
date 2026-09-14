import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api } from "../lib/api.mjs";
import { setNoIndex } from "../lib/meta.mjs";

export default function Verify({ params }) {
  const number = params.number || "";
  setNoIndex();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let live = true;
    setData(null); setErr(null);
    api("/verify/" + encodeURIComponent(number))
      .then((d) => live && setData(d))
      .catch((e) => live && setErr(e));
    return () => { live = false; };
  }, [number]);

  return h("div", { class: "page" }, [
    h("header", { class: "topbar" }, h("div", { class: "topbar-in" }, [
      h("a", { class: "wordmark", href: "/", "aria-label": "Ravel home" }, "Ravel"),
      h("nav", { "aria-label": "Public" }, h("ul", { class: "nav" }, [
        h("li", null, h("a", { href: "/technology" }, "Technology")),
        h("li", null, h("a", { href: "/contact" }, "Contact")),
      ])),
    ])),
    h("main", { id: "main", class: "verify-main" }, [
      h("div", { class: "frame" }, [
        h("p", { class: "eyebrow" }, "Certificate verification"),
        h("h1", { class: "h3" }, h("span", { class: "mono" }, number)),
        !data && !err ? h("p", { class: "loading", role: "status" }, "Loading…") : null,
        err ? h("p", { class: "empty" }, "The verification service could not be reached. Try again shortly, or write to security@example.com.") : null,
        data && data.found === false
          ? h("div", { class: "verify-notfound" }, [
              h("p", null, "There is no certificate with this number on this register."),
              h("p", { class: "quiet" }, "Check the number against the document. A certificate number looks like CERT-PILOT-000001."),
            ])
          : null,
        data && data.found
          ? h("div", { class: "verify-found" }, [
              data.state === "withdrawn"
                ? h("div", { class: "banner banner-withdrawn", role: "alert" }, [
                    h("p", { class: "banner-title" }, "Withdrawn"),
                    h("p", null, "This certificate was withdrawn on " + data.withdrawn_on + ". Reason: " + data.withdrawal_reason + "."),
                  ])
                : h("p", { class: "state-line" }, "State: " + data.state),
              h("dl", { class: "verify-dl" }, [
                dtdd("Number", data.number),
                dtdd("Issued on", data.issued_on),
                dtdd("Site", data.site),
                dtdd("Grade", data.grade),
                dtdd("Claim type", data.claim_type),
                dtdd("Recipient", data.recipient_name),
              ]),
            ])
          : null,
      ]),
    ]),
    footer(),
  ]);
}

function dtdd(t, d) { return [h("dt", null, t), h("dd", { class: "mono" }, d === null || d === undefined ? "—" : String(d))]; }
function footer() {
  return h("footer", { class: "sitefoot" }, h("div", { class: "foot-in" }, [
    h("p", { class: "foot-mark" }, "Ravel"),
    h("p", { class: "foot-note" }, "Verify this certificate at ravel.example.com/verify/{number}."),
  ]));
}
