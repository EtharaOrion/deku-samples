import { makeApiApp } from './app.ts';
import { registerAuthRoutes } from './auth.ts';
import { registerCatalogRoutes } from './catalog.ts';
import { registerCartRoutes } from './cart.ts';
import { registerOrderRoutes } from './orders.ts';
import { registerAccountRoutes } from './account.ts';
import { registerReleaseRoutes } from './releases.ts';
import { registerFirmwareRoutes } from './firmware.ts';
import { registerHealthRoute } from './health.ts';

export async function handleApiRequest(request: Request, requestId: string): Promise<Response> {
  const app = getApiApp();
  return app.fetch(request, { requestId });
}

let cachedApp: ReturnType<typeof makeApiApp> | null = null;

function getApiApp() {
  if (!cachedApp) {
    const app = makeApiApp();
    registerAuthRoutes(app);
    registerCatalogRoutes(app);
    registerCartRoutes(app);
    registerOrderRoutes(app);
    registerAccountRoutes(app);
    registerReleaseRoutes(app);
    registerFirmwareRoutes(app);
    registerHealthRoute(app);
    cachedApp = app;
  }
  return cachedApp;
}
