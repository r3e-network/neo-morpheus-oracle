import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Morpheus Oracle",
  description: "Privacy Oracle, privacy compute, and datafeed network for Neo N3 and Neo X.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
