FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 CMD-SHELL wget --quiet --tries=1 --spider http://127.0.0.1:${PORT:-3000}/health || exit 1
EXPOSE 3000
CMD ["node", "server.js"]
