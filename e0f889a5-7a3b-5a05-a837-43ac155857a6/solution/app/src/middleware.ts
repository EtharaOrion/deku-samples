import type { MiddlewareHandler } from "astro";
import api from "./server/api";
import { logRequest, newRequestId } from "./server/log";

/** One origin, one process. The JSON API answers under /api and every other
 *  path is server-rendered HTML. */
const FORM_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data"];

export const onRequest: MiddlewareHandler = async (context, next) => {
  const path = context.url.pathname;
  if (path === "/api" || path.startsWith("/api/")) {
    return api.fetch(context.request);
  }

  const requestId = newRequestId();
  const started = Date.now();
  (context.locals as Record<string, unknown>).requestId = requestId;

  const answer = (response: Response) => {
    response.headers.set("x-request-id", requestId);
    response.headers.set("referrer-policy", "no-referrer");
    response.headers.set("x-content-type-options", "nosniff");
    if ((response.headers.get("content-type") ?? "").includes("text/html")) {
      response.headers.set("cache-control", "no-store");
    }
    logRequest({
      request_id: requestId,
      method: context.request.method,
      route: path,
      status: response.status,
      duration_ms: Date.now() - started,
    });
    return response;
  };

  // An HTML form post carries a cookie, so it is checked against its own origin.
  const request = context.request;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const [rawType = ""] = (request.headers.get("content-type") ?? "").split(";");
    const type = rawType.trim().toLowerCase();
    if (FORM_TYPES.includes(type)) {
      if (request.headers.get("sec-fetch-site") === "cross-site") {
        return answer(new Response("That did not work.", { status: 403 }));
      }
      // Compare against the host the request actually arrived on, which is the
      // only value that survives a proxy or a container port mapping. A page
      // served with no referrer policy posts its own forms with the literal
      // origin "null", which names no site and is left to the cookie rule.
      const origin = request.headers.get("origin");
      const host = request.headers.get("host");
      try {
        if (origin && origin !== "null" && host && new URL(origin).host !== host) {
          return answer(new Response("That did not work.", { status: 403 }));
        }
      } catch {
        return answer(new Response("That did not work.", { status: 403 }));
      }
    }
  }

  try {
    return answer(await next());
  } catch (error) {
    logRequest({
      request_id: requestId,
      method: request.method,
      route: path,
      status: 500,
      duration_ms: Date.now() - started,
    });
    throw error;
  }
};
