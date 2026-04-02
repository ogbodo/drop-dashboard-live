import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  description:
    "Secure Drop operations dashboard for dispatch, ride management, finance, partners, and support.",
  title: "Drop Ops Dashboard",
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
