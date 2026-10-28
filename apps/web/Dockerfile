# Build context: repository root (docker build -f apps/web/Dockerfile .)
FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build --workspace=@purchase-compass/web

# Static files served by nginx, which also forwards /api so the browser talks to one origin.
FROM nginx:1.27-alpine
ENV API_URL=http://api:3000
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
