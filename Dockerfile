FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm install -g pm2

COPY . .

EXPOSE 3000

CMD ["pm2-runtime", "ecosystem.config.js"]
