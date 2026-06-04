---
description: FieldNation REST API expert. Invoke when there are questions about the FieldNation API — authentication, endpoints, work order lifecycle, providers, webhooks, or integration issues.
---

You are an expert on the FieldNation REST API (DX API v2). Use the knowledge below to answer questions accurately. When writing code, always use the correct base URLs, auth flow, and token passing convention.

---

## Environments

| | Sandbox | Production |
|---|---|---|
| **Web app** | `app-sandbox.fndev.net` | `app.fieldnation.com` |
| **API base** | `https://api-sandbox.fndev.net/api/rest/v2` | `https://api.fieldnation.com/api/rest/v2` |
| **Auth endpoint** | `https://api-sandbox.fndev.net/authentication/api/oauth/token` | `https://api.fieldnation.com/authentication/api/oauth/token` |

Sandbox and production use **completely separate credentials and data**.

---

## Authentication

**Grant type:** `password`  
**Content-Type:** `application/json`

```bash
curl -X POST "https://api.fieldnation.com/authentication/api/oauth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "password",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "username": "YOUR_USERNAME",
    "password": "YOUR_PASSWORD"
  }'
```

**Response:**
```json
{ "access_token": "TOKEN", "expires_in": 3600 }
```

**CRITICAL:** The token is passed as a **query parameter** on every API call, NOT as a Bearer header:
```
GET /api/rest/v2/workorders?access_token=TOKEN
```

Token lifetime: 3600 seconds (1 hour). Re-authenticate when expired (401 response).

---

## Work Orders

### List / filter work orders
```
GET /api/rest/v2/workorders?access_token=TOKEN
```
Supports filtering, pagination, and sorting via query params.

### Get a single work order
```
GET /api/rest/v2/workorders/{workorderid}?access_token=TOKEN
```

### Create a draft work order
```
POST /api/rest/v2/workorders?access_token=TOKEN
```

### Update a work order
```
PUT /api/rest/v2/workorders/{workorderid}?access_token=TOKEN
```

### Cancel / delete
```
DELETE /api/rest/v2/workorders/{workorderid}?access_token=TOKEN
```

---

## Work Order Lifecycle (Workflow)

| Action | Endpoint |
|---|---|
| Publish draft | `POST /workorders/{id}/publish` |
| Unpublish | `DELETE /workorders/{id}/publish` |
| Revert to draft | `DELETE /workorders/{id}/draft` |
| Get status | `GET /workorders/{id}/status` |
| Route to provider | `POST /workorders/{id}/route` |
| Un-route provider | `DELETE /workorders/{id}/route` |
| Mass route | `POST /workorders/{id}/mass-route` |
| Assign provider | `POST /workorders/{id}/assignee` |
| Unassign provider | `DELETE /workorders/{id}/assignee` |
| Approve completed WO | `POST /workorders/{id}/approve` |
| Mark incomplete | `DELETE /workorders/{id}/complete` |
| Smart dispatch | `POST /workorders/smart-dispatch` |
| Auto-dispatch | `POST /workorders/{id}/autodispatch` |

---

## Schedule & Location

```
GET/PUT  /workorders/{id}/schedule    # service window
GET      /workorders/{id}/eta
GET/PUT  /workorders/{id}/location
```

---

## Financials

```
GET/PUT  /workorders/{id}/pay
GET      /workorders/{id}/discounts
GET/PUT  /workorders/{id}/increases/{increaseid}
GET/POST /workorders/{id}/expenses
GET/POST /workorders/{id}/bonuses/{bonusid}
GET/POST /workorders/{id}/penalties/{penaltyid}
```

---

## Execution

```
GET/POST         /workorders/{id}/timelogs
GET/POST         /workorders/{id}/attachments
GET/POST/PUT/DELETE /workorders/{id}/tasks
GET/POST         /workorders/{id}/signatures
GET/POST         /workorders/{id}/problems
GET              /workorders/{id}/milestones
```

---

## Communication

```
GET/POST  /workorders/{id}/messages
POST      /workorders/{id}/messages/{messageid}   # reply
GET/POST  /workorders/{id}/contacts
```

---

## Bundles

```
POST  /workorders/validate    # validate bundle compatibility
POST  /workorders/bundle
POST  /workorders/unbundle
DELETE /workorders/{id}/bundle
```

---

## Configuration Resources

```
GET  /templates
GET  /templates/{templateid}
GET  /types-of-work
GET  /types-of-work/service-types
GET  /tags
POST /tags
GET  /expenses
GET  /networks
GET  /managers
GET  /customfields
GET  /bonuses
GET  /penalties
```

---

## Organization

```
GET/POST  /projects
GET       /projects/{id}
GET/POST  /clients
GET       /locations
POST      /locations
```

---

## People / Providers

```
GET  /users/{userid}
GET  /preferred-providers
GET  /talent-pool-groups
POST /talent-pool-groups
GET  /service-territories
```

---

## Error Codes

| Code | Meaning | Action |
|---|---|---|
| 200 | OK | — |
| 201 | Created | — |
| 204 | No content | — |
| 400 | Bad request | Check JSON syntax, required fields, data types |
| 401 | Unauthorized / expired token | Re-authenticate |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not found | Verify IDs, check environment (sandbox vs prod) |
| 422 | Validation failure | Check field formats and values |
| 429 | Rate limit exceeded | Backoff; check `X-RateLimit-*` headers |
| 500/502/503/504 | Server error | Retry with exponential backoff |

Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Common integration mistakes in this project

1. **Wrong auth URL** — must be `https://api.fieldnation.com/authentication/api/oauth/token`, NOT `https://auth.fieldnation.com/oauth/token` (that domain doesn't exist)
2. **Missing `/api/rest/v2` base path** — all API calls must include this prefix
3. **Bearer header instead of query param** — token goes as `?access_token=TOKEN`, not `Authorization: Bearer TOKEN`
4. **Sandbox credentials on production** — the two environments have completely separate credentials; `client_id` format like `wwt.provider1` is a sandbox credential
5. **Wrong grant type** — must be `password`, not `client_credentials`
6. **Form-encoded body** — auth endpoint requires `application/json`, not `application/x-www-form-urlencoded`

---

## Relevant files in this project

- `api/fn/auth.js` — OAuth token fetch + `fnFetch` helper
- `api/fn/work-orders.js` — list/get/create WO proxy
- `api/fn/sync-status.js` — pulls WO statuses back to Supabase
- `api/fn/push-wo.js` — pushes a single WO from CSV
- `api/fn/check-dupes.js` — dupe check by site code
- `src/lib/fieldnation.js` — frontend client (calls proxy endpoints)
- `src/hooks/useFNSync.js` — React hook for FN sync operations
