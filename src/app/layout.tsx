import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Voice-to-SQL Lifting Logger",
  description: "Log powerlifting sets from voice into SQLite.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
