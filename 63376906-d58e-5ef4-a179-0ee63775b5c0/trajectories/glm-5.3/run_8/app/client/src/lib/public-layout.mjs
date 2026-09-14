import { h } from "preact";
import { link } from "../router.mjs";
import { setMeta } from "../lib/meta.mjs";

export default function PublicLayout({ path, children }) {
  setMeta(path);
  const items = [
    ["/product", "Product"],
    ["/technology", "Technology"],
    ["/about", "About"],
    ["/careers", "Careers"],
    ["/news", "News"],
    ["/contact", "Contact"],
  ];
  const nav = items.map(([href, label], i) =>
    h("li", { key: href, class: path === href ? "is-here" : null }, h("a", { href, "aria-current": path === href ? "page" : null }, label))
  );
  return h("div", { class: "page" }, [
    h("a", { class: "skip", href: "#main" }, "Skip to content"),
    h("header", { class: "topbar" }, [
      h("div", { class: "topbar-in" }, [
        h("a", { class: "wordmark", href: "/", "aria-label": "Ravel home" }, "Ravel"),
        h("nav", { "aria-label": "Public" }, h("ul", { class: "nav" }, nav)),
      ]),
    ]),
    h("main", { id: "main" }, children),
    h("footer", { class: "sitefoot" }, [
      h("div", { class: "foot-in" }, [
        h("p", { class: "foot-mark" }, "Ravel"),
        h("ul", { class: "foot-links" }, [
          h("li", null, h("a", { href: "/privacy" }, "Privacy")),
          h("li", null, h("a", { href: "/news" }, "News")),
          h("li", null, h("a", { href: "/contact" }, "Contact")),
        ]),
        h("p", { class: "foot-note" }, "Ravel Materials SAS. Verify a certificate at ravel.example.com/verify/{number}."),
      ]),
    ]),
  ]);
}
