FROM python:3.12-slim-bookworm

ARG TARGETARCH
ARG ALPINEJS_VERSION=3.14.9

ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 TZ=UTC
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
ENV APP_PUBLIC_PORT=4173 PYTHONPATH=/tests
ENV VENDOR_DIR=/opt/vendor

WORKDIR /app

RUN set -eux \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates curl build-essential postgresql-client \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       libglib2.0-0 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
       libcups2 libdrm2 libxkbcommon0 libatspi2.0-0 libx11-6 libxcomposite1 \
       libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
       libcairo2 libasound2 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux \
    && pip install --no-cache-dir \
       flask==3.1.0 \
       jinja2==3.1.5 \
       werkzeug==3.1.3 \
       gunicorn==23.0.0 \
       "psycopg[binary]==3.2.3"

RUN set -eux \
    && pip install --no-cache-dir \
       pytest==8.4.1 \
       pytest-json-ctrf==0.3.5 \
      "headroom-ai>=0.24,<0.25" \
       httpx==0.28.1 \
       pyyaml==6.0.2 \
       playwright==1.49.1 \
    && playwright install chromium

RUN set -eux \
    && mkdir -p "${VENDOR_DIR}/alpinejs" \
    && curl -fsSL -o "${VENDOR_DIR}/alpinejs/alpine.min.js" \
       "https://cdnjs.cloudflare.com/ajax/libs/alpinejs/${ALPINEJS_VERSION}/cdn.min.js" \
    && test -s "${VENDOR_DIR}/alpinejs/alpine.min.js"

RUN set -eux && mkdir -p /app/.browser_screenshots /app/.downloads

EXPOSE 4173

CMD ["sleep", "infinity"]
