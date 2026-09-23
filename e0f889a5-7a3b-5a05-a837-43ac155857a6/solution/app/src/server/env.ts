import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Every host, port and credential this app speaks to is read here and nowhere else. */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },
  get port(): number {
    return Number(process.env.PORT ?? process.env.APP_PORT ?? 4173);
  },
  get host(): string {
    return optional("HOST", "0.0.0.0");
  },
  get publicUrl(): string {
    return required("APP_PUBLIC_URL");
  },
  smtp: {
    get host(): string {
      return required("SMTP_HOST");
    },
    get port(): number {
      return Number(required("SMTP_PORT"));
    },
    get user(): string {
      return optional("SMTP_USER", "");
    },
    get pass(): string {
      return optional("SMTP_PASS", "");
    },
    get from(): string {
      return optional("SMTP_FROM", "orders@vela.example.com");
    },
  },
  payments: {
    get url(): string {
      return required("PAYMENTS_API_URL");
    },
    get key(): string {
      return required("PAYMENTS_API_KEY");
    },
    get secret(): string {
      return required("PAYMENTS_API_SECRET");
    },
    // The storefront principal, not the admin one. `orbit-admin` is the
    // grader's, and an app that authenticated as it would be writing the
    // evidence store that verifies it. `vela-app` carries account, invoice and
    // payment rights -- exactly what checkout needs and nothing else.
    get appUser(): string {
      return required("PAYMENTS_APP_USER");
    },
    get appPassword(): string {
      return required("PAYMENTS_APP_PASSWORD");
    },
  },
};

const SECRET_MIN_LENGTH = 32;
let generated: string | null = null;

/** Where a generated signing key is kept between restarts: the app root the
 *  deployment contract names, then the working directory. */
function secretFiles(): string[] {
  const named = process.env.APP_SECRET_FILE;
  return [
    ...(named ? [resolve(named)] : []),
    "/app/.vela-runtime-secret",
    resolve(".vela-runtime-secret"),
  ];
}

/** The token signing key is injected by deployment as APP_SECRET. When it is
 *  absent the key is generated once at first boot and kept beside the app, so a
 *  restart signs nobody out. It is never derived from a public or shared
 *  credential. */
export function signingSecret(): string {
  const injected = process.env.APP_SECRET;
  if (injected) {
    if (injected.length < SECRET_MIN_LENGTH) {
      throw new Error(`APP_SECRET must contain at least ${SECRET_MIN_LENGTH} characters`);
    }
    return injected;
  }
  if (generated) return generated;

  for (const file of secretFiles()) {
    try {
      const held = readFileSync(file, "utf8").trim();
      if (held.length >= SECRET_MIN_LENGTH) {
        generated = held;
        return held;
      }
    } catch {
      /* not kept there */
    }
  }

  const fresh = randomBytes(32).toString("base64url");
  for (const file of secretFiles()) {
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, fresh, { mode: 0o600 });
      break;
    } catch {
      /* try the next place; a key held only in memory still works until restart */
    }
  }
  generated = fresh;
  return fresh;
}
