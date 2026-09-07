import { s as sessionTokenFrom, o as originFrom } from '../chunks/api_eUbQd3xF.mjs';
export { renderers } from '../renderers.mjs';

const POST = async ({ request }) => {
  const token = sessionTokenFrom(request);
  if (token) {
    await fetch(`${originFrom(request)}/api/auth/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` }
    }).catch(() => {
    });
  }
  return new Response(null, {
    status: 302,
    headers: {
      location: "/",
      "set-cookie": "vela_session=; path=/; max-age=0; samesite=lax"
    }
  });
};
const GET = () => new Response(null, { status: 302, headers: { location: "/" } });

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
