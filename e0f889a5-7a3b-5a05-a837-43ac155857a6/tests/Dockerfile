FROM python:3.12-slim-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libglib2.0-0 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
      libcups2 libdrm2 libxkbcommon0 libatspi2.0-0 libx11-6 libxcomposite1 \
      libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
      libcairo2 libasound2 fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
      pytest==8.4.1 \
      pytest-json-ctrf==0.3.5 \
      httpx==0.28.1 \
      psycopg[binary]==3.2.3 \
      pyyaml==6.0.2 \
      playwright==1.49.1 \
 && playwright install chromium

COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker

ENV PYTHONPATH=/tests

COPY appclient.py capabilities.py score.py deku_state.py pytest.ini \
     workflows.yaml rubric.json conftest.py test_storefront.py test.sh /tests/

WORKDIR /tests
