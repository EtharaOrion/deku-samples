export const META = {
  "/": { title: "Ravel — Tomorrow's materials, made from today's waste", description: "Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon." },
  "/product": { title: "Product — Ravel", description: "Low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise." },
  "/technology": { title: "Technology — Ravel", description: "Dissolution, depolymerisation, purification and repolymerisation, from waste to virgin-quality pellet." },
  "/about": { title: "About — Ravel", description: "The hard facts behind Ravel, with the source, year and geography of every published figure." },
  "/careers": { title: "Careers — Ravel", description: "Open positions at Ravel, and why this problem matters." },
  "/news": { title: "News — Ravel", description: "News from Ravel: funding, partnership, technical and recognition." },
  "/contact": { title: "Contact — Ravel", description: "Waste supply, polymer purchase, partnership and press enquiries, with stated response times." },
  "/privacy": { title: "Privacy — Ravel", description: "What Ravel collects, why, for how long, and how to have it removed." },
};

export function setMeta(path, extra) {
  const m = META[path] || { title: "Ravel", description: "Ravel produces low-carbon, virgin-quality recycled polymers." };
  const t = extra ? extra.title || m.title : m.title;
  const d = extra ? extra.description || m.description : m.description;
  document.title = t;
  let el = document.querySelector('meta[name="description"]');
  if (!el) { el = document.createElement("meta"); el.name = "description"; document.head.appendChild(el); }
  el.content = d;
  let robots = document.querySelector('meta[name="robots"]');
  if (!robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.appendChild(robots); }
  robots.content = "index,follow";
}

export function setNoIndex() {
  document.title = "Verify a certificate — Ravel";
  let el = document.querySelector('meta[name="description"]');
  if (!el) { el = document.createElement("meta"); el.name = "description"; document.head.appendChild(el); }
  el.content = "Certificate verification";
  let robots = document.querySelector('meta[name="robots"]');
  if (!robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.appendChild(robots); }
  robots.content = "noindex,nofollow";
}
