FROM node:20-alpine

WORKDIR /app

# Install deps as a cached layer (source is bind-mounted at runtime)
COPY package.json package-lock.json* ./
RUN npm install
