import { ButtonLink, Container } from "@/components/ui";

export default function NotFound() {
  return (
    <Container>
      <div className="mx-auto max-w-lg space-y-6 py-16 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-muted">404</p>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Page not found</h1>
        <p className="text-sm leading-6 text-muted">
          This CampusOS page doesn&apos;t exist or was moved. The student app lives on your
          phone.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <ButtonLink href="/">Home</ButtonLink>
          <ButtonLink href="/#download" variant="secondary">
            Download the app
          </ButtonLink>
        </div>
      </div>
    </Container>
  );
}
