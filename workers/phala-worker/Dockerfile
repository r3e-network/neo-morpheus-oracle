FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY workers/phala-worker/package.json workers/phala-worker/package.json
COPY workers/morpheus-relayer/package.json workers/morpheus-relayer/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm install

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "workers/phala-worker/src/server.js"]
