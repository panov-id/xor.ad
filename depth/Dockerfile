# The terminal face of xor.ad. Node runs the sources as they are: types are
# stripped at load, so there is no build step and nothing to get out of sync
# with what the tests run.
FROM node:24.21.0-alpine

WORKDIR /depth
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY core ./core
COPY ink ./ink

# The identity's key never reaches the disk: it is generated non-extractable
# (depth-core panel, 2026-09-21), so nothing here is worth persisting and no
# volume is mounted. Quitting forgets the identity, the point and the chat.
# Not root: the terminal needs nothing but a socket to the node (security
# lens, 2026-09-22). The image carries no mounts, so nothing else changes.
USER node

ENV NODE_ENV=production NODE_NO_WARNINGS=1
ENTRYPOINT ["node", "--experimental-transform-types", "ink/main.ts"]
