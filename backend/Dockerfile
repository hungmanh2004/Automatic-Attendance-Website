FROM python:3.11-slim

# Install system deps AND download+extract InsightFace models in ONE layer
# (splitting them causes cached apt layer to be reused without unzip)
RUN apt-get update && apt-get install -y \
        libgl1 \
        libglib2.0-0 \
        curl \
        unzip \
    && rm -rf /var/lib/apt/lists/* \
    && curl -sL "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip" \
        -o /tmp/buffalo_l.zip \
    && mkdir -p /root/.insightface/models/buffalo_l \
    && unzip -q /tmp/buffalo_l.zip -d /root/.insightface/models/buffalo_l \
    && rm /tmp/buffalo_l.zip \
    && echo "InsightFace buffalo_l model unpacked successfully"

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir --default-timeout=3000 -r backend/requirements.txt

COPY backend ./backend
COPY scripts ./scripts
COPY .env.example ./.env.example

ENV PYTHONUNBUFFERED=1

EXPOSE 5000

CMD ["gunicorn", "backend.run:app", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "120"]
