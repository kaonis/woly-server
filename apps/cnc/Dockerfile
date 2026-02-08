# Build from repo root: docker build -f apps/cnc/Dockerfile .
FROM node:24-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY packages/protocol/package.json ./packages/protocol/
COPY apps/cnc/package.json ./apps/cnc/

# Install workspace dependencies
RUN npm ci --workspace=apps/cnc --workspace=packages/protocol

# Copy source
COPY tsconfig.base.json ./
COPY packages/protocol/ ./packages/protocol/
COPY apps/cnc/ ./apps/cnc/

# Build protocol first, then app
RUN npm run build -w packages/protocol
RUN npm run build -w apps/cnc

# Production stage
FROM node:24-alpine

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/packages/protocol/package.json ./packages/protocol/
COPY --from=builder /app/packages/protocol/dist/ ./packages/protocol/dist/
COPY --from=builder /app/apps/cnc/package.json ./apps/cnc/
COPY --from=builder /app/apps/cnc/dist/ ./apps/cnc/dist/

RUN npm ci --workspace=apps/cnc --workspace=packages/protocol --omit=dev

# Create directories for database and logs
RUN mkdir -p /app/apps/cnc/db /app/apps/cnc/logs

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "apps/cnc/dist/server.js"]
