# Caddy with the Bunny DNS provider, so private nodes can get TLS via ACME
# DNS-01 (no public port 80). Built once per box during configure/deploy.
FROM caddy:2-builder-alpine AS builder
RUN xcaddy build --with github.com/caddy-dns/bunny

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
