FROM node:22-alpine

WORKDIR /app
COPY server/package.json ./package.json
COPY server/src ./src
COPY server/scripts ./scripts

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "--experimental-strip-types", "src/server.ts"]
