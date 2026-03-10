import { Dashboard } from "../../components/dashboard";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function ExplorerPage() {
  return (
    <div className="min-h-screen bg-main flex flex-col">
      <nav className="navbar" style={{ position: 'sticky' }}>
        <Link href="/" className="nav-logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArrowLeft size={18} />
          <span className="text-gradient" style={{ letterSpacing: '0.1em' }}>MORPHEUS <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>| Explorer</span></span>
        </Link>
      </nav>
      <main className="container" style={{ flex: 1, padding: '2rem 0' }}>
        <Dashboard />
      </main>
    </div>
  );
}
