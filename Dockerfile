# syntax=docker/dockerfile:1

# ============================================================
# TAccounts 生產映像（Next.js standalone + Prisma Linux 引擎）
# 注意：builder 與 runner 的 WORKDIR 必須保持 /app —— Prisma
# generated client 會把 output 絕對路徑 /app/src/generated/prisma
# 燒進 client.ts，作為引擎解析的 fallback。
# ============================================================

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- 相依套件（含 devDeps：prisma CLI / typescript / tailwind） ----------
# 注意：NODE_ENV=production 只能在 runner/migrate 設定，
# 否則 npm ci 會砍掉 devDependencies。
FROM base AS deps
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 建置（務必在 Linux 內 prisma generate，產生 musl 引擎） ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---------- 一次性 migration（重用 deps，不進 runner；app image 保持精簡） ----------
FROM base AS migrate
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------- 執行階段（standalone） ----------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 關鍵：Prisma 引擎在 generated 目錄內，明確 COPY 不依賴 tracing 成敗
COPY --from=builder --chown=nextjs:nodejs /app/src/generated/prisma ./src/generated/prisma

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
