FROM node:20.19.5-alpine3.21

WORKDIR /app

# Keep base OS packages patched to reduce vulnerability exposure in image scans.
RUN apk upgrade --no-cache

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
  && npm cache clean --force

COPY . .

USER node

EXPOSE 3000

CMD ["npm", "start"]
