FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY README.md PATTERNS.md CONTROL.md LICENSE ./

# By default drop into the headless help so the container is useful without a TTY
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["help"]
