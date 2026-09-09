FROM node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@10.34.5
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/accounting/package.json packages/accounting/package.json
COPY packages/market-data/package.json packages/market-data/package.json
COPY packages/adapters/package.json packages/adapters/package.json
COPY packages/execution/package.json packages/execution/package.json
COPY packages/experiments/package.json packages/experiments/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/valuation/package.json packages/valuation/package.json
COPY packages/evaluation/package.json packages/evaluation/package.json
COPY packages/transfers/package.json packages/transfers/package.json
COPY examples/self-hosted-treasury-agent/package.json examples/self-hosted-treasury-agent/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
USER node
CMD ["pnpm", "--filter", "@poa/api", "start"]
