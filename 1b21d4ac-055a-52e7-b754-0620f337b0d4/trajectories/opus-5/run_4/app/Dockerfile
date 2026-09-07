FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first, so the layer caches independently of the source.
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# The application: package, entrypoint and the start script.
COPY cirrus /app/cirrus
COPY wsgi.py /app/wsgi.py
COPY start.sh /app/start.sh
COPY USER_README.md /app/USER_README.md

# Reserved and empty at the app root.
RUN mkdir -p /app/.browser_screenshots /app/.downloads \
    && chmod +x /app/start.sh

# 4173 is the container-internal port named by the brief. The published port
# comes from the environment at run time and is never written into the source.
EXPOSE 4173

# No service is reachable during the build: the schema, the seed and every
# service address are resolved at container start.
CMD ["/app/start.sh"]
