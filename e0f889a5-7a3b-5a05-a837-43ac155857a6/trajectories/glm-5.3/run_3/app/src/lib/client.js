// Thin fetch wrapper used by every island. Cart token lives in localStorage;
// bearer token too. All money stays in minor units end to end.
const B = '';

async function call(path, { method = 'GET', body, headers = {} } = {}) {
  const cartToken = localStorage.getItem('vela_cart_token');
  const token = localStorage.getItem('vela_token');
  const h = { ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (cartToken) h['x-cart-token'] = cartToken;
  if (token) h['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: { code: 'bad_json', message: text } }; }
  if (!res.ok) {
    const err = new Error((data && data.error && data.error.message) || 'That did not work.');
    err.code = data && data.error && data.error.code;
    err.status = res.status;
    err.request_id = data && data.error && data.error.request_id;
    err.data = data;
    throw err;
  }
  if (data && data.cart_token) localStorage.setItem('vela_cart_token', data.cart_token);
  return data;
}

export const api = {
  get: (p) => call(p),
  post: (p, body, headers) => call(p, { method: 'POST', body, headers }),
  patch: (p, body) => call(p, { method: 'PATCH', body }),
  del: (p) => call(p, { method: 'DELETE' })
};

export const cartCount = () => Number(localStorage.getItem('vela_cart_count') || 0);
export const setCartCount = (n) => { localStorage.setItem('vela_cart_count', String(n)); document.dispatchEvent(new CustomEvent('vela:cart')); };
export const authToken = () => localStorage.getItem('vela_token');
export const authCustomer = () => { try { return JSON.parse(localStorage.getItem('vela_customer') || 'null'); } catch { return null; } };
export const setAuth = (token, customer) => { localStorage.setItem('vela_token', token); localStorage.setItem('vela_customer', JSON.stringify(customer)); };
export const clearAuth = () => { localStorage.removeItem('vela_token'); localStorage.removeItem('vela_customer'); };
