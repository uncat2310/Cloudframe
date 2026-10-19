# Self-hosted Cloudflare R2 build of S3 Image Port. See selfhost/README.md.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN HUSKY=0 pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter s3-image-port-web build:selfhost

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY --from=build /app/apps/web/.output ./.output
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO /dev/null http://127.0.0.1:3000/en || exit 1
CMD ["node", ".output/server/index.mjs"]
