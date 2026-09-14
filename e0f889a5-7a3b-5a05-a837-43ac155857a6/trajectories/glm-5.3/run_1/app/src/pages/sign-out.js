export const GET = async ({ request }) => {
  return new Response(null, {
    status: 302,
    headers: [
      ['location', '/'],
      ['set-cookie', 'vela_token=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly'],
    ],
  });
};
export const POST = async (ctx) => GET(ctx);
