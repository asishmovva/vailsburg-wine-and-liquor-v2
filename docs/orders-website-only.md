# Website-only order intake (planned)

Orders are handled entirely by the website. There is no POS push or sync.

## Source of truth

Stripe webhooks are the source of truth for payment confirmation and order status.

## Statuses

- `PENDING_PAYMENT` — payment intent created, awaiting Stripe confirmation.
- `NEW` — paid order, ready for staff review.
- `ACCEPTED` — staff acknowledged the order.
- `READY` — order is ready for pickup/delivery handoff.
- `COMPLETED` — order fulfilled.
- `CANCELLED` — cancelled by staff.
- `FAILED` — payment failed.

Allowed transitions:

`PENDING_PAYMENT` ? `NEW` (Stripe webhook)

`NEW` ? `ACCEPTED` ? `READY` ? `COMPLETED`

`NEW` ? `CANCELLED`

`FAILED` and `CANCELLED` are terminal.

## Next steps (Phase 12+)

- Stripe webhook creates/transitions orders to NEW on payment success.
- Staff queue lives in `/admin/orders` and operates on website-only orders.
- Customer tracking pages reflect staff status updates.
