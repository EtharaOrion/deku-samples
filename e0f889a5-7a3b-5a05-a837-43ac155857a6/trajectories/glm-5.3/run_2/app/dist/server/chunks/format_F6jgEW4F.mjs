function money(minor) {
  if (minor === null || minor === void 0) return "—";
  const abs = Math.abs(Math.trunc(minor));
  return `${minor < 0 ? "-" : ""}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}
function bytesExact(size) {
  return `${size.toLocaleString("en-US")} bytes`;
}
function longDate(iso) {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}
function shortDate(iso) {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
function orderChip(order) {
  if (order.status === "cancelled") return "Cancelled";
  if (order.status === "pending") return "Awaiting payment";
  if (order.payment_status === "invoiced" && order.fulfilment_status === "fulfilled") return "Confirmed and fulfilled";
  if (order.payment_status === "invoiced") return "Confirmed, awaiting dispatch";
  return "Confirmed";
}
export {
  bytesExact as b,
  longDate as l,
  money as m,
  orderChip as o,
  shortDate as s
};
