import type { Metadata } from "next";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";

export const metadata: Metadata = {
  title: "Terms of Service — Alpine Shell",
  description: "The terms that govern your use of Alpine Shell.",
};

const lastUpdated = "June 17, 2026";

type TermsSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

const sections: TermsSection[] = [
  {
    title: "1. Agreement to these Terms",
    paragraphs: [
      "Alpine Shell (\"Alpine Shell\", \"we\", \"us\") provides a desktop shell replacement for Windows, this website, and related services (together, the \"Services\"). By downloading, installing, purchasing, or using the Services, you agree to these Terms of Service. If you do not agree, do not use the Services.",
    ],
  },
  {
    title: "2. License to use the software",
    paragraphs: [
      "Subject to these Terms and the plan you purchase, we grant you a personal, non-exclusive, non-transferable, and revocable license to install and use Alpine Shell on devices you own or control.",
      "You may not resell, redistribute, sublicense, rent, or lease the software, and you may not reverse engineer, decompile, or disassemble it except to the extent applicable law expressly permits.",
    ],
  },
  {
    title: "3. License keys and activation",
    paragraphs: [
      "Paid plans are unlocked with a license key tied to your purchase. You are responsible for keeping your key confidential. We may suspend or revoke keys that are shared publicly, used on more devices than your plan allows, or obtained fraudulently.",
    ],
  },
  {
    title: "4. Payments and refunds",
    paragraphs: [
      "Prices are shown on the website and may change at any time. Payments are handled by third-party payment processors, and by purchasing you also agree to their terms.",
      "Because Alpine Shell is digital software delivered immediately, you may request a refund within 14 days of purchase if the software does not work as described. Refunds are granted at our reasonable discretion.",
    ],
  },
  {
    title: "5. Acceptable use",
    paragraphs: ["When using the Services, you agree that you will not:"],
    bullets: [
      "use the Services for any unlawful purpose or in violation of any applicable law;",
      "circumvent, disable, or tamper with licensing, activation, or security features;",
      "distribute malware or use the Services to harm the systems or data of others;",
      "misrepresent your identity or your authorization to use a device.",
    ],
  },
  {
    title: "6. Changes to your system",
    paragraphs: [
      "Alpine Shell replaces the default Windows shell and changes how your desktop and system controls behave. You use it at your own risk. We strongly recommend keeping backups of your data and a way to restore the default Windows shell. We are not responsible for data loss or downtime resulting from your use of the software.",
    ],
  },
  {
    title: "7. Disclaimer of warranties",
    paragraphs: [
      "The Services are provided \"as is\" and \"as available\" without warranties of any kind, whether express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Services will be uninterrupted, error-free, or compatible with every system configuration.",
    ],
  },
  {
    title: "8. Limitation of liability",
    paragraphs: [
      "To the maximum extent permitted by law, Alpine Shell and its operators will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of data, profits, or system availability, arising out of or related to your use of the Services. Our total liability for any claim will not exceed the amount you paid for the Services in the twelve months before the claim.",
    ],
  },
  {
    title: "9. Termination",
    paragraphs: [
      "We may suspend or terminate your access to the Services, including your license keys, if you breach these Terms. On termination, your right to use the software ends and you must stop using it and remove it from your devices.",
    ],
  },
  {
    title: "10. Changes to these Terms",
    paragraphs: [
      "We may update these Terms from time to time. When we do, we will revise the \"Last updated\" date above. Your continued use of the Services after changes take effect means you accept the revised Terms.",
    ],
  },
  {
    title: "11. Governing law",
    paragraphs: [
      "These Terms are governed by the laws of Switzerland, without regard to its conflict-of-law rules and excluding the United Nations Convention on Contracts for the International Sale of Goods (CISG). Any disputes arising out of or in connection with these Terms are subject to the exclusive jurisdiction of the competent courts of Switzerland.",
    ],
  },
];

export default function TermsPage() {
  return (
    <>
      <NavBar />
      <main className="flex-1">
        <div className="px-8 py-16">
          <div className="container mx-auto">
            <div className="max-w-3xl">
              <h1 className="font-averia text-4xl font-semibold tracking-tight sm:text-5xl">
                Terms of Service
              </h1>
              <p className="mt-4 text-sm text-gray-400">Last updated: {lastUpdated}</p>

              <div className="mt-12 space-y-10">
                {sections.map((section) => (
                  <section key={section.title}>
                    <h2 className="text-xl font-semibold text-white">{section.title}</h2>
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph} className="mt-3 leading-relaxed text-gray-300">
                        {paragraph}
                      </p>
                    ))}
                    {section.bullets && (
                      <ul className="mt-3 list-disc space-y-2 pl-6 leading-relaxed text-gray-300">
                        {section.bullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}

                <section>
                  <h2 className="text-xl font-semibold text-white">12. Contact</h2>
                  <p className="mt-3 leading-relaxed text-gray-300">
                    Questions about these Terms can be sent to{" "}
                    <a
                      href="mailto:marc.blattmann08@gmail.com"
                      className="text-white underline underline-offset-4 transition hover:text-gray-300"
                    >
                      marc.blattmann08@gmail.com
                    </a>
                    .
                  </p>
                </section>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer theme="dark" />
    </>
  );
}
