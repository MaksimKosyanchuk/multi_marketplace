# Multi-Vendor Marketplace

Pet project: multi-vendor marketplace with fixed-price products, timed auctions,
real-time inventory, platform commission and reliable async event delivery.

One customer checkout can span several sellers. The platform creates one parent
`Order` and one `SellerOrder` per seller, keeps immutable item snapshots and
records a 10% commission. Auction lots use optimistic concurrency for bids and
a limited winner checkout window.

## Roles

- **Customer** — browse, cart, checkout, bids, reviews of completed purchases,
  disputes.
- **Seller** — manages own products, auctions and seller sub-orders.
  Sellers **cannot buy products or place bids**. This is a deliberate compromise
  to reduce self-rating abuse and sellers outbidding themselves on their own
  lots; a finer policy can be designed later. After a customer becomes a seller,
  the **purchase history tab remains available** for past orders as a former buyer.
- **Admin** — seller/product moderation, disputes, analytics.

## Technology stack and why

| Layer | Choice | Why |
| --- | --- | --- |
| Backend | NestJS + TypeScript | Modular monolith with clear module boundaries |
| Frontend | React + TypeScript + Vite | Typed SPA for catalog, cart, auctions, cabinets |
| Database | PostgreSQL + Prisma | Strong consistency for checkout, stock and money |
| Search | Meilisearch | Faceted catalog search; PostgreSQL fallback if search is down |
| Cache / queues | Redis + BullMQ | Cache, refresh tokens, retries and durable workers |
| Real-time | Socket.IO | Live stock, bids and order status with REST resync |
| Auth | JWT access/refresh + Google OAuth | Cookie refresh + verified-email Google login |
| Observability | Structured logs + `/metrics` | Correlation IDs across HTTP and async stages |

Swagger: `http://localhost:3001/api/docs`

## How the system works

The backend is a NestJS modular monolith (`auth`, `products`, `cart`, `orders`,
`bidding`, `search`, `notifications`, …). Controllers accept DTOs, services own
business rules, and the core marketplace flows go through a shared database
layer (`UnitOfWork` + repositories).

### Authentication

Registration:

- **Email path** — email + nickname + password.
- **Google path** — “Continue with Google”. If the Google email is new, the app
  finishes registration (nickname + password) and creates the account.

Login:

- **Email + password**, or
- **Continue with Google**.

Both paths resolve to **one account keyed by email**. If you registered with
email/password and later use Google with the same verified email (or the other
way around), you land on the same user. Identity merge is validated by email,
not by a separate Google identity store.

### Strong vs eventual consistency

**Strong consistency (one DB transaction):**

- multi-vendor checkout and stock decrement
- commission / ledger writes
- bid acceptance with version check
- cancellation and partial refunds
- transactional outbox rows written with the domain change

**Eventual consistency (outbox → BullMQ → workers):**

- Meilisearch indexing
- Socket.IO fan-out
- notification pipeline and other side effects

Consumers are at-least-once and deduplicate by event ID / idempotency key.
After a socket reconnect the client uses REST as the source of truth.

### Hard parts worth calling out

- **Transactional DB layer** — `UnitOfWork` wraps Prisma `$transaction` so
  checkout, bidding and refunds share one transaction-scoped repository set.
- **Transactional Outbox** — domain write and outbox event land in the same
  commit; BullMQ workers deliver later with retries and backoff.
- **Redis + BullMQ** — queues for orders, auctions, search sync and
  notifications; Redis also backs cache and auth refresh state.
- **Optimistic concurrency** — auction bids and stock updates use version /
  conditional updates so lost updates are rejected, not silently overwritten.

### Structured logging

Structured logging is fully implemented: request logs, domain audit events and
async worker logs go through a shared logger with level, context, message,
correlation ID, JSON metadata and timestamps. Correlation IDs are created at
the HTTP boundary, returned in response headers and propagated through outbox
payloads and BullMQ jobs.

### In-app notifications

The backend foundation for in-app notifications is complete (persistence,
queue workers, API to list / mark read, realtime emit hooks). Wiring a full
client UI on top of that base is left for extra time.

Payments use a mock provider (real PSP is out of scope).

## Running

### Docker Compose (recommended)

From the repository root:

```bash
docker compose up --build
```

| Service | URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| Backend API / Swagger | http://localhost:3001 / `/api/docs` |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |
| Meilisearch | http://localhost:7700 |

Backend runs Prisma migrations on startup. Stop with `docker compose down`.

### Local (without full Compose)

1. Start PostgreSQL, Redis and Meilisearch (or only infra via Compose).
2. Copy `backend/.env.example` → `backend/.env` and `frontend/.env.example` → `frontend/.env`.
3. Install and run:

```bash
cd backend && npm install && npx prisma migrate deploy && npm run start:dev
cd frontend && npm install && npm run dev
```

### Google “Continue with Google” (frontend)

The Google button needs an OAuth 2.0 Web client from Google Cloud Console:

1. Create a project (or pick an existing one) in
   [Google Cloud Console](https://console.cloud.google.com/).
2. Configure the OAuth consent screen.
3. Create credentials → **OAuth client ID** → application type **Web application**.
4. Under **Authorized JavaScript origins** / redirect URIs add local frontend
   origins, for example:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
5. Copy the **Client ID** into `frontend/.env` as `VITE_GOOGLE_CLIENT_ID`.

Example (`frontend/.env.example`):

```env
VITE_API_URL=http://localhost:3001
VITE_GOOGLE_CLIENT_ID="248499709023-b65pgr61d9l8ist1jl.apps.googleusercontent.com"
```

Without a valid client ID the rest of the app still runs; only the Google
continue flow will fail.

## Testing

### Commands

```bash
# Backend unit tests
cd backend && npm test

# Backend critical integration / e2e flows (needs running Postgres + app deps)
cd backend && npm run test:e2e

# Limited-stock checkout load test (self-contained; needs API + DB)
cd backend && npm run test:load

# Frontend unit tests
cd frontend && npm test
```

Optional:

```bash
cd backend && npm run test:cov
cd frontend && npm test -- --run
```

### What the tests cover

**Backend unit (`npm test`)**

- multi-vendor checkout: seller sub-orders, immutable snapshots, 10% commission, outbox
- stock / availability checks and empty-cart rejection
- parent order status aggregation from seller sub-orders
- bid accept / reject (deadline, minimum increment, optimistic version)
- last-second bid vs `endAuction` claim
- winner checkout window expire / claim races
- concurrent partial refund quantity guard and idempotent refund keys
- isolated seller-order cancellation (siblings stay active)
- product archive clears cart items
- outbox processor idempotency (no duplicate emit when already claimed / receipt exists)
- auth, cart, products, categories, analytics service/controller suites

**Backend integration (`npm run test:e2e`, `test/order-flow-e2e-spec.ts`)**

- multi-seller cart → checkout with one `SellerOrder` per seller and atomic stock decrements
- concurrent bids: exactly one version wins, no lost update
- last-second bid accepted; late bid rejected after auction end claim
- concurrent winner checkout: only one order; expiry cannot undo a claimed checkout
- expired winner window rejects checkout
- concurrent partial refunds never exceed purchased quantity
- cancelling one seller order does not cancel sibling seller orders
- archiving a product removes it from another customer’s cart
- repeated outbox delivery creates one consumer receipt

**Frontend (`npm test`)**

- ProductCard / OrderItem rendering and key actions
- Socket.IO reconnect: auction room resubscribe + REST resync callback

**Load (`npm run test:load`)**

Self-contained limited-stock checkout race: creates users/product, prepares
four carts, fires four concurrent checkouts against stock `2`, then cleans up.

Invariant: **2 successful checkouts, 2 insufficient-stock rejections, 0 unexpected errors**.

## Load test report

Command:

```bash
cd backend && npm run test:load
```

Recorded result:

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

Successful request order does not matter. Successful quantity must never exceed
initial stock.

## Known limits

- Payment provider is mocked; no real payouts.
- Metrics endpoint exposes basic Prometheus counters, not a full SRE dashboard.
- Non-core modules still use Prisma directly in places; repository/`UnitOfWork`
  migration is complete for orders/cart, bidding and products.
- In-app notifications are backend-ready; full frontend presentation is optional follow-up.
- Seller cannot buy/bid by policy (see Roles); purchase history for former customers is kept.
- UI is functional, not a polished design system.
- 100% coverage is intentionally out of scope.
