import { LegalPage } from "@/components/legal-page";
import { PRIVACY } from "@/lib/legal";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY} other={{ href: "/terms", label: "Terms of Service" }} />;
}
