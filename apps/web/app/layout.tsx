import "./globals.css";
import type { ReactNode } from "react";

const metadataBase = new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");

export const metadata = {
  metadataBase,
  title: "Morpheus Oracle",
  description: "Privacy Oracle, privacy compute, and datafeed network for Neo N3.",
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Morpheus Oracle",
    description: "Truth infrastructure for Neo N3.",
    images: ["/og-card.svg"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
