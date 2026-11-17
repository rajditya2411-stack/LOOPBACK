import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "LoopBack Law – Legal Chambers & Litigation Practice Hub",
  description:
    "Private, on-device legal practice management, case dockets, limitation period calculator, landmark precedents repository, and cause list hearing tracker.",
  keywords: [
    "Advocate",
    "Law Firm",
    "Litigation",
    "Commercial Court",
    "Limitation Act",
    "Case Precedents",
    "Supreme Court",
    "High Court",
    "Cause List",
    "Legal Drafting",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Inter:wght@100..900&family=JetBrains+Mono:wght@400..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-surface font-sans text-on-surface antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
