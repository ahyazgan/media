# Web (Next.js) imajı — tek sunucu modu için. Vercel modunda kullanılmaz.
# pnpm önerilen monorepo deseni: önce kilit dosyasıyla paketleri indir (katman önbelleği), sonra kaynağı kopyala.
FROM node:24-alpine AS deps
RUN corepack enable
ENV CI=1 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile

FROM deps AS build
# Derleme anında gömülen değerler (NEXT_PUBLIC_* ve metadata tabanı). Değiştirince imajı yeniden derleyin.
ARG SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_AD_PROVIDER=
ARG NEXT_PUBLIC_ADSENSE_CLIENT=
ARG NEXT_PUBLIC_GAM_NETWORK=
ARG NEXT_PUBLIC_AD_UNITS=
ENV SITE_URL=$SITE_URL NEXT_PUBLIC_AD_PROVIDER=$NEXT_PUBLIC_AD_PROVIDER NEXT_PUBLIC_ADSENSE_CLIENT=$NEXT_PUBLIC_ADSENSE_CLIENT NEXT_PUBLIC_GAM_NETWORK=$NEXT_PUBLIC_GAM_NETWORK NEXT_PUBLIC_AD_UNITS=$NEXT_PUBLIC_AD_UNITS
# Derleme sırasında veritabanı yok: ISR sayfaları boş ön-render edilir, ilk istekten sonra (≤60 sn) gerçek veriyle yenilenir.
ENV DATABASE_URL=pglite://memory
RUN pnpm --filter @kaynak/web build

FROM build AS run
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN chown -R node:node /app/apps/web/.next /app/apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["pnpm", "--filter", "@kaynak/web", "exec", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
