FROM mcr.microsoft.com/playwright:v1.49.0-noble

WORKDIR /app

COPY package.json .
RUN npm install

COPY screenshot.mjs .

CMD ["node", "screenshot.mjs"]
