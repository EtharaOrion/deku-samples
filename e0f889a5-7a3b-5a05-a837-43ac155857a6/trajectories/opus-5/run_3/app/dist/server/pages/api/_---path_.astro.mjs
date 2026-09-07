import { c as api } from '../../chunks/app_BbZzWQ31.mjs';
export { renderers } from '../../renderers.mjs';

const prerender = false;
const handle = ({
  request
}) => api.fetch(request);
const GET = handle;
const POST = handle;
const PUT = handle;
const PATCH = handle;
const DELETE = handle;
const OPTIONS = handle;
const HEAD = handle;
const ALL = handle;

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	ALL,
	DELETE,
	GET,
	HEAD,
	OPTIONS,
	PATCH,
	POST,
	PUT,
	prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
