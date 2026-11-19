# PI220 — APP-005 NETWORK
## BUILD 006.3 — Corrected Integration Build

**Organization:** Parallel Industries 220  
**Application:** APP-005 NETWORK  
**Build:** 006.3  
**Purpose:** Network administration, protected node management, approved node monitoring, monitoring history, telemetry integration and system control.

---

## 1. Release summary

BUILD 006.3 uses BUILD 006.0 as its interface and feature base, while preserving the verified backend request and response contracts already used by BUILD 005.3.

The release adds/fixes:

- Administrator-only node registration, editing and status management.
- Correct enabling of the Register Node control after server-side administrator verification.
- Correct `app005-node-manager` action/payload envelope.
- Restored verified `app005-node-monitor` request and response contract.
- Restored protected history response-envelope validation.
- Monitoring history displayed in both Monitoring and Network History views.
- Corrected node inventory table structure and last-check display.
- Node details inspection.
- CHECK action shown only for the configured primary monitoring node.
- Traffic chart rendering from measured telemetry samples.
- Telemetry field mapping aligned with the documented camelCase contracts.
- Four-column telemetry source rows.
- Protected node counts remain unavailable rather than displaying misleading zeroes to unauthenticated users.
- Clear distinction between application readiness, initialized Supabase client, administrator verification and external telemetry.
- Service-worker cache cleanup restricted to APP-005-owned caches.
- Consistent BUILD 006.3 identifiers and updated documentation.

No database schema changes or live backend changes are included.

## 2. Application files

```text
APP-005-NETWORK-006.3/
├── index.html
├── manifest.webmanifest
├── sw.js
├── README.md
├── DEPLOYMENT-CHECKLIST.md
├── css/
│   └── style.css
├── js/
│   ├── config.js
│   └── app.js
└── assets/
    ├── icon-192.svg
    └── icon-512.svg
```

## 3. Backend integration contracts

Supabase project:

`https://ronspasnfgqbxcggxyid.supabase.co`

The frontend uses the browser-safe publishable key in `js/config.js`. Never place a service-role key, database password, private signing key or administrator password in frontend files.

### 3.1 Administrator verification

Edge Function:

`app005-admin-check`

The frontend accepts administrator access only when the response confirms:

- `authorized === true`
- `role === "admin"`
- `user_id` exactly matches the authenticated Supabase user ID.

Authentication by itself does not grant administrator access.

### 3.2 Node Manager

Edge Function:

`app005-node-manager`

Request envelope:

```json
{
  "action": "create_node",
  "payload": {
    "node_key": "example-node",
    "name": "Example Node",
    "category": "website",
    "connection_type": "https",
    "is_public": false
  }
}
```

Supported actions:

- `list_nodes`
- `create_node`
- `update_node`
- `set_node_status`

The frontend uses the deployed Node Manager BUILD 002 interface. The backend remains responsible for administrator authorization, database validation and audit logging.

Node creation requires a unique node key, name, category and connection type. Optional fields include endpoint URL, host, port, public description and public visibility.

### 3.3 Approved node monitoring

Edge Function:

`app005-node-monitor` — BUILD 001

The current approved monitoring target is:

- Node key: `pi220-website`
- Endpoint: `https://profdrjamesjessen-cyber.github.io/PI220/`

Request envelope:

```json
{
  "action": "check_node",
  "payload": {
    "node_key": "pi220-website"
  }
}
```

The frontend validates the established response envelope:

- `success === true`
- `monitor === "APP-005 NODE MONITOR BUILD 001"`
- `result.status`
- `result.response_ms`
- optional `result.http_status`
- optional `result.error_code`

Only the configured primary node is offered an active CHECK action. Other registered nodes remain manageable, but are not presented as monitorable until the backend monitoring architecture supports them.

### 3.4 Protected monitoring history

RPC:

`app005_get_node_check_history`

Parameters:

- `p_node_key`
- `p_limit`

Expected response envelope:

```json
{
  "success": true,
  "node": {
    "node_key": "pi220-website"
  },
  "history_count": 1,
  "history": [
    {
      "checked_at": "2026-11-18T13:23:31.477445+00:00",
      "status": "online",
      "response_ms": 208,
      "http_status": 200,
      "error_code": null
    }
  ]
}
```

The frontend validates the envelope and record timestamps before rendering. It does not assume that the RPC returns a bare array.

## 4. Administrator workflow

1. Open the application over HTTPS.
2. Select ADMIN LOGIN.
3. Authenticate with the provisioned Supabase account.
4. Wait for `app005-admin-check` to confirm administrator authorization.
5. Open Node Manager.
6. Register a node, edit an existing node, inspect node details or update node status.
7. Use CHECK only for `pi220-website`.
8. Review protected records in Monitoring or Network History.
9. Sign out to lock protected views and clear protected in-memory data.

The database independently enforces authorization. Frontend visibility controls are not a security boundary.

## 5. Telemetry configuration

The following endpoints are intentionally empty until approved read-only sources are supplied:

- `endpoints.overview`
- `endpoints.visitors`
- `endpoints.traffic`
- `endpoints.indexing`

The application reports `NOT CONFIGURED` until a source is configured and successfully returns a valid JSON object. Public node counts and the public node summary are populated only from the approved overview telemetry response; protected inventory remains separate.

### Overview

Expected fields include:

- `connectedNodes`
- `totalNodes`
- `visitors`
- `sessions`
- `requestsPerMinute`
- `incomingBytesPerSecond`
- `outgoingBytesPerSecond`
- `indexedPages`
- `crawlStatus`
- `sampledAt`

### Visitors

- `visitors`
- `sessions`
- `period`
- `sampledAt`

### Traffic

- `requestsPerMinute`
- `incomingBytesPerSecond`
- `outgoingBytesPerSecond`
- `sampledAt`
- optional `history[]` containing `sampledAt`, `incomingBytesPerSecond` and `outgoingBytesPerSecond`

The chart plots only supplied measurements. It does not generate synthetic traffic.

### Indexing

- `indexedPages`
- `crawlStatus`
- `sampledAt`
- optional `detail`

Endpoints must return valid JSON and permit the application's origin through CORS when cross-origin. Do not place secrets or bearer tokens in browser-readable endpoint URLs.

## 6. Analytics boundary

The configured GA4 measurement ID is a configuration reference only.

A GA4 Reporting API connection is not supplied in this package. `reportingEndpoint` remains empty and `reportingConfigured` remains false. The application must not present a measurement ID as proof that reporting data is connected.

## 7. Current feature boundaries

The following are not represented as completed capabilities:

- External telemetry: not configured.
- GA4 reporting: not connected.
- Public node summary table: no verified public-node response contract is integrated in this frontend build.
- Persistent backend audit-log viewer: not implemented; Event Manager shows current-session local application events only.
- Administrator account/profile management: not exposed by the supplied backend interface.
- Node deletion: not supported by the supplied Node Manager action set.
- Active monitoring for nodes other than `pi220-website`: not configured.
- Full offline operation: not supported; the service worker caches the application shell only.

These boundaries are intentional. The frontend does not invent data or imply unsupported backend operations.

## 8. Progressive Web App

The package includes a web manifest and service worker.

The service worker:
- Caches same-origin application-shell assets only.
- Bypasses Supabase and external requests.
- Does not cache POST requests or protected API responses.
- Uses an APP-005-specific cache prefix.
- Deletes only older caches owned by APP-005, not caches belonging to other PI220 applications on the same origin.

The Supabase JavaScript client is loaded from jsDelivr and therefore requires a network connection unless a future release vendors a reviewed local copy.

## 9. Security principles

- Backend authorization is authoritative.
- No service-role credentials are shipped.
- Private inventory and history are retrieved only after administrator verification.
- The monitoring target is fixed by the deployed monitoring backend.
- Public telemetry never overwrites protected node inventory or monitoring history.
- UI output uses text nodes for database-sourced values.
- The service worker never caches Supabase responses.
- The frontend does not claim that a configured endpoint is healthy until it returns a successful, validated response.

## 10. Validation status

BUILD 006.3 has undergone source-level validation:

- JavaScript syntax checks.
- HTML structure and duplicate-ID checks.
- CSS parsing.
- JSON manifest parsing.
- SVG XML parsing.
- Frontend/backend contract consistency checks.
- Cross-file build identifier checks.
- Service-worker cache-scope review.

A live Supabase integration test, authenticated browser acceptance test and production deployment test have not been performed as part of this offline source build. Those tests must be completed before declaring production acceptance.
