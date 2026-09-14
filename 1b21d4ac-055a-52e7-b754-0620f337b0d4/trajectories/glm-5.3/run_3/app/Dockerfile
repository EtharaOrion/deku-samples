# Cirrus — production image.
# Python 3.12-slim, wheels vendored under /app/vendor so nothing is fetched
# from the network during the build. libpq5 comes from Debian for psycopg.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# libpq5 is the only system library the app needs; the still renderer is Pillow.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Vendored wheels first, so a source edit does not re-install them.
COPY vendor/ /app/vendor/
RUN pip install --no-index --find-links=/app/vendor \
        flask gunicorn psycopg markupsafe blinker click itsdangerous jinja2 werkzeug \
        pillow packaging typing-extensions

# Application source.
COPY cirrus/ /app/cirrus/
COPY templates/ /app/templates/
COPY static/ /app/static/
COPY run.py /app/run.py

# The schema, the seed and the generated tiles all land here at startup.
RUN mkdir -p /app/static/gen /app/.browser_screenshots /app/.downloads

# Never run as root.
RUN useradd --system --create-home --uid 1001 cirrus \
    && chown -R cirrus:cirrus /app
USER cirrus

# 4173 is the container-internal port; APP_PUBLIC_PORT is what the outside uses.
ENV PORT=4173
EXPOSE 4173

# Schema + seed + serve, in the foreground, bound to 0.0.0.0.
# The token-signing key is minted once per container and inherited by every
# worker, so a bearer token minted by one worker is valid on all of them.
CMD ["sh", "-c", "CIRRUS_SECRET_KEY=${CIRRUS_SECRET_KEY:-$(python3 -c 'import secrets; print(secrets.token_hex(32))')} ; export CIRRUS_SECRET_KEY ; exec gunicorn --bind 0.0.0.0:${PORT:-4173} --workers 2 --threads 8 --timeout 90 --access-logfile - --error-logfile - run:app"]
