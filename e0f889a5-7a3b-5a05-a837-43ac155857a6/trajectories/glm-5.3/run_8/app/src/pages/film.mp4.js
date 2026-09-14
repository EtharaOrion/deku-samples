// The film is scenery. When no footage is shipped, this answers plainly so the
// still frame stays and the page is complete without it.
export const prerender = false;

export async function GET() {
  return new Response('', {
    status: 200,
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': '0', 'Cache-Control': 'no-store' },
  });
}
