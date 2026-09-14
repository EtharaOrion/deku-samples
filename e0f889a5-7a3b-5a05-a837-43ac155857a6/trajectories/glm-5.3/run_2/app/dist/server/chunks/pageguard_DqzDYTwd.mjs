import { b as bearerFrom, c as customerForToken } from "./cart_CB9dsG5b.mjs";
async function requirePageCustomer(context) {
  const cookieToken = context.cookies.get("vela_token")?.value ?? null;
  const header = context.request.headers.get("authorization");
  const bearer = bearerFrom(header);
  return customerForToken(cookieToken || bearer);
}
function signInRedirect(path) {
  return `/sign-in?redirect=${encodeURIComponent(path)}`;
}
export {
  requirePageCustomer as r,
  signInRedirect as s
};
