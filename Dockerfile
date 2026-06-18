FROM node:22-alpine AS builder

WORKDIR /app

ENV NODE_OPTIONS=--max-old-space-size=2048
ENV CI=true

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_SERVICE_ROLE_KEY
ARG VITE_AGORA_APP_ID
ARG VITE_AGORA_CHANNEL_PREFIX=satranc
ARG VITE_OPENROUTER_API_KEY
ARG VITE_OPENROUTER_MODEL

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_SERVICE_ROLE_KEY=$VITE_SUPABASE_SERVICE_ROLE_KEY
ENV VITE_AGORA_APP_ID=$VITE_AGORA_APP_ID
ENV VITE_AGORA_CHANNEL_PREFIX=$VITE_AGORA_CHANNEL_PREFIX
ENV VITE_OPENROUTER_API_KEY=$VITE_OPENROUTER_API_KEY
ENV VITE_OPENROUTER_MODEL=$VITE_OPENROUTER_MODEL

RUN npm run sync:stockfish
RUN npm run build

FROM node:22-alpine

RUN apk add --no-cache wget

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY server/docker-api.mjs server/docker-production.mjs /app/server/
COPY lib/homeworkAttemptDb.mjs lib/liveLessonChatDb.mjs lib/liveLessonSessionMediaDb.mjs /app/lib/
COPY --from=builder /app/dist /app/dist

ENV STATIC_DIR=/app/dist
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "/app/server/docker-production.mjs"]
