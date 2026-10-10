# The text walk's runner: Chromium and the playwright package baked in, so a walk
# needs no registry at run time (scripts/textwalk/run.sh builds it once).
FROM mcr.microsoft.com/playwright:v1.48.2-jammy
WORKDIR /walk
RUN npm init -y >/dev/null && npm i --silent playwright@1.48.2
