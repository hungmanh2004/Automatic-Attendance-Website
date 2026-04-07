FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY scripts ./scripts
COPY .env.example ./.env.example

ENV PYTHONUNBUFFERED=1

EXPOSE 5000

CMD ["gunicorn", "backend.run:app", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "120"]
