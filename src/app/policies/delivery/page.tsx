import { Card } from "@/components/ui/Card";

const sections = [
  {
    title: "Delivery Eligibility",
    body: [
      "Vailsburg Wine & Liquor currently offers local delivery only to eligible addresses within our supported delivery radius.",
      "Delivery eligibility is determined at checkout based on the address provided.",
    ],
  },
  {
    title: "Delivery Requirements",
    body: [
      "For all alcohol deliveries:",
    ],
    list: [
      "the recipient must be 21 years of age or older",
      "a valid government-issued photo ID is required",
      "the order cannot be left unattended",
      "the order cannot be delivered to a visibly intoxicated person",
    ],
  },
  {
    title: "Delivery Timing",
    body: [
      "We aim to fulfill orders as quickly as possible, but delivery times are estimates only and may vary based on order volume, store operations, weather, traffic, or address issues.",
      "We do not guarantee delivery by a specific time unless explicitly stated.",
    ],
  },
  {
    title: "Failed or Refused Delivery",
    body: [
      "If a delivery cannot be completed for any of the following reasons:",
    ],
    list: [
      "no eligible adult is present",
      "valid ID is not provided",
      "the address is incorrect or incomplete",
      "the recipient appears intoxicated",
    ],
    footer: [
      "the order may be canceled or returned, and applicable fees may still apply.",
    ],
  },
  {
    title: "Delivery Limits and Availability",
    body: [
      "Delivery availability may be limited based on service area, store capacity, or operational constraints.",
      "We reserve the right to refuse delivery requests that cannot be fulfilled safely, legally, or accurately.",
    ],
  },
  {
    title: "Contact",
    body: [
      "If there is an issue with your delivery order, please contact the store as soon as possible so we can review and address it.",
    ],
  },
];

export default function DeliveryPolicyPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Policies
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          Delivery Policy
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
          Vailsburg Wine & Liquor offers local delivery only within eligible
          service areas and in accordance with applicable alcohol delivery
          requirements.
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

                {section.footer?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Card>
    </div>
  );
}