FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_INTERNAL_PORT=4173

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl libpq5 \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY static ./static
COPY migrations ./migrations
COPY scripts ./scripts
COPY entrypoint.sh run.py wsgi.py ./
RUN chmod +x entrypoint.sh \
 && python3 scripts/fetch_fonts.py \
 && python3 scripts/build_assets.py \
 && python3 -c "import sys; sys.path.insert(0, '/app'); import app.main; print('import ok')" \
 && ls -la /app/static/fonts /app/static/media

EXPOSE 4173

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -fsS http://127.0.0.1:4173/api/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
