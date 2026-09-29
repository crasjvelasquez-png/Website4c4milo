FROM node:24-alpine AS build
WORKDIR /app
COPY package.json content.json ./
COPY lib ./lib
COPY scripts ./scripts
COPY public ./public
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json content.json server.mjs ./
COPY --chown=node:node lib ./lib
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
