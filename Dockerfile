FROM node:22-alpine AS base

# Install bun
RUN npm install -g bun

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build args for NEXT_PUBLIC_ env vars (baked into client JS at build time)
ARG NEXT_PUBLIC_RPC_URL
ARG NEXT_PUBLIC_CHAIN_ID
ARG NEXT_PUBLIC_GROUP_FACTORY_ADDRESS
ARG NEXT_PUBLIC_ACCOUNT_FACTORY_ADDRESS
ARG NEXT_PUBLIC_ENTRYPOINT_ADDRESS
ARG NEXT_PUBLIC_BUNDLER_URL
ARG NEXT_PUBLIC_BOOTSTRAP_GROUP
ARG NEXT_PUBLIC_BOOTSTRAP_NODES
ARG NEXT_PUBLIC_USE_PAYMASTER
ARG NEXT_PUBLIC_PAYMASTER_ADDRESS
ARG NEXT_PUBLIC_USE_SERVER_PROVER
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
RUN bun run build

# --- Runtime ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server + required assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
