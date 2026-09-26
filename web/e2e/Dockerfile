# Playwright with its browsers, as testing/Dockerfile: the browser lives in the
# image, nothing on the host.
FROM mcr.microsoft.com/playwright:v1.49.0-noble
WORKDIR /app
COPY package.json .
RUN npm install
COPY playwright.config.ts .
COPY fixtures ./fixtures
COPY specs ./specs
CMD ["npx", "playwright", "test"]
