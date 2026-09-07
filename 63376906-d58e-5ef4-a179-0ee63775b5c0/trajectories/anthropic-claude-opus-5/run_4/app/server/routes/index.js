import { Hono } from 'hono';
import { core } from './core.js';
import { intake } from './intake.js';
import { ops } from './ops.js';
import { ledgerRoutes } from './ledger.js';
import { carbon } from './carbon.js';
import { certificates } from './certificates.js';
import { record } from './record.js';
import { misc } from './misc.js';

export const api = new Hono();

api.route('/', core);
api.route('/', intake);
api.route('/', ops);
api.route('/', ledgerRoutes);
api.route('/', carbon);
api.route('/', certificates);
api.route('/', record);
api.route('/', misc);
