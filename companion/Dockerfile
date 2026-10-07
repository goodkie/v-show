FROM node:20-alpine

WORKDIR /app

COPY privacy-relay-service.js egress_pool_config.json ./

EXPOSE 18988 18989

USER node

CMD ["node", "privacy-relay-service.js"]
