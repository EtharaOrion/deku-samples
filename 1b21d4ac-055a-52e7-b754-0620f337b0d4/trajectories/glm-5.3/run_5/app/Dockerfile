FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=4173

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py config.py db.py images.py records.py ./
COPY templates ./templates
COPY static ./static
COPY assets ./assets

EXPOSE 4173

ENV CIRRUS_HOUSE=cirrus \
    CIRRUS_DEMO_PASSWORD=deku-demo-pw-2026

CMD ["sh", "-c", "exec gunicorn --workers 2 --threads 4 --bind 0.0.0.0:${PORT} --error-logfile - --access-logfile /dev/null --timeout 120 --graceful-timeout 30 app:app"]
