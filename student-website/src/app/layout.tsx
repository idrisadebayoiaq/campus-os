import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import {
  MarketingShellFallback,
  MarketingShellServer,
} from "@/components/marketing-shell-server";
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
    default: "CampusOS",
    template: "%s · CampusOS",
  },
  description:
    "CampusOS is the Nigerian student app for housing, study tools, food, marketplace, and AI tutoring. Download for Android and iOS.",
  applicationName: "CampusOS",
  icons: {
    icon: [
      { url: "/brand/mark.png", type: "image/png" },
      { url: "/brand/CampusOS.png", type: "image/png", sizes: "1254x1254" },
    ],
    apple: [{ url: "/brand/CampusOS.png", type: "image/png" }],
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
        <Suspense fallback={<MarketingShellFallback>{children}</MarketingShellFallback>}>
          <MarketingShellServer>{children}</MarketingShellServer>
        </Suspense>
      </body>
    </html>
  );
}
