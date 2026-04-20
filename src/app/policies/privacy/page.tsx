import { Card } from "@/components/ui/Card";

const sections = [
  {
    title: "Information We Collect",
    body: [
      "We may collect personal information when you use our website, create an account, place an order, contact us, or otherwise interact with our services.",
      "This information may include your name, email address, phone number, billing address, delivery address, account details, and order information.",
      "We may also collect limited technical information such as device, browser, IP address, and website usage data to support security, performance, and analytics.",
    ],
  },
  {
    title: "Payment Information",
    body: [
      "Payment information is processed through third-party payment providers. We do not store full payment card details on our own servers.",
    ],
  },
  {
    title: "How We Use Information",
    body: [
      "We use the information we collect to operate and improve the website and our services, including to:",
    ],
    list: [
      "process and fulfill orders",
      "verify customer, delivery, and account details",
      "communicate about orders, updates, or support requests",
      "improve site functionality and user experience",
      "detect fraud, abuse, unauthorized activity, or security issues",
      "maintain legal, operational, and business records",
    ],
  },
  {
    title: "Sharing of Information",
    body: [
      "We do not sell your personal information.",
      "We may share limited information with service providers or platforms that help us operate the business, such as payment processors, delivery support services, hosting or infrastructure providers, authentication providers, and map or address validation providers.",
      "These parties receive only the information reasonably necessary to perform their services.",
    ],
  },
  {
    title: "Cookies and Usage Data",
    body: [
      "We may use cookies or similar technologies to support core site functionality, remember preferences, improve performance, and better understand how users interact with the website.",
      "You can manage cookie settings through your browser, but disabling cookies may affect certain site features.",
    ],
  },
  {
    title: "Data Security",
    body: [
      "We take reasonable administrative, technical, and operational measures to help protect personal information.",
      "However, no method of online transmission or storage is completely secure, and we cannot guarantee absolute security.",
    ],
  },
  {
    title: "Data Retention",
    body: [
      "We retain information for as long as reasonably necessary for business, legal, tax, fraud prevention, security, and operational purposes.",
    ],
  },
  {
    title: "Your Choices",
    body: [
      "You may contact us if you would like to update your information, ask questions about your data, or request deletion of account-related information where applicable.",
      "In some cases, we may retain certain information as required or permitted by law or for legitimate business purposes.",
    ],
  },
  {
    title: "Children’s Privacy",
    body: [
      "This website is not intended for individuals under 21 years of age. We do not knowingly collect personal information from individuals who are not legally permitted to purchase alcohol.",
    ],
  },
  {
    title: "Changes to This Policy",
    body: [
      "We may update this Privacy Policy from time to time. Any updates will be posted on this page, and continued use of the website after changes are posted means you accept the updated policy.",
    ],
  },
  {
    title: "Contact",
    body: [
      "If you have questions about this Privacy Policy or how your information is handled, please contact us using the contact information provided on the website.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Policies
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          Privacy Policy
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
          This Privacy Policy explains what information we collect, how we use
          it, and how we help protect it when you use the Vailsburg Wine &
          Liquor website.
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