FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first, so the layer is reused when only the app changes.
# psycopg2-binary ships its own libpq, so no build toolchain is needed here.
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# The application: the package, the WSGI entry point, the one-shot bootstrap and the
# entrypoint. No binary asset ships with this build: every pixel is drawn from a seed.
COPY cirrus /app/cirrus
COPY wsgi.py bootstrap.py docker-entrypoint.sh USER_README.md /app/

RUN chmod +x /app/docker-entrypoint.sh \
    && mkdir -p /app/.browser_screenshots /app/.downloads

# 4173 is the container-internal port this app answers on.
EXPOSE 4173

# No service is reachable during the build, so the schema, the seed and every service
# address are read and applied at container start instead.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
