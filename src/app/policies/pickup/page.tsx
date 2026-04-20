import { Card } from "@/components/ui/Card";

const sections = [
  {
    title: "Pickup Eligibility",
    body: [
      "Pickup orders may be placed through the website for eligible products and are subject to store review and availability.",
      "Submitting an order does not guarantee final acceptance or immediate readiness for pickup.",
    ],
  },
  {
    title: "Pickup Requirements",
    body: [
      "To collect an order, the customer must present a valid government-issued photo ID at the time of pickup.",
      "For alcohol purchases, the customer must be 21 years of age or older.",
    ],
  },
  {
    title: "Order Release",
    body: [
      "Orders will only be released after store confirmation and identity verification where required.",
      "We reserve the right to refuse release of any order if identification cannot be verified, if the order details do not match, or if release would violate applicable law or store policy.",
    ],
  },
  {
    title: "Pickup Timing",
    body: [
      "Estimated pickup times are provided for convenience only and may vary based on store volume, product availability, or operational conditions.",
      "Customers should wait for order confirmation or readiness communication before arriving when applicable.",
    ],
  },
  {
    title: "Unclaimed Orders",
    body: [
      "If an order is not picked up within a reasonable time, we may contact the customer using the information provided on the order.",
      "We reserve the right to cancel unclaimed orders or restock items when necessary.",
    ],
  },
  {
    title: "Refusal of Service",
    body: [
      "We may refuse pickup or cancel an order if:",
    ],
    list: [
      "valid identification is not provided",
      "the customer is under 21 for alcohol purchases",
      "the customer appears intoxicated",
      "the order appears fraudulent, unlawful, or unsafe to release",
    ],
  },
  {
    title: "Contact",
    body: [
      "If you have questions about a pickup order, please contact the store directly using the contact information provided on the website.",
    ],
  },
];

export default function PickupPolicyPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Policies
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          Pickup Policy
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
          Pickup orders are subject to product availability, store review, and
          age verification requirements where applicable.
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