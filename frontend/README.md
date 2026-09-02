# Mini Marketplace — Frontend

Frontend частина Mini Marketplace — повноцінного e-commerce застосунку з каталогом товарів, кошиком, оформленням замовлень, особистим кабінетом та адміністративною панеллю.

Застосунок реалізований на **React + TypeScript** та взаємодіє з NestJS backend через REST API і WebSocket.

Frontend включає повний користувацький flow:

```text
Registration / Login
        ↓
Catalog
        ↓
Product Details
        ↓
Add to Cart
        ↓
Cart Management
        ↓
Checkout
        ↓
Order
        ↓
Profile / Order History
```

Для адміністраторів реалізований окремий flow:

```text
Admin Panel
     │
     ├── Dashboard / Analytics
     ├── Products
     ├── Categories
     └── Orders
             ↓
        Change Status
```

---

# Tech Stack

## Core

* React 19
* TypeScript
* Vite
* React Router
* Axios

## UI & Visualization

* Recharts
* Storybook

## Real-time

* Socket.IO Client

## Testing

* Vitest
* React Testing Library
* Testing Library Jest DOM
* Playwright
* MSW
* Vitest Browser

## Code Quality

* ESLint
* TypeScript

---

# Features

## Authentication

Реалізована повна система автентифікації користувачів:

* Registration
* Login
* Logout
* JWT authentication
* Access Token
* Refresh Token flow
* Authentication Provider
* Protected routes
* Role-based route protection
* Customer / Admin access separation
* Обробка помилок авторизації
* Відновлення authentication state

Authentication state централізований через `AuthProvider`, що дозволяє отримувати інформацію про поточного користувача з будь-якої частини застосунку.

---

# Authorization & Route Protection

Frontend розділяє доступ користувачів залежно від ролі.

### Customer

Має доступ до:

* каталогу;
* сторінки товару;
* кошика;
* checkout;
* особистого кабінету;
* історії замовлень.

### Admin

Додатково має доступ до:

* Admin Dashboard;
* аналітики;
* управління товарами;
* управління категоріями;
* управління всіма замовленнями;
* зміни статусів замовлень.

Адміністративні сторінки захищені на frontend рівні.

> Frontend authorization використовується для UX та навігації. Остаточна перевірка прав доступу виконується backend.

---

# Catalog

Реалізована повноцінна сторінка каталогу.

Користувач може:

* переглядати список товарів;
* виконувати пошук;
* фільтрувати товари;
* фільтрувати за категорією;
* фільтрувати за ціною;
* сортувати товари;
* переходити на сторінку конкретного товару;
* додавати товар до кошика.

Каталог працює через REST API backend.

---

# Product Page

Для кожного товару доступна окрема сторінка.

На сторінці відображаються:

* назва;
* опис;
* ціна;
* категорія;
* кількість на складі;
* зображення;
* можливість додавання товару до кошика.

Якщо товар недоступний або закінчився на складі, UI відповідно обробляє цей стан.

---

# Search & Filtering

Каталог підтримує:

* пошук за назвою;
* фільтрацію за категорією;
* фільтрацію за ціновим діапазоном;
* сортування за ціною;
* сортування за новизною.

При зміні параметрів каталогу frontend повторно отримує актуальні дані з API.

---

# Cart

Реалізовано повне керування кошиком.

Користувач може:

* додати товар;
* видалити товар;
* збільшити кількість;
* зменшити кількість;
* переглянути загальну суму;
* перейти до checkout.

## Optimistic UI

Для операцій із кошиком використовується **optimistic UI**.

При зміні кількості або додаванні товару інтерфейс оновлюється одразу, не очікуючи завершення HTTP-запиту.

У випадку помилки API frontend повертає попередній стан та показує відповідне повідомлення користувачу.

Це робить взаємодію з кошиком швидшою та більш responsive.

---

# Checkout

Реалізована сторінка оформлення замовлення.

Основний flow:

```text
Cart
  ↓
Checkout
  ↓
Shipping Address
  ↓
Order Creation
  ↓
Order Confirmation
```

Перед оформленням замовлення frontend перевіряє необхідні дані форми.

Після успішного створення замовлення користувач отримує підтвердження та може перейти до історії замовлень.

Payment flow використовує mock-логіку відповідно до технічного завдання.

---

# Orders

Користувач може переглядати історію власних замовлень.

Для кожного замовлення відображаються:

* номер / ID замовлення;
* товари;
* кількість;
* сума;
* адреса доставки;
* поточний статус;
* дата створення.

Статуси замовлення:

```text
NEW
 ↓
PROCESSING
 ↓
SHIPPED
 ↓
COMPLETED
```

Також замовлення може перейти в:

```text
CANCELLED
```

---

# Real-time Order Updates

Frontend інтегрований із Socket.IO.

WebSocket використовується для отримання real-time оновлень статусу замовлення.

Замість постійного перезавантаження сторінки користувач може отримати зміну статусу автоматично:

```text
NEW
 ↓
PROCESSING
 ↓
SHIPPED
 ↓
COMPLETED
```

Frontend слухає відповідні WebSocket events та оновлює UI без необхідності ручного refresh.

---

# Profile

Реалізований особистий кабінет користувача.

Користувач може:

* переглядати інформацію свого профілю;
* переглядати історію замовлень;
* переглядати статуси замовлень;
* відкривати детальну інформацію про замовлення.

---

# Admin Panel

Для користувачів із роллю `ADMIN` реалізована окрема адміністративна панель.

Основні розділи:

```text
Admin Panel
│
├── Dashboard
├── Products
├── Categories
└── Orders
```

---

# Admin Dashboard

Dashboard містить базову аналітику продажів.

Відображаються:

* загальна виручка;
* кількість замовлень;
* топ-5 товарів за продажами;
* статистика за вибраний період;
* графік продажів.

Для візуалізації даних використовується **Recharts**.

---

# Admin Products

Адміністратор може повністю керувати каталогом товарів.

Реалізовано:

* перегляд товарів;
* додавання товару;
* редагування товару;
* архівування товару;
* відновлення товару з архіву;
* робота із зображенням товару;
* встановлення ціни;
* встановлення stock;
* вибір категорії.

## Архівація товарів

Видалення товару реалізовано через **архівування**, а не через фізичне видалення запису з бази.

Flow:

```text
Active Product
      ↓
    Archive
      ↓
Archived Product
      ↓
   Restore
      ↓
Active Product
```

Це дозволяє зберігати історичні дані та уникати проблем із пов'язаними замовленнями.

---

# Admin Categories

Адміністратор може керувати категоріями товарів.

Реалізовано:

* перегляд категорій;
* створення категорії;
* редагування категорії;
* видалення категорії.

Категорії використовуються також у каталозі для фільтрації товарів.

---

# Admin Orders

Адміністратор має доступ до всіх замовлень системи.

Можливості:

* перегляд усіх замовлень;
* перегляд деталей замовлення;
* перегляд товарів у замовленні;
* перегляд користувача;
* перегляд суми;
* зміна статусу замовлення.

При зміні статусу frontend отримує актуальний стан через API та WebSocket.

---

# CSV Reports

Адміністративна панель підтримує експорт звіту по продажах у CSV.

Це дозволяє адміністратору отримати дані продажів для подальшого аналізу або роботи в Excel / Google Sheets.

---

# Loading / Empty / Error States

Frontend обробляє основні UI states.

### Loading

Відображаються відповідні loading states під час очікування API.

### Empty

Наприклад:

```text
Your cart is empty
```

або:

```text
No products found
```

### Error

У випадку помилки API користувач отримує зрозуміле повідомлення замість зламаного UI.

Також обробляються edge cases:

* товар відсутній;
* товар закінчився;
* порожній кошик;
* неіснуюче замовлення;
* помилка створення замовлення;
* помилка зміни статусу;
* unauthorized request;
* forbidden request.

---

# Form Validation

Форми frontend перевіряють введені користувачем дані перед відправкою на backend.

Validation застосовується до:

* registration;
* login;
* checkout;
* product creation;
* product editing;
* category creation;
* category editing.

Помилки відображаються безпосередньо біля відповідних полів форми.

---

# API Layer

Для HTTP-запитів використовується **Axios**.

API-взаємодія централізована, що дозволяє:

* повторно використовувати API logic;
* централізовано обробляти помилки;
* працювати з authentication tokens;
* оновлювати access token через refresh token;
* не дублювати HTTP-код у компонентах.

Архітектура взаємодії:

```text
React Component
      ↓
API / Service Layer
      ↓
Axios
      ↓
NestJS REST API
```

---

# Authentication Flow

Основний authentication flow:

```text
Login / Register
       ↓
   Access Token
       ↓
Authentication Provider
       ↓
Protected Routes
       ↓
API Requests
```

При необхідності оновлення authentication session:

```text
Access Token Expired
       ↓
Refresh Token
       ↓
New Access Token
       ↓
Retry Request
```

Refresh token використовується backend через HTTP-only cookie.

---

# Storybook

Для розробки та ізольованого тестування UI-компонентів використовується **Storybook**.

Storybook працює окремо від основного React application.

Запуск:

```bash
npm run storybook
```

Після запуску Storybook доступний на:

```text
http://localhost:6006
```

Build production Storybook:

```bash
npm run build-storybook
```

Storybook використовується для ключових UI-компонентів, зокрема:

* Buttons;
* Product Cards;
* Forms;
* UI states;
* reusable components.

Також підключені:

* Storybook Docs;
* Accessibility addon;
* Vitest addon;
* MSW integration.

---

# Testing

Для тестування frontend використовується **Vitest + React Testing Library**.

Також використовуються:

* Vitest;
* React Testing Library;
* Testing Library Jest DOM;
* MSW;
* Playwright;
* Vitest Browser.

Тести покривають ключові UI-компоненти та користувацькі сценарії.

---

# Component Tests

Компонентні тести перевіряють:

* rendering компонентів;
* user interactions;
* form behavior;
* button actions;
* loading states;
* empty states;
* error states;
* conditional rendering;
* основні UI flows.

Запуск:

```bash
npm test
```

---

# API Mocking

Для ізоляції frontend від реального backend під час тестування використовується **MSW (Mock Service Worker)**.

MSW дозволяє перехоплювати API requests та повертати контрольовані responses.

Архітектура:

```text
React Component
      ↓
    Axios
      ↓
     MSW
      ↓
 Mock API Response
```

Це дозволяє тестувати frontend без необхідності запускати весь backend.

---

# Browser Testing

Для browser-based testing використовується **Playwright** та `@vitest/browser-playwright`.

Це дозволяє тестувати компоненти та UI ближче до реального браузерного середовища.

---

# Docker

Frontend може запускатися в development режимі через Docker Compose.

Приклад конфігурації:

```yaml
services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile

    ports:
      - "5173:5173"

    environment:
      - NODE_ENV=development

    volumes:
      - .:/app
      - /app/node_modules

    command: npm run dev
```

### Запуск

У директорії `frontend` достатньо виконати одну команду:

```bash
docker compose up --build
```

Docker автоматично:

1. збере frontend image;
2. встановить dependencies відповідно до Dockerfile;
3. запустить Vite development server;
4. відкриє порт `5173`.

Frontend буде доступний за адресою:

```text
http://localhost:5173
```

Для зупинки контейнера:

```bash
docker compose down
```

Для повторного запуску після зміни Dockerfile або dependencies:

```bash
docker compose up --build
```

Під час development source code монтується у контейнер через volume:

```yaml
volumes:
  - .:/app
  - /app/node_modules
```

Це дозволяє змінювати код локально та використовувати Vite Hot Module Replacement без необхідності вручну перебудовувати image після кожної зміни.

---

# NPM Scripts

Доступні npm scripts:

```bash
# Development server
npm run dev

# Production build
npm run build

# Run ESLint
npm run lint

# Run tests
npm test

# Preview production build
npm run preview

# Start Storybook
npm run storybook

# Build Storybook
npm run build-storybook
```

---

# Local Development

## Requirements

Для локального запуску необхідні:

* Node.js
* npm
* запущений backend API

## Installation

Перейти у frontend:

```bash
cd frontend
```

Встановити dependencies:

```bash
npm install
```

---

# Environment Variables

Створіть `.env` файл на основі `.env.example`.

Наприклад:

```env
VITE_API_URL=http://localhost:3001
```

Frontend використовує environment variables для конфігурації API endpoint.

---

# Development

Запустити development server:

```bash
npm run dev
```

Vite запустить frontend application.

Зазвичай application буде доступний за адресою:

```text
http://localhost:5173
```

---

# Production Build

Для створення production build:

```bash
npm run build
```

Перед build автоматично запускається TypeScript compilation:

```text
TypeScript
    ↓
tsc -b
    ↓
Vite Build
    ↓
dist/
```

Для локального preview:

```bash
npm run preview
```

---

# Code Quality

Для перевірки коду використовується ESLint.

Запуск:

```bash
npm run lint
```

TypeScript використовується для статичної типізації frontend application.

Production build також перевіряє TypeScript:

```bash
npm run build
```

---

# UX Considerations

Frontend орієнтований на зрозумілий користувацький flow.

Основні UX-рішення:

* optimistic UI для cart operations;
* loading states;
* empty states;
* error states;
* protected routes;
* role-based navigation;
* form validation;
* real-time order status updates;
* окремий admin interface;
* confirmation states після створення замовлення.

---

# Full User Flow

Повний customer flow:

```text
┌──────────────┐
│ Registration │
└──────┬───────┘
       ↓
┌──────────────┐
│    Login     │
└──────┬───────┘
       ↓
┌──────────────┐
│   Catalog    │
└──────┬───────┘
       ↓
┌──────────────┐
│ Product Page │
└──────┬───────┘
       ↓
┌──────────────┐
│ Add to Cart  │
└──────┬───────┘
       ↓
┌──────────────┐
│     Cart     │
└──────┬───────┘
       ↓
┌──────────────┐
│   Checkout   │
└──────┬───────┘
       ↓
┌──────────────┐
│    Order     │
└──────┬───────┘
       ↓
┌──────────────┐
│ Order History│
└──────────────┘
```

---

# Admin Flow

```text
┌────────────────┐
│   Admin Login  │
└───────┬────────┘
        ↓
┌────────────────┐
│ Admin Dashboard│
└───────┬────────┘
        │
        ├───────────────┐
        ↓               ↓
┌─────────────┐  ┌──────────────┐
│  Products   │  │  Categories  │
└──────┬──────┘  └──────────────┘
       │
       ├── Create
       ├── Edit
       ├── Archive
       └── Restore

        ↓
┌──────────────┐
│    Orders    │
└──────┬───────┘
       ↓
 Change Status
       ↓
┌──────────────────────────────┐
│ NEW → PROCESSING → SHIPPED  │
│                    ↓         │
│               COMPLETED      │
└──────────────────────────────┘
```

---

# Implemented Requirements

Відповідно до технічного завдання реалізовано:

* React + TypeScript frontend;
* Registration / Login;
* JWT authentication;
* Authentication Provider;
* Access / Refresh Token flow;
* Protected routes;
* Customer / Admin roles;
* Product catalog;
* Product search;
* Category filtering;
* Price filtering;
* Product sorting;
* Product details page;
* Add to cart;
* Cart management;
* Optimistic UI;
* Checkout;
* Order creation;
* Order history;
* User profile;
* Admin panel;
* Admin dashboard;
* Sales analytics;
* Sales chart;
* CSV export;
* Product management;
* Product creation;
* Product editing;
* Product archiving;
* Product restoring;
* Category management;
* Order management;
* Order status management;
* Socket.IO real-time updates;
* Loading states;
* Empty states;
* Error states;
* Form validation;
* Component tests;
* Storybook;
* MSW API mocking;
* Playwright browser testing;
* ESLint;
* TypeScript;
* Docker development environment.

---

# Future Improvements

Можливі подальші покращення frontend:

* додати більш складну систему UI notifications / toast;
* додати drag & drop для зображень товарів;
* розширити component test coverage;
* додати повноцінні E2E тести основних user flows;
* додати accessibility testing для всіх сторінок;
* додати dark mode;
* додати PWA support;
* оптимізувати bundle splitting та lazy loading для admin routes.

---

# Project Goal

Frontend реалізує повноцінний e-commerce user experience поверх NestJS API.

Основна мета проєкту — продемонструвати:

* компонентну архітектуру React;
* TypeScript;
* routing;
* authentication;
* authorization;
* API integration;
* optimistic UI;
* WebSocket integration;
* form validation;
* reusable UI components;
* Storybook;
* component testing;
* error handling;
* admin interfaces;
* data visualization.

Frontend є повноцінною клієнтською частиною Mini Marketplace та інтегрується з backend через REST API і WebSocket.
