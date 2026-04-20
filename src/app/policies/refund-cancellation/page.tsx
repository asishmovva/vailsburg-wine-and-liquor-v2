import { Card } from "@/components/ui/Card";

const sections = [
  {
    title: "All Sales Policy",
    body: [
      "Due to the nature of alcoholic beverages and applicable regulations, all sales are generally final.",
      "We do not accept returns or exchanges for change of mind, ordering the wrong item, taste preference, or products opened after delivery or pickup.",
    ],
  },
  {
    title: "Damaged or Incorrect Orders",
    body: [
      "If you receive a damaged item or the wrong product, please contact us as soon as possible after receiving the order.",
      "To help us review the issue, please provide your order number, a description of the problem, and photos of the damaged or incorrect item when applicable.",
    ],
  },
  {
    title: "Refunds and Resolutions",
    body: [
      "If we confirm that an item was damaged or incorrect at the time of fulfillment, we may offer one of the following remedies at our discretion:",
    ],
    list: [
      "replacement",
      "store credit",
      "partial refund",
      "full refund",
    ],
  },
  {
    title: "Canceled or Refused Orders",
    body: [
      "If an order is canceled or refused because valid age verification cannot be completed, valid identification is not provided, no eligible adult is present, the address is incorrect, or the order cannot legally be completed, the order may not qualify for a refund of delivery-related or service-related charges.",
    ],
  },
  {
    title: "Review and Approval",
    body: [
      "Refunds, credits, replacements, or other resolutions are reviewed case by case and issued only after store review and approval.",
      "We reserve the right to deny a refund request that does not meet the conditions outlined in this policy.",
    ],
  },
  {
    title: "Contact",
    body: [
      "If you have an issue with an order, please contact the store promptly so we can review the matter and determine the appropriate resolution.",
    ],
  },
];

export default function RefundCancellationPolicyPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Policies
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          Refund & Cancellation Policy
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
          Because alcoholic beverage sales are regulated and time-sensitive,
          refunds, cancellations, and returns are limited and subject to store
          review.
        </p>
      </div>

      <Card className="rounded-2xl border border-zinc-200 p-5 shadow-sm sm:p-6">
        <div className="space-y-6">
          {sections.map((section) => (
            <section
              key={section.title}
              className="space-y-3 border-b border-zinc-200 pb-6 last:border-b-0 last:pb-0"
            >
              <h2 className="text-base font-semibold text-zinc-900 sm:text-lg">
                {section.title}
              </h2>

              <div className="space-y-3 text-sm leading-6 text-zinc-600 sm:text-[15px]">
                {section.body?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}

                {section.list ? (
                  <ul className="list-disc space-y-2 pl-5 marker:text-zinc-500">
                    {section.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </Card>
    </div>
  );
}