"""Runtime configuration. Every address comes from the environment."""
import os

DATABASE_URL = os.environ.get("DATABASE_URL", "")
APP_PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "http://localhost:4173")
APP_PUBLIC_PORT = os.environ.get("APP_PUBLIC_PORT", "4173")

PUBLIC_HOUSE = os.environ.get("CIRRUS_HOUSE", "cirrus")
CONTACT_EMAIL = os.environ.get("CIRRUS_CONTACT_EMAIL", "prod@example.com")
DEMO_PASSWORD = os.environ.get("CIRRUS_DEMO_PASSWORD", "deku-demo-pw-2026")

TOKEN_TTL_HOURS = 72
PREVIEW_TTL_MINUTES = 15
