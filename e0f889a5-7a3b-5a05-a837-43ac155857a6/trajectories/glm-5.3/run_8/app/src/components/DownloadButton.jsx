export default function DownloadButton({ label, artifact, version }) {
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '');
  const href = `/downloads/file/${artifact}`;
  return (
    <span class="dl-wrap">
      <a class="btn btn-primary" href={href} download={artifact}>{label}</a>
      {!isMac ? <span class="muted small platform-note">Arranger is a macOS application.</span> : null}
    </span>
  );
}
