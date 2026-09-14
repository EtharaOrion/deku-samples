// Serve a generated stand-in artifact so the download control always works.
export const prerender = false;

export async function GET({ params }) {
  const name = String(params.artifact || 'download.bin');
  const body = `Vela distribution stand-in\n${name}\nGenerated ${new Date().toISOString()}\n`;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${name.replace(/"/g, '')}"`,
    },
  });
}
