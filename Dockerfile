# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app

# Install backend deps
COPY backend/package*.json ./
RUN npm install --production

# Copy backend source
COPY backend/ ./

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./public

# Create data directories
RUN mkdir -p /app/data/uploads

# Environment — JWT_SECRET MUST be set at runtime via docker-compose or .env
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV UPLOAD_DIR=/app/data/uploads
# JWT_SECRET is intentionally NOT set here — provide it at container runtime

EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "server.js"]
