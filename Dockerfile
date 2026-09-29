FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "--require", "@opentelemetry/auto-instrumentations-node/register", "src/server.js"]
