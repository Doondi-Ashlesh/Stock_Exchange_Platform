# AtlasMarket Production Readiness

This repo is still primarily an Expo client with a local-first paper trading engine. The recent integration changes make it safer to connect live services, but a real-money platform still needs a server, regulated partners, and operational controls around this client.

## What is now wired into the app

- Market data can run in `proxy` mode through `ATLASMARKET_API_BASE` instead of exposing provider credentials in the client bundle.
- The account center can launch hosted Stripe flows through backend endpoints for:
  - checkout sessions
  - customer portal sessions
  - funding sessions
- This repo now includes a runnable `platform-api/server.js` scaffold for those routes, using Node's built-in HTTP, fetch, and crypto APIs.
- The platform scaffold now includes file-backed users, opaque bearer sessions, persisted paper workspaces, and Stripe-customer linking via webhook events.
- The UI now surfaces the active market-data path and Stripe readiness so product and engineering can see whether the app is in demo mode, direct-provider mode, or platform-backed mode.

## Backend services this app now expects

Recommended AtlasMarket platform routes:

- `GET /v1/market/feed`
  - Accept query params for tracked symbols, selected symbol, benchmark mappings, snapshot date, and mode.
  - Return an `AtlasLiveFeedState`-shaped payload.
- `GET /v1/market/assets/:symbol`
  - Return an `AtlasLiveAssetDetail`-shaped payload.
- `GET /v1/payments/stripe/status`
  - Return Stripe capability flags for checkout, portal, and funding.
- `POST /v1/payments/stripe/checkout-session`
  - Create a hosted Stripe Checkout Session on the server.
- `POST /v1/payments/stripe/customer-portal-session`
  - Create a hosted Stripe Customer Portal session on the server.
- `POST /v1/payments/stripe/funding-session`
  - Create the hosted Stripe funding or payment-method collection flow your platform uses.
- `POST /v1/webhooks/stripe`
  - Verify Stripe webhook signatures and update entitlements, payment state, and ledger events.

## Gaps to close before this becomes a real product

1. Platform API and database
   The client still persists critical state to local storage. Real accounts, entitlements, orders, ledger entries, and market-data audit trails need a server database with durable IDs, migrations, reconciliation jobs, and backups.

2. Identity, authentication, and authorization
   There is no production auth layer, no role model, and no server-issued session/token flow in the active AtlasMarket experience. Add account creation, MFA, session rotation, device management, and server-side authorization checks.

3. Brokerage, custody, and order routing
   The current order system is a simulation. For live trading you need a broker or custodian partner, real order lifecycle management, exchange/broker acknowledgements, fills, cancels, rejects, buying-power controls, and post-trade reconciliation.

4. Cash movement and money handling
   Stripe can help with billing and hosted payment collection, but it does not replace brokerage cash ledgers, settlement workflows, or custody responsibilities. Real deposits and withdrawals need a regulated money movement design tied to the broker or banking partner.

5. Compliance and legal readiness
   Before handling real customer funds or orders, align the product with legal counsel and regulated partners on licensing, disclosures, KYC, AML, sanctions screening, recordkeeping, surveillance, and regional restrictions.

6. Market-data licensing and entitlements
   Client-side keys are not sufficient for a live product. The backend should own provider credentials, entitlements, usage limits, cache rules, and audit logs for the market-data plan you purchase.

7. Security
   Move all secrets server-side. Add secret management, rate limiting, API auth, request signing, audit logs, least-privilege service access, dependency review, and webhook signature verification.

8. Observability and operations
   Add structured logging, tracing, alerts, SLOs, incident runbooks, background job visibility, and dashboards for orders, payments, quote freshness, and user-facing errors.

9. CI/CD and environment management
   This repo has local tests but no active CI workflow. Add branch protection, automated test runs, preview deployments, environment promotion, and rollback procedures.

10. User support and admin tooling
   A working platform needs internal tools for account review, payment review, entitlement repair, order investigation, trade corrections, and customer support workflows.

## Suggested rollout order

1. Build the AtlasMarket platform API and move market-data access behind it.
2. Add production auth, user accounts, and a server database.
3. Turn Stripe into a hosted billing and payment-method layer with webhooks.
4. Integrate a regulated broker or custody partner for live accounts and order routing.
5. Add operations, compliance controls, and CI/CD before inviting real users.
