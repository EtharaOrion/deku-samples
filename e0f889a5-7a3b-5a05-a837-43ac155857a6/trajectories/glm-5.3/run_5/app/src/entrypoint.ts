// The Astro adapter would start its own server on import; the container runs one
// server only, and only after the schema and the seed are in place.
process.env.ASTRO_NODE_AUTOSTART = 'disabled';
const { createHandler } = await import('./container.js');
await createHandler();
