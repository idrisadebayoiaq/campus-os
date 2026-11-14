import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import {
  PortalShellFallback,
  PortalShellServer,
} from "@/components/portal-shell-server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CampusOS Portal",
    template: "%s · CampusOS Portal",
  },
  description:
    "Business portal for CampusOS landlords, vendors, and campus service providers.",
  applicationName: "CampusOS Portal",
  icons: {
    icon: [{ url: "/brand/mark.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('campusos-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full bg-bg text-fg">
        <Suspense fallback={<PortalShellFallback>{children}</PortalShellFallback>}>
          <PortalShellServer>{children}</PortalShellServer>
        </Suspense>
      </body>
    </html>
  );
}
