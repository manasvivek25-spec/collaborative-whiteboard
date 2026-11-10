# Production Full-Stack Whiteboard Dockerfile
FROM node:24-alpine

WORKDIR /app

# Copy root and package manifests
COPY package.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install dependencies
RUN npm run install-all

# Copy all source files
COPY server/ ./server/
COPY client/ ./client/

# Build React + Vite client for production
RUN npm run build

# Expose port (default 5000)
ENV PORT=5000
EXPOSE 5000

# Start production server
CMD ["node", "server/server.js"]

