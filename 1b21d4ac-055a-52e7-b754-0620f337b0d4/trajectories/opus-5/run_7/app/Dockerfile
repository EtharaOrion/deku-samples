FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=4173

WORKDIR /app

# Dependencies first, so the layer is cached across source edits. psycopg ships a binary
# wheel, so no build toolchain and no client library are needed in the image.
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# The application: the package, its templates, its static files and the entrypoint.
COPY cirrus /app/cirrus
COPY entrypoint.sh /app/entrypoint.sh
COPY USER_README.md /app/USER_README.md
RUN chmod +x /app/entrypoint.sh \
 && mkdir -p /app/.browser_screenshots /app/.downloads

# No service is reachable during the build: the schema and the seed are applied at start.
EXPOSE 4173

# Serves in the foreground, bound to every interface, on the container-internal port.
CMD ["/app/entrypoint.sh"]
