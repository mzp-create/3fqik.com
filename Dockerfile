# WorldBet2026 — Production Dockerfile
# Single-stage, full-deps build: dev deps kept so drizzle-kit + tsx run at startup.
# better-sqlite3 native addon compiles against the SAME node/libc that runs the app.

FROM node:22-bookworm-slim

# Build deps for better-sqlite3 native addon
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 build-essential && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifests first (layer-cache for npm ci)
COPY package*.json ./

# Install ALL deps (including dev: drizzle-kit, tsx, typescript) so start.sh can run
RUN npm ci

# Copy the rest of the source
COPY . .

# Build the Next.js app
RUN npm run build

EXPOSE 3000

# start.sh: migrate → seed → exec next start (volume must be mounted by this point)
CMD ["bash", "scripts/start.sh"]
