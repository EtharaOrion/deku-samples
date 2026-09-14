import "./pool_DifDkjYx.mjs";
import { f as findOrCreateCart, a as cartView, c as customerForToken } from "./cart_CB9dsG5b.mjs";
async function getCustomer(context) {
  const bearer = context.request.headers.get("authorization");
  const cookie = context.cookies.get("vela_token")?.value ?? null;
  return customerForToken(bearer || cookie);
}
async function getCartForContext(context) {
  const token = context.cookies.get("vela_cart")?.value ?? null;
  if (!token) return null;
  const cart = await findOrCreateCart({ token });
  if (!cart) return null;
  return { row: cart, view: await cartView(cart) };
}
async function ensureCartCookie(context) {
  let token = context.cookies.get("vela_cart")?.value ?? null;
  if (!token) {
    const cart = await findOrCreateCart({ token: null });
    token = cart.token;
    context.cookies.set("vela_cart", token, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  }
  return token;
}
export {
  getCustomer as a,
  ensureCartCookie as e,
  getCartForContext as g
};
