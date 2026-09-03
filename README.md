# Multi-Vendor Marketplace

Multi-vendor marketplace with real-time inventory, fixed-price products,
time-limited auctions, seller sub-orders, platform commission and reliable
asynchronous event delivery.

## Requirements coverage

### Implemented

- Customer, Seller and Admin roles with JWT access/refresh authentication,
  Google OAuth flow and seller application moderation.
- Seller-owned product CRUD, product moderation, categories, reviews and
  ownership/role checks.
- Catalog search with filters, facets, pagination and sorting.
- Fixed-price checkout with atomic stock decrement, one parent `Order`, one
  `SellerOrder` per seller, immutable item snapshots and 10% commission
  records.
- Seller order lifecycle, parent status aggregation, isolated cancellation and
  partial item refunds.
- Auction listing, deadline validation, minimum bid increment, optimistic
  concurrency control, winner selection and winner checkout window.
- Transactional Outbox for domain changes and asynchronous synchronization.
- Redis cache and temporary state; BullMQ queues and workers with retries,
  backoff, bounded attempts and idempotent event processing.
- Meilisearch product indexing with PostgreSQL fallback.
- Socket.IO updates for stock, auctions and order status, with reconnect and
  REST resynchronization.
- Admin moderation, analytics, seller dashboard, CSV/JSON exports, disputes
  and notifications.
- DTO/class-validator input validation, centralized HTTP errors, throttling,
  correlation IDs, structured logs, audit events and Prometheus-compatible
  `/metrics`.
- Swagger API documentation at `/api/docs`.

### Open requirements

- Storybook coverage for all required key components is not complete.
- Docker Compose configuration for the full required stack is not complete.
- Frontend component test coverage is incomplete.
- Full E2E coverage, deployment verification and complete benchmark history
  remain open.

## Technology stack

- **Backend:** NestJS, TypeScript, Prisma
- **Frontend:** React, TypeScript, Vite
- **Database:** PostgreSQL
- **Search:** Meilisearch
- **Queues/events:** Redis and BullMQ
- **Real-time:** Socket.IO/WebSocket
- **Authentication:** JWT access/refresh and Google OAuth
- **Observability:** structured PostgreSQL logs, audit trail and `/metrics`

The checkout stock mutation and multi-vendor order creation use one database
transaction. Search indexing, notifications and real-time delivery use
eventual consistency through the transactional outbox and BullMQ workers.

## Running

Install dependencies in `backend/` and `frontend/`, configure environment
variables from the project configuration, then start the backend and frontend
development servers.

Backend API: `http://localhost:3001`  
Swagger: `http://localhost:3001/api/docs`

## Limited-stock load test

The reproducible scenario uses four distinct CUSTOMER JWTs and one
`ACTIVE`/`FIXED_PRICE` product with exactly two units in stock. The script:

1. checks the product preconditions;
2. clears each customer's cart and adds one unit before measurement;
3. sends four checkout requests concurrently with unique idempotency keys;
4. reports RPS, p95 latency, successful checkouts, expected stock rejections
   and unexpected errors;
5. fails if the invariant is not met: two successes, two stock rejections and
   zero unexpected errors.

Run from `backend/`:

```bash
LOAD_BASE_URL=http://localhost:3001 \
LOAD_TOKENS=<customer-jwt-1>,<customer-jwt-2>,<customer-jwt-3>,<customer-jwt-4> \
LOAD_PRODUCT_ID=<active-fixed-price-product-id> \
LOAD_INITIAL_STOCK=2 \
LOAD_QUANTITY=1 \
LOAD_CONCURRENCY=4 \
npm run test:load
```

Measured result recorded in the repository:

```text
scenario: limited-stock checkout
requests: 4
concurrency: 4
quantity: 1
initialStock: 2
rps: 121.54
p95LatencyMs: 32.19
successfulCheckouts: 2
expectedStockRejections: 2
errors: 0
```

The exact order of successful requests is not significant. The required
invariant is that successful quantity never exceeds the initial stock.

## Testing

Available commands include:

```bash
cd backend && npm test
cd backend && npm run test:e2e
cd backend && npm run test:load
cd frontend && npm test
```

The critical integration suite in `backend/test/order-flow-e2e-spec.ts` covers:

- multi-seller cart checkout with one `SellerOrder` per seller and stock
  decrements for every product;
- concurrent bids with optimistic version protection and one accepted bid;
- repeated outbox delivery with one consumer receipt and no duplicate effect.

The load result above is the currently recorded runtime verification. Full
test completion and the remaining delivery requirements are listed as open
items above.
