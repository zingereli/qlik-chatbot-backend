FROM node:20-slim

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the backend
COPY server.js prompts.js ./

# Cloud Run provides PORT; the app reads process.env.PORT
ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]