# Vela storefront

The app runs at `APP_PUBLIC_URL` (port mapping `${APP_PUBLIC_PORT}:4173`).
`GET /api/health` returns 200 once it is ready.

## Sign-in accounts

Every seeded account uses the same password:

    deku-demo-pw-2026

| Email | Name |
|---|---|
| customer@example.com | Iris Vantaa |
| customer2@example.com | Rune Halden |

Sign in at `/sign-in`. Signup is open at `/sign-up`. Guest checkout is the
default and needs no account at all.

There is no staff or operations console, and no other credential exists.
