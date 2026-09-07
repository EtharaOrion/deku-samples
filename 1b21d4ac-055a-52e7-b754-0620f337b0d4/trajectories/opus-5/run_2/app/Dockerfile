# Cirrus. A Flask app rendering Jinja templates, with Alpine.js vendored into
# the image. No binary asset ships: every pixel is drawn from a stored seed.
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first, so the layer caches independently of the source.
# psycopg[binary] carries its own libpq wheel, so no apt package is needed.
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# The application package: templates, static files and the Python modules.
COPY cirrus /app/cirrus
COPY USER_README.md /app/USER_README.md

# Reserved and left empty in the image.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

# 4173 is the container-internal port this app answers on. The address it is
# reached at and the port the outside world uses are read from the environment
# at container start, never written into the source.
EXPOSE 4173

# No service is reachable during the build, so the schema, the seed and every
# connection happen at start-up.
#
# The bind port is read from the environment at container start, defaulting to
# the 4173 this brief names as the container-internal port. It is deliberately
# not APP_PUBLIC_PORT: that is the port the outside world uses on the near side
# of the ${APP_PUBLIC_PORT}:4173 mapping, and binding to it would break it.
#
# `exec` hands PID 1 to gunicorn so signals reach it and it runs in the
# foreground. It binds 0.0.0.0, never loopback, so the listener is reachable
# from outside the container. Gunicorn's own access log stays off: the app
# already writes exactly one request line to stdout, and both would write two.
CMD exec gunicorn \
      --bind "0.0.0.0:${PORT:-4173}" \
      --workers 2 \
      --threads 4 \
      --timeout 120 \
      --graceful-timeout 30 \
      --error-logfile - \
      --capture-output \
      cirrus.app:app
