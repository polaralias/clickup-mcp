# Build stage
FROM node:20-slim AS builder
WORKDIR /app

# Copy package files first to leverage Docker layer caching
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
# Using 'npm ci' for more reliable and faster builds in CI/Docker
RUN npm ci

# Copy source and config files
COPY . .

# Run build
RUN npm run build

# Runtime stage
FROM node:20-slim
WORKDIR /app

# Copy package files for production install
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Set default environment variables
ENV NODE_ENV=production
ENV TRANSPORT=http
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/server/index.js"]

