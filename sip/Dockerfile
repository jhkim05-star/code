FROM node:22-alpine
WORKDIR /app
COPY package.json README.md index.html manifest.webmanifest sw.js version.json ./
COPY assets ./assets
COPY server ./server
RUN mkdir -p /data/sip && chown -R node:node /data/sip
ENV HOST=0.0.0.0 PORT=8134 SIP_DATA_DIR=/data/sip
USER node
EXPOSE 8134
CMD ["node", "server/index.mjs"]
