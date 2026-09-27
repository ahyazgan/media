FROM node:24-alpine
RUN corepack enable && corepack prepare pnpm@11.0.8 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/agents/package.json packages/agents/
COPY packages/sources/package.json packages/sources/
COPY packages/pipeline/package.json packages/pipeline/
RUN pnpm install --frozen-lockfile --filter @kaynak/worker...
COPY . .
CMD ["pnpm", "--filter", "@kaynak/worker", "start"]
