# ==============================================================================
# SmartStock Frontend - Multi-Stage Production Dockerfile
# Stage 1: Build React/Vite SPA bundle
# Stage 2: Serve via Nginx Alpine web server
# ==============================================================================

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependency specifications first for Docker layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy application source files
COPY . .

# Build-time API Base URL (defaults to relative /api/v1 for reverse proxy routing)
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Build production bundle
RUN npm run build

# Stage 2: Runtime
FROM nginx:1.27-alpine
WORKDIR /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder stage
COPY --from=builder /app/dist .

# Expose standard HTTP port
EXPOSE 80

# Health check to ensure Nginx is serving assets
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -q --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
