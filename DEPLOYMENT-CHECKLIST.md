# APP-005 NETWORK — BUILD 006.3 DEPLOYMENT CHECKLIST

**Release:** BUILD 006.3  
**Deployment status:** NOT DEPLOYED BY THIS PACKAGE  
**Acceptance:** Requires live verification after upload.

## A. Pre-deployment source checks

- [ ] Confirm all files in this package are uploaded without renaming.
- [ ] Confirm `js/config.js` contains the correct Supabase project URL.
- [ ] Confirm the browser-safe publishable key is present and current.
- [ ] Confirm no service-role key, database password or private secret is present.
- [ ] Confirm all telemetry endpoints remain empty unless separately approved and tested.
- [ ] Confirm `analytics.reportingConfigured` remains false until a real reporting endpoint exists.
- [ ] Confirm the deployed backend still exposes the documented Edge Function and RPC contracts.

## B. Browser startup

- [ ] Open the deployed application over HTTPS.
- [ ] Confirm BUILD 006.3 is displayed consistently.
- [ ] Confirm no JavaScript errors appear in the browser console.
- [ ] Confirm navigation opens all nine views.
- [ ] Confirm the application reports READY, not falsely OPERATIONAL.
- [ ] Confirm Supabase client initialization is not misrepresented as a successful backend health check.
- [ ] Confirm telemetry shows NOT CONFIGURED while no endpoints are supplied.

## C. Authentication and access control

- [ ] Confirm anonymous users cannot see protected node inventory.
- [ ] Confirm anonymous users cannot access monitoring history.
- [ ] Sign in with the provisioned administrator account.
- [ ] Confirm `app005-admin-check` returns authorized true, role admin and the matching user ID.
- [ ] Confirm the Node Manager, Monitoring and History protected views unlock only after backend verification.
- [ ] Sign out.
- [ ] Confirm protected views lock and protected in-memory records are cleared.
- [ ] Confirm a normal authenticated non-admin account is rejected by backend verification.

## D. Node Manager

Use a temporary non-public test node only after the operator approves its creation.

- [ ] Confirm REGISTER NODE becomes enabled only after administrator verification.
- [ ] Create one temporary node with a unique node key.
- [ ] Confirm the request uses `action` plus `payload`.
- [ ] Confirm the response is `success: true` and the node appears in inventory.
- [ ] Inspect node details.
- [ ] Update the temporary node's harmless description or name.
- [ ] Change its status and confirm the backend response.
- [ ] Confirm the node inventory table columns align.
- [ ] Confirm CHECK is available only for `pi220-website`.
- [ ] Do not delete the temporary node until cleanup is separately approved and the backend cleanup method is confirmed.

## E. Monitoring and history

- [ ] Run CHECK NODE for `pi220-website`.
- [ ] Confirm request uses `{ action: "check_node", payload: { node_key } }`.
- [ ] Confirm the response matches the BUILD 001 `success / monitor / result` envelope.
- [ ] Confirm a real recorded status, response time and HTTP status are displayed.
- [ ] Refresh protected history.
- [ ] Confirm the history RPC response envelope contains `success`, `node`, `history_count` and `history`.
- [ ] Confirm records appear in both Monitoring and Network History.
- [ ] Confirm sign-out clears both protected history displays.

## F. Telemetry and analytics

- [ ] Do not configure a source until its owner, access model, response schema and CORS policy are confirmed.
- [ ] Test each endpoint independently.
- [ ] Confirm valid telemetry updates only its intended metrics.
- [ ] Confirm the traffic chart plots supplied samples only.
- [ ] Confirm offline, invalid JSON and timeout cases are clearly reported.
- [ ] Confirm the dashboard does not invent visitor, traffic, indexing or public-node values.
- [ ] Confirm GA4 remains NOT CONNECTED until a reporting integration is actually implemented.

## G. PWA and cache safety

- [ ] Confirm the manifest and both SVG icons load.
- [ ] Confirm the service worker registers.
- [ ] Confirm Supabase requests are not cached.
- [ ] Confirm authenticated/protected responses are not cached.
- [ ] Confirm activating APP-005 does not delete caches belonging to other PI220 applications.
- [ ] Confirm a new BUILD 006.3 service-worker cache is created.

## H. Release decision

- [ ] All critical acceptance tests pass.
- [ ] No unresolved critical or high-severity defects remain.
- [ ] Live backend contracts are confirmed.
- [ ] Temporary test data is reconciled with explicit operator approval.
- [ ] Deployment URL and commit/revision are recorded.
- [ ] Final acceptance is explicitly authorized.

**Do not declare production-ready until sections B–H have been completed and evidenced.**
