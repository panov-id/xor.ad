# The web face, built and served inside a container: nothing on the host
# (rule 12). The build context is the repository root, because the screens
# import depth/core by relative path — one core for the terminal and the web.
#
#   docker build -f web/Dockerfile --build-arg VITE_API_KEY=<storefront key> .
#
# The image serves the built page with `vite preview`, which also forwards
# the node's paths to the node named by WEB_NODE_URL (web/vite.config.ts): one
# origin for the stand, the way a gateway in front of a real deployment
# forwards; the node's CORS admits the signed headers since W1b as well.
FROM node:20-alpine

WORKDIR /repo/web
COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY depth/core /repo/depth/core
COPY depth/ink/locales /repo/depth/ink/locales
COPY panel/design/kit /repo/panel/design/kit
COPY panel/design/fonts /repo/panel/design/fonts
COPY web/ ./

ARG VITE_BRAND=sosed
ARG VITE_API_KEY=ak_pub_webdev00000000001
ARG VITE_STAND=0
ENV VITE_BRAND=$VITE_BRAND VITE_API_KEY=$VITE_API_KEY VITE_STAND=$VITE_STAND
RUN npm run build

# A certificate for the stand's https service (web-adv, A1): the cabinet's
# cookies are __Host- and Secure, which Chromium keeps only from https. Used
# only when WEB_TLS=1 (vite.config.ts); a self-signed one, for the stand.
RUN apk add --no-cache openssl \
 && openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=web-adv" \
      -addext "subjectAltName=DNS:web-adv,DNS:localhost" -keyout /repo/tls.key -out /repo/tls.crt

ENV WEB_NODE_URL=http://node:8080
EXPOSE 4173
CMD ["npm", "run", "preview"]
