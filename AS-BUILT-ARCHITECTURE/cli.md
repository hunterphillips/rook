# CLI Client

## Summary

`clients/cli` is the repository's minimal Node.js ACP client. It is a thin command-line surface over the same REST session-discovery/control plane and session-bound ACP WebSocket used by the native clients. It does not provide an environment sensor or a native UI.

## Main components

- `src/index.mjs`
  - parses command-line arguments and dispatches interactive, one-shot, transcript, session-list, and environment-diagnostics modes
- `src/client.mjs`
  - owns the WebSocket JSON-RPC client, ACP initialization, session creation/loading, prompt streaming, permission cancellation, and environment-offer handling
- `src/commands/sessions.mjs`
  - lists sessions through `GET /api/sessions`
- `src/commands/environments.mjs`
  - lists active/recent environment diagnostics through `GET /api/diagnostics/environments`

## Main interfaces

### Server-facing

- `GET /api/agent_runtimes` — validates a requested runtime before creating a session
- `GET /api/sessions` — discovers an existing session
- `POST /api/session/environments` — joins or leaves environments with `--join` / `--leave`
- ACP WebSocket `/api/ws` — creates or loads a session, streams prompts, and resolves environment offers

### Command modes

- interactive chat: `rook --runtime <id>` or `rook --sessionId <id>`
- one-shot execution: `rook exec ... <prompt>`
- transcript-only replay: `rook --sessionId <id> --transcript`
- session listing: `rook sessions`
- environment diagnostics: `rook environments`

The `exec` mode can emit only the final assistant message with `--last-message-only`. `--title` applies only to newly created sessions. Server URL and bearer authentication come from flags or `ROOK_SERVER_BASE_URL` / `ROOK_AUTH_TOKEN`.

## Main processes

### New session

1. optionally validate the configured runtime through REST
2. open an unbound `/api/ws` connection
3. run ACP `initialize`
4. send `session/new` with the runtime id and title
5. keep the same WebSocket for prompts and environment-offer resolution

### Existing session

1. discover the session through `GET /api/sessions`
2. open `/api/ws?sessionId=...`
3. run ACP `initialize` and requester-private `session/load`
4. stream the transcript and any later prompts on that session-bound socket

### Headless execution

`exec` waits for the prompt response and a short idle period after streamed activity so final tool/output frames are printed before it exits. Permission requests are automatically answered as cancelled. Environment offers received after `--join` are accepted for the joined session in normal output mode.

## Notable architectural characteristics

- the CLI is ACP-first but uses REST for discovery, runtime validation, environment membership, and diagnostics
- it follows the one-WebSocket-per-session contract rather than maintaining a multi-session ACP pipe
- it is intentionally non-interactive with respect to runtime permissions
- it is useful as a smoke-test and automation client, not a replacement for the native environment-aware clients
