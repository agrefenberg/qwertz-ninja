FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DB_FILE=/data/qwertz-ninja.sqlite
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
# Zeigt in „docker ps“, ob die App antwortet (healthy/unhealthy).
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/setup >/dev/null || exit 1
CMD ["node", "--no-warnings=ExperimentalWarning", "server/index.js"]
