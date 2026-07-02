FROM node:22-alpine

RUN apk add --no-cache wget

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY server/docker-api.mjs server/docker-production.mjs /app/server/
COPY lib/*.mjs /app/lib/
COPY dist /app/dist

ENV STATIC_DIR=/app/dist
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "/app/server/docker-production.mjs"]
