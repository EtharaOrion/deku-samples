# Cirrus. A Flask app rendering Jinja templates, with Alpine.js vendored in the
# image; PostgreSQL is the only backing service and it is addressed from the
# environment at container start. No asset is fetched at build or at run time.
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=4173

WORKDIR /app

# Dependencies first, so the layer is reused when only the source changes.
# psycopg ships its own binary build, so no compiler and no libpq are needed.
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# The application: the package, the entrypoint and the WSGI module. The vendored
# Alpine build travels inside cirrus/static, so nothing is fetched at run time.
COPY cirrus /app/cirrus
COPY wsgi.py /app/wsgi.py
COPY healthcheck.py /app/healthcheck.py
COPY entrypoint.sh /app/entrypoint.sh
COPY USER_README.md /app/USER_README.md
COPY THIRD_PARTY.md /app/THIRD_PARTY.md

# Reserved and empty at the app root.
RUN mkdir -p /app/.browser_screenshots /app/.downloads \
    && chmod +x /app/entrypoint.sh

# Run as an unprivileged account that owns nothing it does not need.
RUN useradd --create-home --uid 10001 cirrus && chown -R cirrus:cirrus /app
USER cirrus

EXPOSE 4173

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["python", "/app/healthcheck.py"]

# The port the brief names, bound to every interface, served in the foreground
# by gunicorn rather than by a development server.
ENTRYPOINT ["/app/entrypoint.sh"]
