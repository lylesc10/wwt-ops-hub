# syntax=docker/dockerfile:1

# ── Stage 1: build the Vite SPA ───────────────────────────────────────────────
# VITE_* values are baked into the browser bundle at build time, so they must be
# present here as build args (not at runtime).
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_BASE
ARG VITE_APP_ENV
ARG VITE_FN_MOCK
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_APP_ENV=$VITE_APP_ENV \
    VITE_FN_MOCK=$VITE_FN_MOCK

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: runtime (serves dist/ + /api via server.js) ──────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080

# Production deps: express, pg, jsonwebtoken, bcryptjs (no supabase-js at runtime).
COPY package*.json ./
RUN npm ci --omit=dev

# App code: the API handlers, their shared lib, and the production server.
# (No Data API Builder deployment exists — api/[table]/* reimplements DAB's
# REST dialect directly against DATABASE_URL — so azure/dab-config.json is
# reference-only and intentionally not copied into the runtime image.)
COPY --from=build /app/dist ./dist
COPY api ./api
COPY server.js ./

EXPOSE 8080
CMD ["node", "server.js"]
