# Worker imajı: kaynak izleme, ajan zinciri, yayın ve dağıtım işleri (BullMQ).
FROM node:24-alpine
RUN corepack enable
ENV CI=1 NODE_ENV=production TZ=Europe/Istanbul
RUN apk add --no-cache tzdata
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
# Belgeler STORAGE_DIR (=/app/storage) altına yazılır; bu dizin bir volume ile kalıcılaştırılır.
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
CMD ["pnpm", "--filter", "@kaynak/worker", "start"]
