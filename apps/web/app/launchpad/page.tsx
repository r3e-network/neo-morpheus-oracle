"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Launchpad } from "@/components/launchpad/Launchpad";

export default function LaunchpadPage() {
  return (
    <div className="min-h-screen bg-main flex flex-col">
      <nav className="navbar" style={{ position: "sticky" }}>
        <Link href="/" className="nav-logo" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <ArrowLeft size={18} />
          <span className="text-gradient" style={{ letterSpacing: "0.1em" }}>MORPHEUS <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>| Launchpad</span></span>
        </Link>
        <div className="nav-links">
          <Link href="/explorer" className="nav-link">Explorer</Link>
          <Link href="/docs/launchpad" className="nav-link">Docs Mode</Link>
        </div>
      </nav>
      <main className="container" style={{ flex: 1, padding: "2rem 0" }}>
        <Launchpad embedded />
      </main>
    </div>
  );
}
