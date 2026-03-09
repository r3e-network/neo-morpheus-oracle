import Link from "next/link";
import { Dashboard } from "../components/dashboard";

export default function HomePage() {
  return (
    <>
      <nav className="navbar">
        <Link href="/" className="nav-logo">
          <img src="/navbar-icon.png" alt="Neo Morpheus Oracle" className="h-8 w-auto" />
          <span>Morpheus 预言机</span>
        </Link>
        <div className="nav-links">
          <a href="#status">状态看板</a>
          <a href="#encrypt">数据加密</a>
          <a href="#oracle">智能请求</a>
          <a href="#compute">隐私计算</a>
          <a href="#feeds">价格源 (Feeds)</a>
          <a href="#attestation">TEE 验证</a>
          <Link href="/verifier" className="btn btn-outline" style={{ padding: '6px 16px', borderRadius: '8px', fontSize: '0.85rem' }}>
            独立验证器
          </Link>
          <a
            href="https://github.com/r3e-network/neo-morpheus-oracle/tree/main/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
            style={{ padding: "6px 16px", borderRadius: "8px", fontSize: "0.85rem" }}
          >
            开发文档
          </a>
        </div>
      </nav>

      <main>
        <section className="hero-section">
          <div className="hero-bg-wrapper">
            <img src="/hero-bg.png" alt="Hero Background" className="hero-bg-img" />
            <div className="hero-overlay" />
          </div>
          <div style={{ position: 'relative', zIndex: 10, maxWidth: '900px', margin: '0 auto' }}>
            <span className="hero-badge">可验证智能 (Verifiable Intelligence)</span>
            <h1 className="hero-title">区块链链上真实的<br />去中心化矩阵计算网络</h1>
            <p className="hero-subtitle">
              专为 <strong>Neo N3</strong> 和 <strong>Neo X</strong> 设计的独立隐私预言机、机密计算和数据源网络。
              在浏览器端本地加密您的数据、直接检查实时 TEE 状态、验证远程认证证明 (Attestation)，并从此控制台操作完整的预言机工作流。
            </p>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', margin: '2rem auto 0' }}>
              <a href="#dashboard" className="btn btn-primary" style={{ width: 'auto', padding: '16px 32px', fontSize: '1.05rem', borderRadius: '16px' }}>
                启动控制台
              </a>
              <a href="https://github.com/r3e-network/neo-morpheus-oracle" target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ width: 'auto', padding: '16px 32px', fontSize: '1.05rem', borderRadius: '16px', background: 'rgba(255,255,255,0.05)' }}>
                查看 GitHub
              </a>
            </div>
          </div>
        </section>

        <div id="dashboard" className="dashboard-container">
          <div style={{ marginBottom: '40px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '2.5rem', marginBottom: '16px' }} className="text-gradient">全功能网络控制台</h2>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '650px', margin: '0 auto', fontSize: '1.1rem' }}>
              无缝交互的 Morpheus 预言机网络控制中心。提供全网最强功能的客户端数据加密、实时行情与智能计算查询、原生 TEE 远程认证状态检测与验证，让全网状态一切尽在掌中。
            </p>
          </div>
          <Dashboard />
        </div>
      </main>

      <footer style={{ borderTop: '1px solid var(--border-subtle)', padding: '60px 40px', textAlign: 'center', marginTop: '60px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>© {new Date().getFullYear()} Neo Morpheus Oracle. All rights reserved.</p>
      </footer>
    </>
  );
}
