FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY server.mjs ./
COPY scripts ./scripts
COPY web ./web
COPY card-research ./card-research
COPY docs ./docs
RUN mkdir -p /app/runtime/data /app/runtime/captures

ENV HOST=0.0.0.0
ENV PORT=4173
ENV AUTO_REFRESH=1
ENV REFRESH_MS=60000
ENV DATA_DIR=/app/runtime/data
ENV CAPTURE_DIR=/app/runtime/captures

EXPOSE 4173
CMD ["npm", "start"]
