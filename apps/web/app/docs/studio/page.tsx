"use client";

import { Boxes } from "lucide-react";
import { StarterStudio } from "@/components/starter/StarterStudio";

export default function DocsStarterStudioPage() {
  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
        <Boxes size={14} color="var(--neo-green)" />
        <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--font-mono)" }}>
          INTERACTIVE STARTER STUDIO
        </span>
      </div>
      <h1>Starter Studio</h1>
      <p className="lead" style={{ fontSize: "1.1rem", color: "var(--text-primary)", marginBottom: "2.5rem", lineHeight: 1.6 }}>
        An interactive generator for privacy oracle and compute requests. Choose a flow, toggle encryption, and copy the exact payload and Neo N3 request snippet.
      </p>
      <StarterStudio />
    </div>
  );
}
