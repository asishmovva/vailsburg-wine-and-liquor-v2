import { Card } from "@/components/ui/Card";

const sections = [
  {
    title: "Acceptance of Terms",
    body: [
      "By accessing or using the Vailsburg Wine & Liquor website, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree, please do not use this website.",
    ],
  },
  {
    title: "Eligibility",
    body: [
      "This website is intended only for individuals who are at least 21 years old and legally permitted to purchase alcohol in their jurisdiction.",
      "By using this website or placing an order, you represent that you meet these requirements.",
    ],
  },
  {
    title: "Product Information, Pricing, and Availability",
    body: [
      "We make reasonable efforts to keep product descriptions, images, pricing, and availability accurate. However, errors, delays, or omissions may occur.",
      "We reserve the right to update, correct, limit, discontinue, or remove products, prices, promotions, or availability at any time without prior notice.",
      "An order confirmation does not guarantee final acceptance or fulfillment of an order.",
    ],
  },
  {
    title: "Orders and Order Acceptance",
    body: [
      "All orders placed through the website are subject to review, verification, and acceptance by the store.",
      "We reserve the right to refuse, cancel, limit, or hold any order at our discretion, including where an order appears inaccurate, fraudulent, unlawful, unavailable, unsafe to fulfill, or otherwise inconsistent with store policy or applicable law.",
    ],
  },
  {
    title: "Age Verification and Alcohol Compliance",
    body: [
      "Alcohol purchases require valid age verification. A government-issued photo ID must be presented at delivery or pickup.",
      "Orders containing alcohol will only be released to an eligible individual who is 21 years of age or older.",
      "We reserve the right to refuse service if age verification fails, if the recipient appears intoxicated, or if the transaction cannot legally be completed.",
    ],
  },
  {
    title: "Delivery and Pickup",
    body: [
      "Delivery and pickup services are subject to store operations, service area limitations, product availability, and applicable legal requirements.",
      "Estimated fulfillment times are provided for convenience only and are not guaranteed.",
      "Alcohol orders cannot be left unattended and may not be delivered or released where verification requirements are not satisfied.",
    ],
  },
  {
    title: "User Responsibilities",
    body: [
      "You agree to provide accurate, complete, and current information when using the website, creating an account, or placing an order.",
      "You are responsible for maintaining the confidentiality of your account information and for activities that occur under your account.",
    ],
  },
  {
    title: "Prohibited Use",
    body: [
      "You may not use this website:",
    ],
    list: [
      "for any unlawful purpose",
      "to place fraudulent, misleading, or abusive orders",
      "to interfere with or disrupt the normal operation or security of the website",
      "to attempt unauthorized access to systems, accounts, or data",
      "to use the website in a way that violates applicable alcohol laws or regulations",
    ],
  },
  {
    title: "Third-Party Services",
    body: [
      "This website may rely on third-party services or platforms for payments, mapping, authentication, hosting, and other functions.",
      "We are not responsible for failures, interruptions, or errors caused by third-party services that are outside our reasonable control.",
    ],
  },
  {
    title: "Disclaimer of Warranties",
    body: [
      "This website and its services are provided on an \"as is\" and \"as available\" basis to the fullest extent permitted by law.",
      "We make no warranties, express or implied, regarding uninterrupted access, error-free operation, or the accuracy, completeness, or reliability of website content or services.",
    ],
  },
  {
    title: "Limitation of Liability",
    body: [
      "To the fullest extent permitted by law, Vailsburg Wine & Liquor will not be liable for indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the website, inability to use the website, order delays, product unavailability, third-party failures, or unsuccessful transactions.",
    ],
  },
  {
    title: "Changes to These Terms",
    body: [
      "We may update these Terms of Service from time to time. Any updates will be posted on this page, and continued use of the website after changes are posted means you accept the revised Terms.",
    ],
  },
  {
    title: "Contact",
    body: [
      "If you have questions about these Terms of Service, please contact us using the contact information provided on the website.",
    ],
  },
];

export default function TermsPolicyPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Policies
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          Terms of Service
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
          These Terms of Service govern your use of the Vailsburg Wine & Liquor
          website, including account use, orders, delivery, pickup, and alcohol
          compliance requirements.
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