FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=4173

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py auth.py bootstrap.py entrypoint.sh media.py seed.py studio_api.py ./
RUN chmod +x /app/entrypoint.sh

COPY templates ./templates
COPY static ./static

RUN mkdir -p /app/.browser_screenshots /app/.downloads /app/static/gen

# The schema and the idempotent seed are applied by the image at start,
# from DATABASE_URL alone; nothing is reachable during the build.
EXPOSE 4173
ENTRYPOINT ["/app/entrypoint.sh"]
