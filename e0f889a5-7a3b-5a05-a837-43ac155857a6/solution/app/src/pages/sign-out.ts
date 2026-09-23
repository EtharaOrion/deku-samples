import type { APIRoute } from "astro";
import { AUTH_COOKIE } from "../components/lib/api";

/** Signing out removes the browser-held bearer token and returns to the letter. */
export const POST: APIRoute = ({ cookies }) => {
  cookies.delete(AUTH_COOKIE, { path: "/" });
  return new Response(null, { status: 303, headers: { location: "/" } });
};

export const GET: APIRoute = () =>
  new Response(null, { status: 303, headers: { location: "/" } });
