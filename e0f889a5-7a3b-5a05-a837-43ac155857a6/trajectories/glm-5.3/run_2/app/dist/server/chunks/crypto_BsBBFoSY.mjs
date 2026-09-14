import { scrypt, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scryptAsync = promisify(scrypt);
function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}
function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}
async function verifyPassword(password, stored) {
  const [scheme, salt, hex] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const derived = await scryptAsync(password, salt, 64);
  const expected = Buffer.from(hex, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}
export {
  hashPassword as h,
  randomToken as r,
  sha256Hex as s,
  verifyPassword as v
};
