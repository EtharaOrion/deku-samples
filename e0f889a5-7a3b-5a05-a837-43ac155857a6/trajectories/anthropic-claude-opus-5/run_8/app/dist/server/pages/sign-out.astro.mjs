import { a as apiFetch } from '../chunks/api_-Wd5sQnB.mjs';
export { renderers } from '../renderers.mjs';

const POST = async (context) => {
  await apiFetch(context, "/api/auth/logout", { method: "POST" });
  return context.redirect("/", 303);
};
const GET = async (context) => context.redirect("/", 303);

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
