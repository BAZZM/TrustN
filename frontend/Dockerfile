############################
# 1️⃣ Builder stage
############################
FROM node:18-alpine AS builder

# Avoid running as root during build
WORKDIR /app

# Copy only dependency manifests first (better caching)
COPY package.json package-lock.json ./

# Install ALL deps (dev deps required for react-scripts)
RUN npm ci

# Copy source after deps are cached
COPY . .

# Build optimized production bundle
ENV NODE_ENV=production
RUN npm run build


############################
# 2️⃣ Runtime stage
############################
FROM nginx:1.25-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our hardened config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build output only
COPY --from=builder /app/build /usr/share/nginx/html

# Run as non-root (security hardening)
USER nginx

# Healthcheck for Docker / orchestration
HEALTHCHECK \
  --interval=30s \
  --timeout=3s \
  --start-period=5s \
  --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
