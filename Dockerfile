# Self-hosted Cloudflare R2 build of Cloudframe. See selfhost/README.md.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN HUSKY=0 pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter cloudframe-web build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    CLOUDFRAME_DATA_DIR=/data
COPY --from=build /app/apps/web/.output ./.output
# Synced upload/gallery settings; mount a volume here to keep them.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO /dev/null http://127.0.0.1:3000/en || exit 1
CMD ["node", ".output/server/index.mjs"]
