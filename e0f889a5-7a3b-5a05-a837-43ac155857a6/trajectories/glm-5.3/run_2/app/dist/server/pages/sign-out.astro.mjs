import { q } from "../chunks/pool_DifDkjYx.mjs";
import { s as sha256Hex } from "../chunks/crypto_BsBBFoSY.mjs";
import { renderers } from "../renderers.mjs";
const POST = async ({ cookies, request, redirect }) => {
  const token = cookies.get("vela_token")?.value;
  const header = request.headers.get("authorization");
  const bearer = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  for (const t of [token, bearer]) {
    if (t) await q("DELETE FROM auth_token WHERE token_hash = $1", [sha256Hex(t)]).catch(() => {
    });
  }
  cookies.delete("vela_token", { path: "/" });
  return redirect("/", 303);
};
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
