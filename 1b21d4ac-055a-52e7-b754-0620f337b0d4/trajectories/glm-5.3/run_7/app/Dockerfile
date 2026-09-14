# Cirrus — Flask + Jinja + PostgreSQL + Alpine.js, no binary assets.
FROM python:3.12-slim

# Pillow's wheels carry their own native parts; no system build step needed.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=4173

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py gen.py ./
COPY templates ./templates
COPY static ./static

# Nothing is reachable at build time: the schema, the seed and the generated
# assets are all applied at container start, from the environment.
EXPOSE 4173

CMD ["python", "app.py"]
