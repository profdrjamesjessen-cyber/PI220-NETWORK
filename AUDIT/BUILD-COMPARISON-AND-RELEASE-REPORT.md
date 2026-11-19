# PI220 APP-005 NETWORK
## BUILD 005.3 vs BUILD 006.0 — Objective Comparison and BUILD 006.3 Release Report

**Audit date:** 19 November 2026  
**Source package:** `NETWORK FRONTEND 005.3 006.0.zip`  
**Target build:** BUILD 006.3  
**Audit scope:** Frontend source, configuration, markup, styling, PWA assets, supplied project notes and compatibility with the previously inspected APP-005 backend contracts.  
**Deployment status:** Not deployed by this audit.

---

## 1. Executive conclusion

BUILD 006.0 is a substantial interface expansion over BUILD 005.3, but the supplied source contains integration regressions and incomplete controls. It should not be deployed unchanged.

BUILD 005.3 remains the stronger verified reference for the existing administrator authentication, protected node inventory, manual monitoring and protected monitoring-history integration. It does not provide a node create/edit/status-management interface.

BUILD 006.0 introduces the broader Node Manager and system interface, including a node editor, create/update/status actions, telemetry, analytics, local events, system control and PWA assets. However, several parts of that interface are not operational against the already-established backend contracts.

**Decision:** Use BUILD 006.0 as the interface foundation, preserve the tested BUILD 005.3 backend request/response contracts, and apply the corrections documented below. This produces BUILD 006.3.

BUILD 006.3 is source-validated. It is not yet live-backend accepted or production-certified because no authenticated live deployment test was performed during this source review.

## 2. Source inventory and provenance

### BUILD 005.3

Supplied files:

- `index.html`
- `css/style.css`
- `js/app.js`
- `js/config.js`
- `README.md`
- `appJS-BACKUP.js`
- `js/# PI220 — APP-005 NETWORK ADMINISTRATION.txt`

The linked application uses `js/app.js`, not the root-level `appJS-BACKUP.js`. The backup is an older divergent source file and is not used as the release baseline.

The included master save file identifies P006.1 as complete and P006.2 as pending. Its project status predates the later APP-005 integration work recorded in the current audit history. The included README also retains BUILD 004 / earlier read-only descriptions and is not an authoritative description of the supplied 005.3 application.

### BUILD 006.0

Supplied files:

- `index.html`
- `css/style.css`
- `js/app.js`
- `js/config.js`
- `manifest.webmanifest`
- `sw.js`
- `assets/icon-192.svg`
- `assets/icon-512.svg`
- `README.MD`
- `DEPLOYMENT-CHECKLIST.md`

The BUILD 006.0 app.js header identifies itself as BUILD 006.1, while the HTML, configuration, stylesheet and service worker identify BUILD 006.0. This metadata inconsistency is corrected in BUILD 006.3.

The supplied BUILD 006.0 deployment checklist is a placeholder, not an executable deployment checklist. It is replaced in BUILD 006.3.

## 3. Objective feature comparison

| Capability | BUILD 005.3 | BUILD 006.0 supplied | BUILD 006.3 |
|---|---|---|---|
| Responsive application interface | Present | Expanded | Preserved |
| Administrator sign-in | Present | Present | Preserved |
| Server-side admin verification | Present | Present | Preserved |
| Protected node inventory | Present | Present | Preserved |
| Node registration UI | Not implemented | Form present, trigger disabled | Enabled after verified admin access |
| Node editing UI | Not implemented | Present | Corrected and retained |
| Node status controls | Not implemented in UI | Present | Corrected and retained |
| Primary node manual monitoring | Verified contract in source | Request/response mismatch | Restored verified contract |
| Protected monitoring history | Object-envelope validation | Incorrect bare-array expectation | Restored object-envelope validation |
| History in separate History view | Dynamic protected panel in Nodes | Secondary history table not populated | Both history tables populated |
| Traffic chart | Implemented for measured samples | Canvas has no drawing implementation | Measured-sample chart restored |
| Telemetry endpoint polling | Present | Present | Preserved and corrected |
| Telemetry field contract | Documented camelCase | Several snake_case/renamed field lookups | Aligned with config contract |
| Telemetry source table | Source diagnostics | Four headers / three cells | Four headers / four cells |
| GA4 reporting | Not a reporting integration | Measurement ID shown; no report API | Explicitly marked not connected |
| Local event display | Present | Present | Present; explicitly local |
| PWA manifest/service worker | Not supplied in 005.3 package | Present | Preserved and cache isolation corrected |
| Service-worker cache cleanup | N/A | Deletes every origin cache except its own | Deletes only APP-005-owned old caches |
| Documentation accuracy | Stale | Partially current; checklist placeholder | Rewritten and bounded to actual capabilities |

## 4. Confirmed BUILD 006.0 defects

### 4.1 Node registration control permanently disabled

The supplied HTML marks `node-add-button` as disabled. The supplied JavaScript adds a click listener but never enables the button after administrator verification.

**Effect:** The node editor exists, but the operator cannot open it through the interface.

**BUILD 006.3 correction:** The button remains disabled for public/unauthorized sessions and becomes enabled only after the backend confirms administrator status.

### 4.2 Monitoring request contract regression

BUILD 005.3 sends:

```json
{
  "action": "check_node",
  "payload": {
    "node_key": "pi220-website"
  }
}
```

It validates the BUILD 001 response envelope:

- `success`
- `monitor`
- `result.status`
- `result.response_ms`

BUILD 006.0 sends `node_key` at the top level and then reads `status` and `response_ms` at the top level. This differs from the previously integrated BUILD 005.3 contract.

**Effect:** The new frontend is not aligned with the previously verified monitoring integration.

**BUILD 006.3 correction:** Restored the nested request payload and `success / monitor / result` response validation.

### 4.3 Protected history RPC contract regression

The previously inspected database function returns a JSON object containing:

- `success`
- `node`
- `history_count`
- `history`

BUILD 005.3 validates that object and uses `data.history`.

BUILD 006.0 expects `result.data` itself to be an array.

**Effect:** A valid database response is rejected by BUILD 006.0.

**BUILD 006.3 correction:** Restored validation of the object envelope, node key, history count, record status and timestamp.

### 4.4 Secondary Network History table not populated

BUILD 006.0 contains both `monitor-history-body` and `network-history-body`, but the application only renders into `monitor-history-body`.

**Effect:** The Network History page remains at its initial placeholder even after a successful history retrieval.

**BUILD 006.3 correction:** The validated history records render into both tables, each with its own correct column count.

### 4.5 Node inventory table column mismatch

The BUILD 006.0 table header has six columns. The renderer creates seven cells and does not supply the advertised last-check column.

**BUILD 006.3 correction:** The table now has eight aligned columns: node name, node key, category, connection type, endpoint/host, status, last check and actions.

### 4.6 CHECK action displayed for unsupported nodes

BUILD 006.0 displays a CHECK action for every node, but its monitoring function is configured for the approved primary node only.

**BUILD 006.3 correction:** Active CHECK is shown only for `pi220-website`. Other nodes are clearly marked `MONITOR NOT CONFIGURED`.

### 4.7 Traffic chart not implemented

BUILD 006.0 contains a canvas and empty-state overlay, but its JavaScript has no canvas context, drawing or sample-rendering implementation.

**BUILD 006.3 correction:** A chart renderer plots only numeric samples returned by configured telemetry sources. No synthetic or random data is generated.

### 4.8 Telemetry contract mismatch

The BUILD 006.0 configuration documents camelCase fields such as `requestsPerMinute`, `incomingBytesPerSecond`, `outgoingBytesPerSecond`, `indexedPages` and `crawlStatus`. The application looks for different names such as `requests`, `incoming`, `outgoing`, `indexed_pages` and `crawl_status`.

**Effect:** Valid responses matching the supplied configuration documentation may not update the intended metrics.

**BUILD 006.3 correction:** Telemetry mapping follows the documented camelCase contracts and keeps each source limited to its relevant metric group.

### 4.9 Telemetry source table has an incomplete row

The HTML defines four table headers, while BUILD 006.0 adds only three cells per source row.

**BUILD 006.3 correction:** Each source row now contains source, configuration, status and last-received values.

### 4.10 Misleading protected node counts for public users

BUILD 006.0 clears the protected inventory for non-admin users and then computes metrics from the empty local array, producing zero counts.

**Effect:** An unauthenticated visitor can see `0` as if the system had verified that there are no nodes.

**BUILD 006.3 correction:** Protected node counts display unavailable/locked until administrator verification succeeds.

### 4.11 Incorrect status-dot class names

BUILD 006.0 toggles `online` and `offline`, while the stylesheet defines `status-online`, `status-offline`, `status-warning` and `status-unknown`.

**BUILD 006.3 correction:** Status classes now match the stylesheet, and application readiness is not labelled as full operational health.

### 4.12 Unverified functions labelled AVAILABLE

BUILD 006.0 marks the Node Manager and Node Monitor as AVAILABLE merely because their names are configured.

**BUILD 006.3 correction:** System Control reports `CONFIGURED — NOT PROBED` until an actual request is tested.

### 4.13 Service worker deletes unrelated origin caches

BUILD 006.0 deletes every cache on the origin except its own. Multiple PI220 applications can share an origin.

**Effect:** Activating APP-005 could delete caches belonging to other PI220 applications.

**BUILD 006.3 correction:** Cache cleanup is restricted to names with the APP-005-specific `pi220-app005-network-` prefix. Cache writes are also tied to the fetch event lifetime.

### 4.14 Incomplete documentation and build metadata

BUILD 006.0 contains a 006.1 app.js header, 006.0 elsewhere, and a placeholder deployment checklist.

**BUILD 006.3 correction:** Build identifiers are aligned and the README and deployment checklist are rewritten.

## 5. Additional operational boundaries

The supplied backend and configuration do not establish the following capabilities. BUILD 006.3 does not invent them:

1. External telemetry endpoints are empty/not configured.
2. GA4 Reporting API access is not implemented; a measurement ID alone is not reporting access.
3. The public node summary is populated only from a configured overview telemetry source supplying the documented public `nodes[]` fields; the protected administrator inventory is never exposed in that table.
4. Event Manager records current-session local application events, not persistent database audit logs.
5. Administrator profile/account management is not exposed by the supplied backend action set.
6. Node deletion is not supported by the supplied Node Manager actions.
7. Active monitoring is configured only for `pi220-website`.
8. The Supabase JavaScript client is loaded from jsDelivr; the application shell cache does not vendor that dependency for offline operation.

## 6. BUILD 006.3 changes

The release is based on the BUILD 006.0 interface and preserves the previously established BUILD 005.3 backend contracts.

Corrections applied:

- Administrator-gated node creation control.
- Correct node create/update/status request envelope.
- Exact monitoring request and response contract.
- Exact protected-history response envelope.
- Dual history rendering.
- Correct node inventory table.
- Node detail inspector.
- Primary-node-only CHECK control.
- Real telemetry chart rendering.
- CamelCase telemetry mapping.
- Complete telemetry source rows.
- Accurate locked metrics for non-admin users.
- Accurate application/system status labels.
- Correct status CSS classes.
- APP-005-scoped service-worker cache cleanup.
- Consistent BUILD 006.3 metadata.
- Updated technical README.
- Complete deployment acceptance checklist.

No SQL, database, Edge Function or Supabase project configuration was modified.

## 7. Validation performed

The BUILD 006.3 source package was checked for:

- JavaScript syntax (`node --check`) on app.js, config.js and sw.js.
- HTML parsing and duplicate IDs.
- CSS stylesheet parsing.
- Manifest JSON validity.
- SVG XML validity.
- Build identifier consistency.
- Presence of required DOM IDs.
- Node Manager action and payload shape.
- Monitoring request and response contract.
- Protected history envelope contract.
- Node table column alignment.
- Monitoring and Network History table column alignment.
- Telemetry table column alignment.
- APP-005-only service-worker cache deletion.

The detailed outcomes are recorded in `STATIC-VALIDATION-REPORT.md`.

## 8. Tests not performed

This source package was prepared without live Supabase credentials or a live deployed browser session.

Therefore, the following remain unverified:

- Actual administrator sign-in on the deployed BUILD 006.3.
- Actual create/update/status database transactions.
- Actual monitoring requests and recorded results.
- Actual protected history retrieval.
- Real telemetry endpoint responses.
- Browser-specific PWA installation and update behaviour.
- Production hosting, CORS and cache behaviour.

The deployment checklist contains the required acceptance sequence. No production-readiness certification is issued by static source validation alone.

## 9. Release decision

**BUILD 006.3 — SOURCE PACKAGE PREPARED / STATIC VALIDATION PASSED.**

**Live acceptance:** Pending deployment and authenticated end-to-end verification.  
**Database changes:** None.  
**Production deployment:** Not performed.  
**Security certification:** Not issued.

---

**PI220 — PARALLEL INDUSTRIES 220**  
*Mission • Unity • Future • Unstoppable*

Prof D.Sc Jesse Jessen  
Director • Owner • Master • Parallel Industries 220

Prof Dr Sentient  
AI Architect • General Chief Advisor & Assistant for PI220
