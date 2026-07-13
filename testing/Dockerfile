FROM mcr.microsoft.com/playwright:v1.49.0-noble

WORKDIR /app

COPY package.json .
RUN npm install

COPY screenshot.mjs .
COPY brand-splash.mjs .
COPY dev-splash.mjs .

CMD ["node", "screenshot.mjs"]
