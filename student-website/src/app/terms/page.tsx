import { LegalPage } from "@/components/legal-page";
import { TERMS } from "@/lib/legal";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return <LegalPage doc={TERMS} other={{ href: "/privacy", label: "Privacy Policy" }} />;
}
