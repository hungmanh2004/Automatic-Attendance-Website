FROM python:3.12-slim

# OpenCV runtime dependencies
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps as a cached layer (source is bind-mounted at runtime)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
