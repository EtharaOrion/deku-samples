export function route(pattern) {
  // '/console/certificates/new/lot' -> matcher capturing named parts
  const names = [];
  const rx = new RegExp(
    "^" +
      pattern
        .split("/")
        .map((seg) => {
          if (seg.startsWith(":")) { names.push(seg.slice(1)); return "([^/]+)"; }
          return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("/") +
      "$"
  );
  return (path) => {
    const m = rx.exec(path);
    if (!m) return null;
    const out = {};
    names.forEach((n, i) => (out[n] = decodeURIComponent(m[i + 1])));
    return out;
  };
}

export function link(path) {
  history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
