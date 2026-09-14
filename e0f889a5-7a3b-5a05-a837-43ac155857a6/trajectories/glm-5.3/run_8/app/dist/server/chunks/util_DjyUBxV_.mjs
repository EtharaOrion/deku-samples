import { createHash, randomBytes } from "node:crypto";
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const randomToken = (bytes = 24) => randomBytes(bytes).toString("base64url");
function minorToDecimal(minor) {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minor));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
function money(minor) {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minor));
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
const taxOf = (subtotalMinor) => Math.trunc(subtotalMinor * 0.1);
const SERIAL_RE = /^(VA|VC)\d{2}[0-9]{2}[2-9A-HJ-NP-Z]{6}$/;
function normalizeSerial(s) {
  return String(s || "").toUpperCase().replace(/\s+/g, "");
}
function versionGt(a, b) {
  if (!a) return false;
  const pa = String(a).split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}
function versionLt(a, b) {
  return a !== b && versionGt(b, a);
}
export {
  SERIAL_RE as S,
  money as a,
  minorToDecimal as m,
  normalizeSerial as n,
  randomToken as r,
  sha256 as s,
  taxOf as t,
  versionLt as v
};
