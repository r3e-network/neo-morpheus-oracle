FROM node:22-alpine

RUN adduser --system --uid 1001 relayer

WORKDIR /app

COPY package.json package-lock.json ./
COPY workers/phala-worker/package.json workers/phala-worker/package.json
COPY workers/morpheus-relayer/package.json workers/morpheus-relayer/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /data && chown relayer /data

USER relayer

CMD ["npm", "--prefix", "workers/morpheus-relayer", "run", "start"]
