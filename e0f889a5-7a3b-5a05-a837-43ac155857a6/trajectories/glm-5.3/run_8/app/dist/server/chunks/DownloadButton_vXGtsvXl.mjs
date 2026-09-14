import { jsxs, jsx } from "preact/jsx-runtime";
function DownloadButton({
  label,
  artifact,
  version
}) {
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || navigator.userAgent || "");
  const href = `/downloads/file/${artifact}`;
  return jsxs("span", {
    class: "dl-wrap",
    children: [jsx("a", {
      class: "btn btn-primary",
      href,
      download: artifact,
      children: label
    }), !isMac ? jsx("span", {
      class: "muted small platform-note",
      children: "Arranger is a macOS application."
    }) : null]
  });
}
export {
  DownloadButton as D
};
