import { Hono } from 'hono';
import { attachSession, refuseAuditorWrites } from './middleware.js';
import core from './core.js';
import operations from './operations.js';
import ledger from './ledger.js';
import carbon from './carbon.js';
import certificates from './certificates.js';
import record from './record.js';
import commerce from './commerce.js';

const api = new Hono();

api.use('*', attachSession);
api.use('*', refuseAuditorWrites);

api.route('/', certificates);
api.route('/', record);
api.route('/', core);
api.route('/', operations);
api.route('/', ledger);
api.route('/', carbon);
api.route('/', commerce);

export default api;
