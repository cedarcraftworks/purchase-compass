# Build context: repository root (docker build -f apps/api/Dockerfile .)
FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm install --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace=@purchase-compass/api

# Runtime image: the bundled server plus only its four runtime dependencies.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production SAMPLES_DIR=/app/samples
RUN echo '{"type":"module","private":true}' > package.json \
  && npm install --omit=dev --no-audit --no-fund hono@^4.13 @hono/node-server@^2.1 postgres@^3.4 zod@^4.1
COPY --from=build /repo/apps/api/dist ./dist
COPY apps/api/migrations ./migrations
COPY samples ./samples
USER node
EXPOSE 3000
# Migrations take an advisory lock, so several replicas can start at once safely.
CMD ["sh", "-c", "node dist/migrate.js && if [ \"$SEED_ON_START\" = \"true\" ]; then node dist/seed.js; fi && exec node dist/main.js"]
