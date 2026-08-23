# Android Client

## Summary

The Android client is a native Kotlin + Jetpack Compose app that mirrors the iPhone client's session/chat architecture, uses an ACP WebSocket client plus REST control plane, and adds Android-specific background location services built around a foreground `MovementService` instead of iOS geofences.

## Main components

- `RookViewModel`
  - main app reducer and state owner
  - mirrors the iPhone `RookModel` closely
- `MainActivity` / `RookApp`
  - Compose root, dialog/sheet host, and intent wiring
- `net/AcpSocket`
  - OkHttp WebSocket ACP client with event reduction into `AcpClientEvent`
- `net/RookApi`
  - OkHttp REST client for health, runtimes, environments, and location registration
- `LocationController`
  - process-wide location/presence controller shared by UI and services
- `MovementService`
  - long-lived foreground service using GPS + accelerometer + activity recognition to infer arrivals
- `RecordingService`
  - optional foreground data-collection service that writes synchronized accelerometer/GPS CSV recordings to `Downloads/Rook`
- `RookPresenceService`
  - persistent process-alive foreground notification independent of location/recording state
- `LocationSource`
  - selects Google Play Services fused location or an AOSP `LocationManager` fallback
- `PlaceStore`
  - persisted place/suggestion state
- `net/AuthTokenStore`
  - Android Keystore-backed encrypted bearer-token storage
- Compose UI screens
  - agent picker, chat, settings, places, environments, environment offer sheet

## Main interfaces

### Server-facing
- ACP WebSocket `/api/ws`
- REST calls for runtimes, health, environment preview/list, environment registration, and `register-location`

### Android/system-facing
- foreground service with persistent notification
- fused or fallback location source
- accelerometer sampling
- optional activity-recognition automotive signal
- Google Play Services fused location with an AOSP `LocationManager` fallback
- persistent presence and movement foreground services
- optional synchronized sensor/GPS recording to public Downloads
- plain shared preferences for non-sensitive settings and Android Keystore-backed encrypted auth token storage

## Core data schemas

### View-model state
StateFlows for:
- server state
- agents and sessions
- current session and chat visibility
- pinned/recent session organization and session-management state
- `blocks: List<ChatBlock>`
- queued messages
- environment offers and environment list items
- places, suggestions, place skill status
- current place name / `placeEnvironmentId`
- nearby location candidates
- settings-sheet visibility

### Arrival context
`LocationController.ArrivalContext`:
- `latitude`, `longitude`
- optional `horizontalAccuracy`
- optional `dwellSeconds`
- `isStationary`
- optional `speedMetersPerSecond`

### Chat and API models
Android defines Kotlin equivalents of the Swift shared models:
- `AgentDefinition`, `AgentSessionSummary`
- `EnvironmentOffer`, `EnvironmentCandidate`, `EnvironmentListItem`, `EnvironmentPreview`
- `EnvironmentBundlePreview` with facts, `llms.txt`, and derived bundle hash
- `ChatBlock`, `ChatBlockKind`, `ToolBlockState`, `PlanEntry`
- `AcpClientEvent`

## Main processes

### App startup
1. `MainActivity` creates or reuses the singleton `LocationController`
2. optional server-url and simulated-arrival intent extras are applied
3. `LocationController` starts `RookPresenceService`, which keeps a persistent Rook notification independent of location tracking
4. `RookApp` creates the `RookViewModel`
5. `viewModel.start()` wires socket collectors, location callbacks, and periodic health refresh

### Chat flow
1. `RookViewModel` opens an unbound ACP socket only for `session/new`, then the server binds it to the created session
2. resuming an existing session opens `/api/ws?sessionId=...` and selects that session
3. all resumed sessions use ACP `session/load`; a recovery replay replaces the cached blocks rather than appending to them
4. `AcpSocket` reduces standard WebSocket ACP frames into `AcpClientEvent`
5. `RookViewModel` turns those events into `ChatBlock` lists and run state
6. reconnect logic reopens the session-bound socket, reloads the session through ACP to replace cached blocks, and flushes queued prompts
7. session rows support rename, delete, and pin/unpin through REST; the API client also exposes the server's pinned-order endpoint

### Place registration flow
1. region-like place state comes from `MovementService` checking current location against saved places
2. `LocationController.emitRegionChange` informs the UI when bound
3. `RookViewModel.handlePlace` previews `location:<slug>`
4. if bundles exist, it registers that place environment with the server

### Arrival detection flow
1. `MovementService` samples GPS, accelerometer, and optional activity-recognition state
2. `MovementClassifier` emits movement votes
3. `VoteDebouncer` stabilizes them
4. on transition into stationary, the service builds an arrival context
5. if UI is bound, `RookViewModel` posts `register-location`
6. if app is headless, the service posts `register-location` directly using persisted server credentials

### Sensor recording flow
1. an explicit recording action starts `RecordingService` as a location foreground service
2. `LocationSource` records GPS and a background sensor thread records accelerometer samples on the same elapsed-realtime clock
3. the service periodically flushes a combined CSV to `Downloads/Rook` and clears the MediaStore pending flag
4. stopping the service closes the file and clears recording state; recordings are diagnostic/classifier-training data, not normal arrival state

### Environment offer flow
1. server emits `_com.rookkeeper/environment_offer`
2. `AcpSocket` maps it to `AcpClientEvent.EnvironmentOffered`
3. `RookViewModel` stores the pending offer
4. Compose renders `EnvironmentOfferSheet`
5. decision is sent back over the ACP extension

## Notable architectural characteristics

- Android uses a service-based movement classifier instead of iOS region monitoring
- the location controller is intentionally process-wide so UI and services share one source of truth when the process is alive
- the client is structurally close to the iPhone client, but the sensor/process model is much more Android-native
- Android's session transport uses the same ACP-only replay and bounded client-message contract as the Apple clients
- standard ACP notifications are the event protocol
