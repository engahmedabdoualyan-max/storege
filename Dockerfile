# syntax=docker/dockerfile:1
# Storege WMS — production image (API + built React PWA)
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

# Copy sources and build the PWA
COPY . .
RUN npx prisma generate --schema server/prisma/schema.prisma
RUN npm run build -w web

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

RUN apk add --no-cache openssl tini

COPY --from=build /app /app
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--", "/app/docker-entrypoint.sh"]
