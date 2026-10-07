FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY src ./src
COPY tsconfig.json ./tsconfig.json

ENV NODE_ENV=production
CMD ["node", "--import", "tsx", "src/index.ts"]
