FROM node:22-alpine

RUN adduser --system --uid 1001 worker

WORKDIR /app

COPY package.json package-lock.json ./
COPY workers/phala-worker/package.json workers/phala-worker/package.json
COPY workers/morpheus-relayer/package.json workers/morpheus-relayer/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /data && chown worker /data

USER worker

ENV PORT=8080
EXPOSE 8080

CMD ["node", "workers/phala-worker/src/server.js"]
