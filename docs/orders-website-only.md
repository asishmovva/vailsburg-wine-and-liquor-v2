# Website-only order intake (planned)

Orders are handled entirely by the website. There is no POS push or sync.

## Source of truth

Stripe webhooks are the source of truth for payment confirmation and order status.

## Next steps (Phase 12+)

- Stripe webhook creates/transitions orders to NEW on payment success.
- Staff queue lives in `/admin/orders` and operates on website-only orders.
- Customer tracking pages reflect staff status updates.
