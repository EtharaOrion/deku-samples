import { renderers } from './renderers.mjs';
import { c as createExports, s as serverEntrypointModule } from './chunks/_@astrojs-ssr-adapter_hlig3RSW.mjs';
import { manifest } from './manifest_DyG09-qR.mjs';

const serverIslandMap = new Map();;

const _page0 = () => import('./pages/_image.astro.mjs');
const _page1 = () => import('./pages/404.astro.mjs');
const _page2 = () => import('./pages/500.astro.mjs');
const _page3 = () => import('./pages/account/cameras/_serial_.astro.mjs');
const _page4 = () => import('./pages/account/cameras.astro.mjs');
const _page5 = () => import('./pages/account/orders/_number_.astro.mjs');
const _page6 = () => import('./pages/account/orders.astro.mjs');
const _page7 = () => import('./pages/account.astro.mjs');
const _page8 = () => import('./pages/cart.astro.mjs');
const _page9 = () => import('./pages/checkout/how-it-gets-there.astro.mjs');
const _page10 = () => import('./pages/checkout/payment.astro.mjs');
const _page11 = () => import('./pages/checkout/where-it-goes.astro.mjs');
const _page12 = () => import('./pages/doctor.astro.mjs');
const _page13 = () => import('./pages/downloads/_version_.astro.mjs');
const _page14 = () => import('./pages/downloads.astro.mjs');
const _page15 = () => import('./pages/orders/_number_.astro.mjs');
const _page16 = () => import('./pages/shop/_handle_.astro.mjs');
const _page17 = () => import('./pages/shop.astro.mjs');
const _page18 = () => import('./pages/sign-in.astro.mjs');
const _page19 = () => import('./pages/sign-out.astro.mjs');
const _page20 = () => import('./pages/sign-up.astro.mjs');
const _page21 = () => import('./pages/index.astro.mjs');
const pageMap = new Map([
    ["node_modules/astro/dist/assets/endpoint/node.js", _page0],
    ["src/pages/404.astro", _page1],
    ["src/pages/500.astro", _page2],
    ["src/pages/account/cameras/[serial].astro", _page3],
    ["src/pages/account/cameras/index.astro", _page4],
    ["src/pages/account/orders/[number].astro", _page5],
    ["src/pages/account/orders/index.astro", _page6],
    ["src/pages/account/index.astro", _page7],
    ["src/pages/cart.astro", _page8],
    ["src/pages/checkout/how-it-gets-there.astro", _page9],
    ["src/pages/checkout/payment.astro", _page10],
    ["src/pages/checkout/where-it-goes.astro", _page11],
    ["src/pages/doctor.astro", _page12],
    ["src/pages/downloads/[version].astro", _page13],
    ["src/pages/downloads/index.astro", _page14],
    ["src/pages/orders/[number].astro", _page15],
    ["src/pages/shop/[handle].astro", _page16],
    ["src/pages/shop/index.astro", _page17],
    ["src/pages/sign-in.astro", _page18],
    ["src/pages/sign-out.astro", _page19],
    ["src/pages/sign-up.astro", _page20],
    ["src/pages/index.astro", _page21]
]);

const _manifest = Object.assign(manifest, {
    pageMap,
    serverIslandMap,
    renderers,
    actions: () => import('./noop-entrypoint.mjs'),
    middleware: () => import('./_noop-middleware.mjs')
});
const _args = {
    "mode": "middleware",
    "client": "file:///app/dist/client/",
    "server": "file:///app/dist/server/",
    "host": false,
    "port": 4321,
    "assets": "_astro",
    "experimentalStaticHeaders": false
};
const _exports = createExports(_manifest, _args);
const handler = _exports['handler'];
const startServer = _exports['startServer'];
const options = _exports['options'];
const _start = 'start';
if (Object.prototype.hasOwnProperty.call(serverEntrypointModule, _start)) {
	serverEntrypointModule[_start](_manifest, _args);
}

export { handler, options, pageMap, startServer };
