# Rook As-Built Architecture

This directory documents the major deployable and shared parts of the repo as they are built. These notes describe architectural responsibilities rather than cataloguing every source file or test.

## Documents

- [server.md](./server.md) — Fastify server, ACP facade, runtime orchestration, environment system, persistence, and location identification.
- [database.md](./database.md) — SQLite tables, persistence ownership, and the current state of server-side layering.
- [mac-client.md](./mac-client.md) — native macOS app, foreground-app environment provider, Mac bridge, and server supervision.
- [iphone-client.md](./iphone-client.md) — native iPhone app, geofenced place provider, voice, and Live Activity integration.
- [rookkit.md](./rookkit.md) — shared Swift package used by the Apple clients for networking, models, chat rendering, and voice/live-activity types.
- [android-client.md](./android-client.md) — native Android app, Compose UI, ACP client, and movement/location services.
- [cli.md](./cli.md) — minimal Node.js ACP command-line client and automation surface.

## Common system shape

Rook is built around two protocol boundaries:

1. client ↔ server: session discovery over REST (`GET /api/sessions`); agent interaction and transcript replay over one session-bound ACP WebSocket per loaded session at `/api/ws?sessionId=...`
2. server ↔ runtime: ACP over stdio, one owned runtime process group per public session

The server is the stable broker. Native clients and the CLI are thin surfaces over the same REST + ACP contract. Environment-repository storage, capability hashing, materialization, and authoring details are documented in [server.md](./server.md) and [database.md](./database.md).
