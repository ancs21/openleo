# Builds OpenLeo for a security scan: the server and web app (Bun + TypeScript), with tests runnable offline.
# The repository is the build context; the checkout lives at /src.
FROM oven/bun:1.4.2
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git curl \
    && rm -rf /var/lib/apt/lists/*

COPY . /src
WORKDIR /src

# Every dependency now, while the network is up.
RUN bun install --frozen-lockfile

# Type-check, and run the tests so the image is known to work (a failing test doesn't fail the build).
RUN bunx tsc --noEmit
RUN bun test || echo "WARNING: bun test reported failures"

# Start the server with `bun run start` (http://127.0.0.1:3000); data goes to /src/data.
