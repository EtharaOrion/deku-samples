FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first, so the layer is reused when only source changes.
# psycopg2-binary ships wheels, so no build toolchain is needed here.
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# The application: the package, the entry point and the start script.
COPY cirrus /app/cirrus
COPY wsgi.py /app/wsgi.py
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
COPY USER_README.md /app/USER_README.md

# Reserved directories, present and empty in the image.
RUN mkdir -p /app/.browser_screenshots /app/.downloads \
 && chmod +x /app/docker-entrypoint.sh

# 4173 is the container-internal port this brief names.
EXPOSE 4173

# No service is reachable during the build: the schema, the seed and every
# service address are read and applied at container start, not here.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
