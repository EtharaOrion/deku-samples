FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app

WORKDIR /app

# psycopg2-binary ships wheels, so no build toolchain is needed here.
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY app /app/app
COPY wsgi.py seed.py entrypoint.sh USER_README.md /app/
RUN chmod +x /app/entrypoint.sh

# The reserved directories exist at the app root, empty.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

# 4173 is the container-internal port named by the brief.
EXPOSE 4173

# No service is reachable during build: the schema and the seed are applied at
# container start, then the app is served in the foreground on 0.0.0.0.
CMD ["/app/entrypoint.sh"]
