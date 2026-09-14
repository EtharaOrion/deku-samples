# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# Cirrus. The image migrates and seeds on boot: the database it finds at
# DATABASE_URL is the only store, and the seed is idempotent, so a restart
# never duplicates a row. Every service address is read from the environment
# at container start; nothing is reachable during build.
# -----------------------------------------------------------------------------
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY cirrus ./cirrus

# The two variable webfonts are OFL-licensed derivatives committed with the
# source (see cirrus/static/fonts/OFL.txt); no binary is fetched at runtime.
ENV PORT=4173 \
    CIRRUS_HOUSE=cirrus

EXPOSE 4173

# One request line on stdout per request; gunicorn logs to stdout too.
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT:-4173} --workers 2 --threads 8 --timeout 120 --access-logfile - --error-logfile - --forwarded-allow-ips '*' 'cirrus.app:create_app()'"]
