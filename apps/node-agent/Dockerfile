# Build from repo root: docker build -f apps/node-agent/Dockerfile .
FROM node:24-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY packages/protocol/package.json ./packages/protocol/
COPY apps/node-agent/package.json ./apps/node-agent/

# Install workspace dependencies
RUN npm ci --workspace=apps/node-agent --workspace=packages/protocol

# Copy source
COPY tsconfig.base.json ./
COPY packages/protocol/ ./packages/protocol/
COPY apps/node-agent/ ./apps/node-agent/

# Build protocol first, then app
RUN npm run build -w packages/protocol
RUN npm run build -w apps/node-agent

# Production stage
FROM node:24-alpine

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/packages/protocol/package.json ./packages/protocol/
COPY --from=builder /app/packages/protocol/dist/ ./packages/protocol/dist/
COPY --from=builder /app/apps/node-agent/package.json ./apps/node-agent/
COPY --from=builder /app/apps/node-agent/dist/ ./apps/node-agent/dist/

RUN npm ci --workspace=apps/node-agent --workspace=packages/protocol --omit=dev

# Create directories for database and logs
RUN mkdir -p /app/apps/node-agent/db /app/apps/node-agent/logs

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 8082

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8082/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "apps/node-agent/dist/app.js"]
