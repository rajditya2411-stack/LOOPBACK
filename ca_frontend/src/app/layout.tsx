import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "LoopBack CA – Chartered Accountant & Tax Advisory Hub",
  description:
    "Private, on-device practice management, statutory compliance calendar, working paper audit checklists (CARO 2020 / Form 3CD), and AI tax notice advisory.",
  keywords: [
    "Chartered Accountant",
    "Tax Advisory",
    "Audit",
    "CARO 2020",
    "Form 3CD",
    "GST",
    "TDS",
    "Income Tax",
    "Schedule III",
    "Working Papers",
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
