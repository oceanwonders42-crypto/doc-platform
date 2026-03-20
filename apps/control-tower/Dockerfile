FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile=false

FROM deps AS builder

COPY . .
RUN pnpm prisma generate
RUN pnpm build

FROM deps AS dev

COPY . .
COPY docker/dev-entrypoint.sh /opt/dev-entrypoint.sh
RUN chmod +x /opt/dev-entrypoint.sh && mkdir -p /opt/node_modules && cp -R /app/node_modules/. /opt/node_modules
EXPOSE 3000
CMD ["/opt/dev-entrypoint.sh"]

FROM base AS runner

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

CMD ["pnpm", "start"]
