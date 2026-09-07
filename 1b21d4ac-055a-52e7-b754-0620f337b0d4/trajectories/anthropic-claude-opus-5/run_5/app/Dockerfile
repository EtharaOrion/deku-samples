FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=4173

WORKDIR /app

# psycopg ships as a binary wheel, so no build toolchain and no libpq are needed
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# the application: templates, the design system, the vendored script and both fonts
COPY wsgi.py ./
COPY cirrus/ ./cirrus/
COPY docker-entrypoint.sh ./
COPY USER_README.md ./

RUN chmod +x docker-entrypoint.sh \
    && mkdir -p .browser_screenshots .downloads

# no service is reachable during the build, so the grain tile is generated at
# image build time and baked in rather than drawn on the first request
RUN python -c "from cirrus.media import grain_tile_png; grain_tile_png(); print('grain tile ready')"

EXPOSE 4173

# the app answers 200 here once the roster can be read
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
    CMD python -c "import os,urllib.request,sys; \
url='http://127.0.0.1:'+os.environ.get('PORT','4173')+'/api/health'; \
sys.exit(0 if urllib.request.urlopen(url, timeout=4).status == 200 else 1)"

CMD ["./docker-entrypoint.sh"]
