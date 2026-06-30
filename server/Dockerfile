# Use Node.js LTS with FFmpeg
FROM node:20-slim

# Install FFmpeg and curl (for healthcheck)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files (including lockfile for reproducible builds)
COPY package.json package-lock.json ./

# Install dependencies using clean install
RUN npm ci --omit=dev

# Copy source code
COPY index.js ./

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start server
CMD ["node", "index.js"]
