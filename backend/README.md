# Mini Marketplace API

Backend частина Mini Marketplace — e-commerce застосунку з каталогом товарів, кошиком, замовленнями та адміністративною панеллю.

Застосунок реалізований на **NestJS + TypeScript**, використовує **PostgreSQL + Prisma** для роботи з даними, **Redis + BullMQ** для кешування та асинхронної обробки замовлень і **Socket.IO** для real-time оновлень.

---

# Tech Stack

* NestJS
* TypeScript
* PostgreSQL
* Prisma ORM
* Redis
* BullMQ
* Socket.IO
* JWT (Access + Refresh Tokens)
* bcrypt
* class-validator / class-transformer
* @nestjs/throttler
* Helmet
* Jest
* Docker / Docker Compose
* GitHub Actions

---

# Architecture

Застосунок побудований за модульною клієнт-серверною архітектурою:

```text
React Frontend
      │
      │ REST API / WebSocket
      ▼
NestJS Backend
      │
      ├── BullMQ → Redis
      │
      ▼
   Prisma ORM
      │
      ▼
 PostgreSQL
```

Основні модулі backend:

* Authentication & Users
* Products
* Categories
* Cart
* Orders
* Analytics
* Queue
* WebSocket Gateway

---

# Authentication & RBAC

Реалізована JWT-аутентифікація з двома типами токенів:

* Access Token — передається через `Authorization: Bearer <token>`
* Refresh Token — зберігається в `HTTP-only` cookie та підтримує rotation

Доступ до функціоналу розділений за ролями:

### CUSTOMER

* перегляд каталогу;
* робота з кошиком;
* створення замовлень;
* перегляд власної історії замовлень.

### ADMIN

* управління товарами;
* управління категоріями;
* перегляд усіх замовлень;
* зміна статусів;
* аналітика;
* експорт звітів.

Для захисту authentication endpoints від brute-force атак використовується `@nestjs/throttler`.

---

# Products & Categories

Реалізовано:

* CRUD товарів;
* пагінацію;
* пошук;
* фільтрацію;
* сортування;
* категоризацію;
* керування stock;
* CRUD категорій;
* Redis caching для каталогу.

Кеш каталогу автоматично інвалідується після адміністративних змін товарів.

---

# Cart & Orders

Авторизований користувач може:

* додавати товари до кошика;
* змінювати кількість;
* видаляти товари;
* оформлювати замовлення;
* переглядати історію замовлень.

Під час checkout:

1. перевіряється кошик;
2. перевіряється актуальний stock;
3. створюється замовлення та `order items`;
4. stock атомарно списується;
5. після успішної транзакції створюється BullMQ job.

---

# Transactions & Race Conditions

Ключова частина системи — захист stock від конкурентних запитів.

Операції створення замовлення та списання товарів виконуються всередині транзакції Prisma.

Це дозволяє коректно обробляти ситуації, коли декілька користувачів одночасно намагаються придбати останні одиниці товару.

Система не дозволяє створити замовлення, якщо актуального stock недостатньо.

---

# Edge Cases

Backend містить обробку основних edge cases та некоректних сценаріїв:

* товар не існує;
* категорія не існує;
* товар закінчився на складі;
* недостатня кількість товару;
* порожній кошик;
* неіснуюче замовлення;
* спроба отримати чуже замовлення;
* спроба змінити чуже замовлення;
* доступ до admin endpoints без необхідної ролі;
* повторні або некоректні операції з кошиком;
* невалідні DTO та параметри запитів;
* некоректні значення кількості або ціни;
* помилки authentication / authorization;
* конфлікти при одночасному оформленні замовлень.

Помилки централізовано обробляються та повертаються клієнту у відповідному HTTP-форматі.

---

# Redis & BullMQ

Redis використовується для:

* кешування каталогу;
* роботи BullMQ.

Після успішного створення замовлення воно передається в BullMQ для асинхронної обробки.

Queue використовується для операцій, які не повинні блокувати основний HTTP request, зокрема подальшої обробки замовлення та генерації нотифікацій.

---

# Real-time Updates

Для real-time оновлень використовується Socket.IO.

Клієнти отримують зміни статусу замовлення без необхідності перезавантажувати сторінку.

Основний lifecycle:

```text
NEW
 ↓
PROCESSING
 ↓
SHIPPED
 ↓
COMPLETED
```

Також замовлення може перейти в `CANCELLED`.

---

# Analytics

Для адміністратора реалізована базова аналітика:

* загальна виручка;
* кількість замовлень;
* кількість проданих товарів;
* популярні товари;
* статистика за вибраний період.

Також реалізовано експорт звітів у CSV.

---

# Database

Основна база даних — PostgreSQL.

Для роботи з БД використовується Prisma ORM.

Додані індекси для основних полів пошуку та фільтрації:

* `name`;
* `categoryId`;
* `price`;
* `createdAt`.

Міграції управляються через Prisma Migrate.

Корисні команди:

```bash
npx prisma migrate dev
npx prisma generate
npx prisma studio
```

---

# Logging

У backend реалізовано логування ключових подій та операцій системи.

Логуються, зокрема:

* authentication events;
* створення замовлень;
* зміна статусів;
* операції з товарами;
* помилки та exceptions;
* критичні помилки бізнес-логіки.

Це спрощує debugging та моніторинг роботи застосунку.

---

# Security

Реалізовані основні механізми захисту:

* JWT authentication;
* Access + Refresh Tokens;
* HTTP-only cookies;
* Refresh Token Rotation;
* bcrypt password hashing;
* RBAC;
* DTO validation;
* `class-validator`;
* rate limiting;
* Helmet;
* перевірка authorization на захищених endpoints;
* централізована обробка помилок.

---

# Environment Variables

Створіть `.env` на основі `.env.example`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/marketplace?schema=public"

REDIS_PORT=6379

JWT_ACCESS_SECRET="access_secret_key"
JWT_REFRESH_SECRET="refresh_secret_key"

PORT=3001
```

---

# Docker

Backend, PostgreSQL та Redis запускаються через Docker Compose.

У директорії `backend`:

```bash
docker compose up --build
```

Після запуску:

```text
Backend API: http://localhost:3001
Swagger:     http://localhost:3001/api
PostgreSQL:  localhost:5432
Redis:       localhost:6379
```

Зупинка:

```bash
docker compose down
```

Повне очищення разом із database volume:

```bash
docker compose down -v
```

---

# Local Development

Для запуску без Docker необхідні Node.js, PostgreSQL та Redis.

```bash
npm install

cp .env.example .env

npx prisma migrate dev

npm run start:dev
```

---

# API Documentation

Для документації API використовується Swagger.

Після запуску backend:

```text
http://localhost:3001/api
```

Swagger дозволяє переглядати та тестувати API endpoints, DTO та параметри запитів.

---

# Testing

Реалізовані unit та E2E тести.

Unit-тести покривають критичну бізнес-логіку, зокрема:

* authentication;
* products;
* cart;
* orders;
* authorization;
* transaction logic;
* stock management.

E2E тест перевіряє основний користувацький flow:

```text
Registration
     ↓
Add product to cart
     ↓
Create order
     ↓
Check stock
```

Запуск тестів:

```bash
npm test
```

```bash
npm run test:e2e
```

---

# CI

У репозиторії налаштований GitHub Actions workflow.

На `push` та `pull request` автоматично виконуються:

```text
Install dependencies
        ↓
npm ci
        ↓
Lint
        ↓
Tests
```

---

# Future Improvements

Можливі подальші покращення:

* реальна інтеграція Stripe / LiqPay;
* Redis adapter для Socket.IO при горизонтальному масштабуванні;
* Система повідомлень користувачів

---

# Getting Started

Швидкий запуск:

```bash
git clone <repository-url>

cd backend

cp .env.example .env

docker compose up --build
```

Після запуску backend буде доступний за:

```text
http://localhost:3001
```

Swagger:

```text
http://localhost:3001/api
```

---

# Summary

Mini Marketplace API — backend для e-commerce marketplace, який демонструє роботу з:

* NestJS та TypeScript;
* PostgreSQL та Prisma;
* JWT authentication та RBAC;
* Redis та BullMQ;
* транзакціями та race condition protection;
* кешуванням;
* WebSockets;
* аналітикою та CSV export;
* validation та security;
* edge case handling;
* logging;
* unit та E2E testing;
* Docker;
* GitHub Actions CI.
# Load testing

Run the reproducible limited-stock checkout scenario against a running backend.
Create four CUSTOMER account/cart tokens and use an ACTIVE FIXED_PRICE product
with exactly two units in stock:

```bash
LOAD_TOKENS=<customer-jwt-1>,<customer-jwt-2>,<customer-jwt-3>,<customer-jwt-4> \
LOAD_PRODUCT_ID=<active-product-id> \
LOAD_INITIAL_STOCK=2 \
LOAD_QUANTITY=1 \
LOAD_CONCURRENCY=4 \
npm run test:load
```

The harness first adds one unit to every user's cart outside the measured
interval, then sends four checkouts concurrently. It asserts exactly two
successful checkouts, two stock rejections, and no unexpected errors. It also
reports RPS and p95 latency:

```text
Scenario: limited-stock checkout
Requests: 4
Concurrency: 4
Initial stock: 2
Quantity per checkout: 1
Successful checkouts: <measured value>
Expected stock rejections: <measured value>
RPS: <measured value>
p95 latency: <measured value> ms
Errors: <unexpected error count>
```

Results depend on the machine and running infrastructure, so they must be
captured in the target environment rather than treated as portable constants.
