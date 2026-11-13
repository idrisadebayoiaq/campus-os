import Link from "next/link";
import { Container } from "@/components/ui";

const appLinks = [
  { href: "/dashboard", label: "Home" },
  { href: "/housing", label: "Housing" },
  { href: "/food", label: "Food" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/study", label: "Study" },
  { href: "/inbox", label: "Inbox" },
  { href: "/guides", label: "Guides" },
  { href: "/profile", label: "Profile" },
];

export function StudentNav({
  email,
}: {
  email?: string | null;
}) {
  const loggedIn = Boolean(email);

  return (
    <header className="border-b border-border bg-bg">
      <Container>
        <div className="flex h-14 items-center justify-between gap-4">
          <Link
            href={loggedIn ? "/dashboard" : "/login"}
            className="text-sm font-semibold tracking-tight"
          >
            CampusOS
          </Link>
          {loggedIn ? (
            <>
              <nav className="hidden items-center gap-5 text-sm text-muted md:flex">
                {appLinks.map((link) => (
                  <Link key={link.href} href={link.href} className="hover:text-fg">
                    {link.label}
                  </Link>
                ))}
              </nav>
              <Link href="/profile" className="text-sm text-muted hover:text-fg">
                {email}
              </Link>
            </>
          ) : (
            <nav className="flex items-center gap-3 text-sm">
              <Link href="/login" className="text-muted hover:text-fg">
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-inverse-bg px-3 py-2 text-inverse-fg"
              >
                Sign up
              </Link>
            </nav>
          )}
        </div>
        {loggedIn ? (
          <nav className="flex gap-4 overflow-x-auto border-t border-border py-3 text-sm text-muted md:hidden">
            {appLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="whitespace-nowrap hover:text-fg"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </Container>
    </header>
  );
}
