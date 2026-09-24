# Identical node image for every VPS in the pool.
FROM denoland/deno:alpine-2.1.4

WORKDIR /app

# Cache deps first for faster rebuilds (no third-party deps yet, but keeps the
# layer stable and warms the type graph).
COPY deno.json .
COPY src ./src
# Migrations and the tools that apply them travel with the image: a schema change
# belongs to the version of the code that needs it, and the database is only
# reachable from inside the box's compose network anyway.
COPY db ./db
# Each storefront's legal revisions, copied by scripts/sync-legal-revisions.sh (GET /legal/manifest).
COPY legal ./legal
COPY tools ./tools
RUN deno cache src/main.ts

# Run as the built-in non-root user.
USER deno

EXPOSE 8080
# Least-privilege: network + env, read/write only the fs-storage dir (used by
# the local stand; harmless with the bunny transport), and read the legal
# revisions it serves (lib/legal.ts; without it GET /legal/manifest answered
# 503 from the image — test/imports.test.ts holds the list).
CMD ["run", "--allow-net", "--allow-env", "--allow-read=/data,/app/legal", "--allow-write=/data", "src/main.ts"]
