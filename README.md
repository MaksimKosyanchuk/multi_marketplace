# Multi-Vendor Marketplace

Pet project for the Fullstack JS Advanced brief: several independent sellers,
one customer checkout that splits into per-seller sub-orders, 10% platform
commission, timed auctions, real-time stock/bids, transactional outbox and
faceted catalog search.

A checkout creates one parent `Order` and one `SellerOrder` per involved seller,
with immutable line snapshots and ledger rows. Auction lots use optimistic
locking on bids and a limited winner checkout window.

## Roles

- **Customer** — catalog, cart, checkout, bids, reviews on completed purchases,
  disputes.
- **Seller** — own products, auctions and seller sub-orders only. Sellers
  **cannot buy or bid** (avoids self-rating and bidding on own lots). After a
  customer becomes a seller, past **purchase history stays available**.
- **Admin** — seller/product moderation, disputes, analytics.

## Technology stack and why

| Layer | Choice | Why |
| --- | --- | --- |
| Backend | NestJS + TypeScript | Modular monolith with explicit module boundaries (TZ allows this over microservices) |
| Frontend | React + TypeScript + Vite | Typed SPA: catalog, cart, auctions, customer/seller/admin cabinets |
| Database | PostgreSQL + **Prisma** | Required transactional guarantees for checkout, stock and money; Prisma migrations + typed client |
| Search | **Meilisearch** | Faceted catalog (name, category, price, seller, rating, stock); lighter than Elasticsearch for this size |
| Queues / events | **Redis + BullMQ** | Domain events and background jobs; Redis is also cache and auth temp state |
| Real-time | Socket.IO | Live stock, auction bids, order status; REST resync after reconnect |
| Auth | JWT access + refresh, Google OAuth2 | Cookie refresh; Google merges into the same user by verified email |
| Observability | Structured logs + `GET /metrics` | Correlation ID across HTTP, outbox and workers; Prometheus text |
| Containers | Docker + Compose | Postgres, Redis, Meilisearch, backend, frontend. No Helm (optional in TZ) |

Swagger: `http://localhost:3001/api/docs`

Env templates: `backend/.env.example`, `backend/.env.development`,
`backend/.env.test`, `frontend/.env.example`.

## Component interaction

```text
Browser (React)
  │ HTTP + Socket.IO
  ▼
NestJS API  ──JWT──► Auth / Users / Sellers
  │
  ├─ Cart / Orders / Payments-ledger     ── UnitOfWork + Prisma ──► PostgreSQL
  ├─ Bidding                              ── version/currentPrice lock ──► PostgreSQL
  ├─ Products / Categories / Reviews
  │
  └─ same DB transaction writes OutboxEvent
                    │
                    ▼  poll PENDING (availableAt)
              Dispatchers (BullMQ; QueueModule only)
                    │
        ┌───────────┼───────────┬──────────────┐
        ▼           ▼           ▼              ▼
     orders     auctions     search      notifications
     worker     worker       worker      worker
        │           │           │              │
        ▼           ▼           ▼              ▼
     Socket.IO   Socket.IO   Meilisearch   in-app + WS
```

Queue names live in global `QueueModule`. Feature services write outbox rows;
they do not call BullMQ. Search index is updated from Product/Review outbox,
not dual-written in the HTTP request.

## Architecture

Modular monolith. Module map vs TZ:

`auth`, `users` (inside auth/users), `sellers`, `products`, `categories`,
`search` (search-sync), `cart`, `orders`, `bidding`, `payments` (ledger /
mock charge), `analytics`, `notifications`, plus `disputes`, `reviews`,
`logger`, `metrics`, `redis`, `queue`.

**Controller → service → repository:** checkout, bidding and product catalog
go through `backend/src/database/` (`UnitOfWork` + cart/order/product/outbox/
auction/bid repositories). Domain rules stay in services. BullMQ and Meilisearch
are isolated behind dispatchers/processors and `SearchService` (PostgreSQL
fallback if the index is down).

Analytics uses dedicated read queries (dashboard aggregates, CSV/JSON export).

## Consistency model

**Strong consistency (one PostgreSQL transaction via `UnitOfWork`):**

- multi-vendor checkout and stock decrement for every line
- commission / seller earnings / ledger rows
- bid accept with `version` + `currentPrice` (no lost update)
- cancel / partial refund
- **outbox insert in the same commit** as the domain write (auction schedule
  start/end/checkout-expiry and `payment.paid` included)

If Redis is down after `COMMIT`, the outbox row stays `PENDING`; a dispatcher
enqueues when Redis is back. That is the TZ outbox rule (no “event sent,
transaction rolled back” and no “committed, job never queued” for those paths).

**Eventual consistency (outbox → BullMQ → workers):**

- Meilisearch document index
- Socket.IO fan-out (stock, bid, order status)
- in-app notifications

Workers are at-least-once. Effects are idempotent (`eventConsumerReceipt`,
idempotency keys, Redis `SET NX` where used). After WebSocket reconnect the
client resubscribes and **REST is the source of truth** (`/orders/resync` and
normal GETs), not a missed push.

**Compensation:** cancelling one `SellerOrder` restores that seller’s stock and
recalculates commission; sibling sub-orders stay active. Partial refunds adjust
ledger/payment totals for the refunded quantity only. If Meilisearch fails,
catalog search falls back to PostgreSQL.

## How the product works (short)

**Auth.** Email+password or Google. Same verified email = one account (merge).
Seller status is an admin-moderated application. JWT access + rotating refresh
in HttpOnly cookies.

**Catalog.** Seller CRUD on own products (`fixed_price` | `auction`). Admin owns
categories and product/seller moderation. Rating from verified purchase reviews
only. Facets go through Meilisearch (name, category, price range, seller,
rating, in-stock). Redis caches list/detail/search keys and invalidates on
writes.

**Auctions.** Start price, increment, deadline. Bids below current+step are
rejected. Concurrent bids use optimistic row version. After deadline a
background outbox job marks `SOLD` (winner) or `EXPIRED`. Winner has 15 minutes
to checkout; otherwise the lot is released.

**Orders.** Cart can mix sellers. One checkout → one `Order` + N `SellerOrder`.
Status per seller: New / Payment pending → Processing → Shipped → Completed |
Cancelled. Parent status is derived (e.g. partially shipped). Isolated cancel
and per-item partial refund.

**Realtime.** Socket.IO: remaining stock, live bid, order status for customer
and seller. Reconnect + REST resync.

**Admin / seller cabinets.** Seller apply + product moderation, disputes,
platform commission, revenue by seller, top products/sellers, 30-day sales
chart vs previous period, CSV and JSON export. Seller dashboard: own revenue,
sub-orders, bids on own lots, catalog/auctions.

Payments are **mocked** (TZ: no real PSP).

## Running

### Docker Compose (required path)

From the repository root:

```bash
docker compose up --build
```

| Service | URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| Backend API / Swagger | http://localhost:3001 / `/api/docs` |
| PostgreSQL | localhost:5432 |
| Redis (BullMQ + cache) | localhost:6379 |
| Meilisearch | http://localhost:7700 |

Backend runs Prisma migrations on startup. Stop with `docker compose down`.

### Environment

Backend loads `.env.${NODE_ENV}` then `.env`:

- `backend/.env.development` — local / Compose
- `backend/.env.test` — unit / e2e / CI e2e-load
- `backend/.env.example` — documented defaults

`npm run start:dev` sets `NODE_ENV=development`. Jest sets `NODE_ENV=test`
(throttling is skipped in test).

### Rate limits

- Default API: **300 req/min**
- Login / Google: **10/min**
- Place bid: **30/min**
- `/metrics` is not throttled

Load tests against a running API:

```bash
THROTTLE_DISABLED=true docker compose up --build
cd backend && npm run test:load
```

### Local (infra only in Compose)

```bash
docker compose up -d postgres redis meilisearch
cd backend && npm install && npx prisma migrate deploy && npm run start:dev
cd frontend && npm install && npm run dev
```

Copy `frontend/.env.example` → `frontend/.env`. Google button needs
`VITE_GOOGLE_CLIENT_ID` from a Google Cloud OAuth **Web** client with
`http://localhost:5173` as origin. Without it the rest of the app still runs.

## CI and tests

GitHub Actions (`.github/workflows/ci.yml`) runs on **push and pull request**
to `main` / `master` / `develop`. Four jobs run **in parallel** (each on its
own runner). A **green workflow means all of them passed**:

| Job | What TZ asked | What runs |
| --- | --- | --- |
| Infrastructure Lint | compose / CI / Docker lint | `docker compose config`, Dockerfile `--check`, lint scripts exist and have no `--fix` |
| Frontend & Backend Lint | lint on PR | `npm run lint` in `backend/` and `frontend/` |
| Build & Unit Tests | unit tests | Prisma generate, Nest + Vite build, frontend Vitest, backend Jest unit |
| Backend E2E & Load | e2e + load | Compose **only** Postgres/Redis/Meilisearch (`--no-build`, no app image builds), `npm run test:e2e`, Nest build, API process, `npm run test:load` |

The e2e/load job does **not** `docker compose up --build` for frontend/backend:
two Node image builds plus the stack OOMs a ~7GB GitHub runner (exit **137**).
Infra images + tests on the runner is the TZ pipeline without that spike.

### Local commands

```bash
cd backend && npm test
cd backend && npm run test:e2e    # Postgres + Redis + Meilisearch
cd backend && npm run test:load   # running API on :3001 + DB
cd frontend && npm test
```

### What the suites cover (TZ §5)

**Unit:** multi-vendor checkout (SellerOrder count, snapshots, 10% commission,
outbox), stock, parent status aggregation, bid accept/reject and version races,
refund/cancel isolation, outbox processor idempotency, queue duration metrics
on search/notifications workers.

**E2E (`backend/test/order-flow-e2e-spec.ts`):** multi-seller cart → checkout →
correct `SellerOrder` count and stock; concurrent bids, one winner, no lost
update; repeated outbox delivery → one consumer receipt. Extra races: last
second bid, winner checkout vs expiry, concurrent partial refunds, isolated
sub-order cancel, archive vs foreign cart.

**Frontend:** ProductCard / OrderItem; Socket.IO reconnect (room + REST resync).
Storybook exists for key UI pieces.

**Load:** limited-stock checkout (TZ: many concurrent checkouts on scarce
stock). Self-contained: four customers, stock `2`, four parallel checkouts.

## Load test report

```bash
cd backend && npm run test:load
```

Recorded result (also executed on CI job **Backend E2E & Load**):

```text
scenario: limited-stock checkout (self-contained)
endpoint: /orders/checkout
requests: 4
concurrency: 4
quantity: 1
initialStock: 2
rps: 75.45
p95LatencyMs: 52.03
successfulCheckouts: 2
expectedStockRejections: 2
errors: 0
```

Successful quantity must never exceed initial stock. Request order does not
matter.

## Observability

Structured logs: HTTP, domain audit (orders, bids, moderation, status), queue
dispatch/process failures, correlation ID from middleware through outbox
payloads into workers.

`GET /metrics` (Prometheus text): HTTP counts/errors/avg duration, orders,
checkouts, bids, refunds, **queue jobs processed/failed and average queue job
duration** (orders, auctions, search, notifications workers).

## Known limits (TZ §8 + honest leftovers)

- Mock payments only; no real payouts.
- UI is functional, not a design system.
- Not 100% test coverage; CI covers lint, unit, critical e2e and one load scenario.
- Modular monolith, not a service mesh / K8s. No Helm chart.
- Similar products = same-category rule, not ML.
- Non-core modules (auth/sellers/reviews/disputes/analytics/logger) still talk
  to Prisma in places; UnitOfWork is complete for orders/cart, bidding, products.
- In-app notifications are API + workers; a richer inbox UI is optional.
- Seller cannot buy/bid by policy (see Roles).

### What we would do differently with more time

- Redis-backed throttler if the API is horizontally scaled.
- Dedicated k6/Artillery auction-bid storm in addition to the checkout race.
- Finish repository migration for remaining modules.
- Richer notification UI.
