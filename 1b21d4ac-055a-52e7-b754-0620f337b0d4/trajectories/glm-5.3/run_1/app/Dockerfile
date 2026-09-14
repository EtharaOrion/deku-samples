# Cirrus — Flask + PostgreSQL, served by gunicorn on 0.0.0.0:4173.
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY wsgi.py ./
COPY app ./app
COPY templates ./templates
COPY static ./static

# Schema and seed are applied at boot against DATABASE_URL, never at build time.
ENV PORT=4173
EXPOSE 4173

CMD ["sh", "-c", "exec gunicorn -w 4 --bind 0.0.0.0:${PORT} --access-logfile - --error-logfile - --timeout 120 wsgi:app"]
