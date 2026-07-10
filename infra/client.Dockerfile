FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci --workspace client --include-workspace-root=false

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY client ./client
# Remove any local env overrides so the correct SERVER_URL is used at build time
RUN rm -f client/.env.local client/.env
ENV SERVER_URL=http://server:4000
RUN npm --workspace client run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/client/package.json ./client/package.json
COPY --from=builder /app/client/next.config.ts ./client/next.config.ts
COPY --from=builder /app/client/.next ./client/.next
EXPOSE 3000
CMD ["npm", "--workspace", "client", "run", "start"]

