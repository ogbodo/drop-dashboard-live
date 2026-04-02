import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  description:
    "Secure Drop operations dashboard for dispatch, ride management, finance, partners, and support.",
  icons: {
    apple: "/drop-logo.png",
    icon: "/drop-logo.png",
    shortcut: "/drop-logo.png",
  },
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
