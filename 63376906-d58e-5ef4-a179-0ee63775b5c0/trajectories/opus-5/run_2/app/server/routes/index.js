import core from './core.js';
import operations from './operations.js';
import ledger from './ledger.js';
import carbon from './carbon.js';
import certificates from './certificates.js';
import recordRoutes from './record.js';
import publicRoutes from './public.js';

export default function mountApi(app) {
  core(app);
  operations(app);
  ledger(app);
  carbon(app);
  certificates(app);
  recordRoutes(app);
  publicRoutes(app);
}
