# PKフレンド: single-container deploy (server serves the built PWA + WebSocket)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/shared/package.json shared/
COPY --from=build /app/server/package.json server/
COPY --from=build /app/client/package.json client/
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
EXPOSE 8787
CMD ["node", "server/dist/index.js"]
