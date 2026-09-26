# The web face, built and served inside a container: nothing on the host
# (rule 12). The build context is the repository root, because the screens
# import depth/core by relative path — one core for the terminal and the web.
#
#   docker build -f web/Dockerfile --build-arg VITE_API_KEY=<storefront key> .
#
# The image serves the built page with `vite preview`, which also forwards
# the node's paths to the node named by WEB_NODE_URL (web/vite.config.ts): the
# node's CORS does not yet allow the signed call's headers across origins, and
# a gateway in front of a real deployment forwards the same way.
FROM node:20-alpine

WORKDIR /repo/web
COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY depth/core /repo/depth/core
COPY web/ ./

ARG VITE_BRAND=sosed
ARG VITE_API_KEY=ak_pub_webdev00000000001
ENV VITE_BRAND=$VITE_BRAND VITE_API_KEY=$VITE_API_KEY
RUN npm run build

ENV WEB_NODE_URL=http://node:8080
EXPOSE 4173
CMD ["npm", "run", "preview"]
