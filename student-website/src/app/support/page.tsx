import { SupportForm } from "@/components/support-form";
import { Container, PageHeader } from "@/components/ui";

export const metadata = { title: "Contact support" };

export default function SupportPage() {
  return (
    <Container>
      <div className="mx-auto max-w-xl space-y-8 py-10">
        <PageHeader
          title="Contact support"
          description="Housing issues, study tools, or account help — send a message and we'll follow up by email."
        />
        <SupportForm />
      </div>
    </Container>
  );
}
