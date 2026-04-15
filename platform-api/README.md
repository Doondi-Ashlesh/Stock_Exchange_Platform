# AtlasMarket Platform API

This is a zero-dependency Node backend scaffold for the AtlasMarket client.

## What it provides

- `GET /health`
- `GET /v1/platform/status`
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/logout`
- `GET /v1/auth/me`
- `PATCH /v1/users/me`
- `GET /v1/workspaces/paper`
- `PUT /v1/workspaces/paper`
- `GET /v1/market/feed`
- `GET /v1/market/assets/:symbol`
- `GET /v1/payments/stripe/status`
- `POST /v1/payments/stripe/checkout-session`
- `POST /v1/payments/stripe/customer-portal-session`
- `POST /v1/payments/stripe/funding-session`
- `POST /v1/webhooks/stripe`

## Local setup

1. Copy `platform-api/.env.example` to `platform-api/.env`
2. Set your Finnhub and Stripe values
3. Run `npm run platform:api`

The server listens on `http://localhost:8787` by default.

## Auth model

- Sessions are opaque bearer tokens returned by `register` and `login`
- Send them back as `Authorization: Bearer <token>` or `X-Atlas-Session`
- Users, sessions, workspaces, and audit events are stored in the JSON file pointed to by `ATLASMARKET_DATA_FILE`

This is a scaffold for development and internal testing, not a production-grade identity system.
