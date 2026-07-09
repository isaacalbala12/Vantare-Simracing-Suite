# billing-webhook (Fase 2 — Polar)

Endpoints planeados:
- POST /billing-checkout — crear sesión checkout (JWT requerido)
- POST /billing-portal — portal cliente (JWT requerido)
- POST / — webhook Polar (firma + idempotencia en license_events)

Tablas: billing_customers, billing_subscriptions, user_entitlements.