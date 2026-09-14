FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=4173 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY cirrus ./cirrus
COPY run.py wsgi.py gunicorn.conf.py ./

# Build-time generated assets: the grain tile and the share image. Neither
# needs the database or the network.
RUN python -c "from cirrus.media import build_grain_tile, render_share_image; import os; b=os.path.join(os.getcwd(),'cirrus','static','build'); build_grain_tile(os.path.join(b,'grain.png')); render_share_image(os.path.join(b,'share.png'))"

# Reserved directories the harness reads.
RUN mkdir -p /app/.browser_screenshots /app/.downloads

EXPOSE 4173

# Schema and seed are applied at start: the database is re-created from
# scratch by the grader, so the image brings it up itself.
CMD ["sh", "-c", "exec gunicorn -c gunicorn.conf.py wsgi:app --timeout 120"]
