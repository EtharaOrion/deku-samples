import { Hono } from 'hono';
import auth from './auth.js';
import reference from './reference.js';
import batches from './batches.js';
import runs from './runs.js';
import lots from './lots.js';
import balance from './balance.js';
import carbon from './carbon.js';
import certificates from './certificates.js';
import record from './record.js';
import inbound from './inbound.js';
import contracts from './contracts.js';
import publicRoutes from './public.js';

const api = new Hono();

api.route('/auth', auth);
api.route('/', publicRoutes);
api.route('/', reference);
api.route('/', batches);
api.route('/', runs);
api.route('/', lots);
api.route('/', balance);
api.route('/', carbon);
api.route('/', certificates);
api.route('/', record);
api.route('/', inbound);
api.route('/', contracts);

export default api;
