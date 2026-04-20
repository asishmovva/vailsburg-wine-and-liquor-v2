import { Card } from "@/components/ui/Card";

const sections = [
  {
    title: "Website Use",
    body: [
      "By using this website and placing an order, you confirm that you are at least 21 years old and legally permitted to purchase alcohol.",
    ],
  },
  {
    title: "Verification at Delivery or Pickup",
    body: [
      "All alcohol orders require age verification through a valid government-issued photo ID at the time of delivery or pickup.",
      "The name on the order may be checked against the presented ID where necessary.",
    ],
  },
  {
    title: "Refusal of Service",
    body: [
      "We reserve the right to refuse or cancel any order if:",
    ],
    list: [
      "valid ID is not provided",
      "the customer or recipient is under 21",
      "the recipient appears intoxicated",
      "the order appears fraudulent or unlawful",
    ],
  },
  {
    title: "No Unattended Alcohol Delivery",
    body: [
      "Alcohol orders will not be left unattended, left at the door, or released without age verification.",
    ],
  },
  {
    title: "Compliance",
    body: [
      "These rules exist to comply with applicable alcohol sale and delivery requirements and to protect both the customer and the business.",
    ],
  },
];

export default function AgeVerificationPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Policies
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          Age Verification Policy
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
          Vailsburg Wine & Liquor sells alcohol only to individuals who are 21
          years of age or older.
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