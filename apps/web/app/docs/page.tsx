"use client";

import Link from "next/link";
import { ArrowRight, Shield, Cpu, Zap, Terminal, ClipboardList, Activity, Fingerprint, CheckCircle } from "lucide-react";

export default function DocsIntroduction() {
  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
        <div className="status-dot"></div>
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--neo-green)', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>DOCUMENTATION v1.0.3</span>
      </div>
      
      <h1>Infrastructure for Machine-Verified Truth</h1>
      
      <p className="lead" style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '2.5rem' }}>
        Neo Morpheus Oracle is a decentralized privacy-preserving prover network. It uses hardware-backed Trusted Execution Environments to bridge sensitive off-chain data into Neo N3 callback flows.
      </p>

      <div className="grid grid-2" style={{ gap: '1.5rem', marginBottom: '4rem' }}>
        <div className="card-industrial" style={{ padding: '1.5rem' }}>
          <Shield size={20} color="var(--neo-green)" style={{ marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Confidentiality</h3>
          <p style={{ fontSize: '0.85rem', marginBottom: 0 }}>End-to-end encryption ensures secrets are only unsealed inside secure hardware memory.</p>
        </div>
        <div className="card-industrial" style={{ padding: '1.5rem' }}>
          <Cpu size={20} color="var(--accent-blue)" style={{ marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Verifiability</h3>
          <p style={{ fontSize: '0.85rem', marginBottom: 0 }}>Cryptographic proofs (Attestation) guarantee that execution happened exactly as programmed.</p>
        </div>
      </div>

      <h2>The Privacy Problem</h2>
      <p>
        Standard oracles broadcast sensitive data—such as API keys, private identity scores, or proprietary trading logic—directly onto public ledgers. This transparency prevents smart contracts from interacting with most of the world's high-value data.
      </p>
      
      <blockquote style={{ borderLeft: '2px solid var(--neo-green)', background: 'rgba(0, 255, 163, 0.02)', padding: '1.5rem', margin: '2rem 0' }}>
        <strong>The Morpheus Solution:</strong> By moving logic into the Phala TEE runtime, Morpheus creates a secure sandbox where data can be fetched, processed, and signed without ever being exposed to node operators or the underlying cloud provider.
      </blockquote>

      <h2>Core Architecture</h2>
      <p>
        The Morpheus ecosystem is composed of three primary layers designed for high availability and absolute integrity:
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', margin: '2.5rem 0' }}>
        {[
          { icon: Zap, title: "On-Chain Registry & verification", desc: "Native contracts track request metadata, fee credits, callback routing, and verifier-key-checked fulfillment." },
          { icon: Terminal, title: "Asynchronous Relayer", desc: "A robust event-driven bridge that coordinates between the Neo blockchain events and the Phala TEE worker cluster." },
          { icon: Shield, title: "TEE Prover Network", desc: "Hardware-isolated workers that unseal data, execute requests, and generate cryptographically verifiable proofs." }
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: '1.5rem', padding: '1.5rem', background: '#000', border: '1px solid var(--border-dim)', borderRadius: '4px' }}>
            <div style={{ background: 'rgba(0,255,163,0.05)', padding: '12px', borderRadius: '4px', height: 'fit-content', border: '1px solid rgba(0,255,163,0.1)' }}>
              <item.icon size={20} color="var(--neo-green)" />
            </div>
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.4rem', color: '#fff', letterSpacing: '0.02em', textTransform: 'uppercase' }}>{item.title}</h4>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 0, lineHeight: 1.6 }}>{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <h2>Next Steps</h2>
      <div className="grid grid-2" style={{ gap: '1.5rem' }}>
        <Link href="/docs/quickstart" className="card-industrial" style={{ padding: '2rem', textDecoration: 'none', transition: 'border-color 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>QUICKSTART GUIDE</span>
            <ArrowRight size={18} color="var(--neo-green)" />
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>Integrate the Morpheus Oracle into your smart contracts in under 5 minutes.</p>
        </Link>
        <Link href="/docs/architecture" className="card-industrial" style={{ padding: '2rem', textDecoration: 'none', transition: 'border-color 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>TECHNICAL SPEC</span>
            <ArrowRight size={18} color="var(--neo-green)" />
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>Deep dive into the TEE trust model and relayer logic.</p>
        </Link>
        <Link href="/docs/r/TESTING_LEDGER" className="card-industrial" style={{ padding: '2rem', textDecoration: 'none', transition: 'border-color 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>TESTING LEDGER</span>
            <ClipboardList size={18} color="var(--neo-green)" />
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>View the exact scripts, contracts, transactions, request ids, and accepted results behind the current validation set.</p>
        </Link>
        <Link href="/docs/r/MAINNET_DOMAIN_ROUTING_2026-03-15" className="card-industrial" style={{ padding: '2rem', textDecoration: 'none', transition: 'border-color 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>MAINNET DOMAINS</span>
            <ClipboardList size={18} color="var(--neo-green)" />
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>Review the canonical mainnet domain routing table for Oracle, NeoDID, smartwallet, compatibility aliases, and every published AA subdomain.</p>
        </Link>
        <Link href="/docs/r/PAYMASTER_AA_TESTNET_VALIDATION_2026-03-14" className="card-industrial" style={{ padding: '2rem', textDecoration: 'none', transition: 'border-color 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>AA PAYMASTER VALIDATION</span>
            <CheckCircle size={18} color="var(--neo-green)" />
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>Inspect the live Neo N3 testnet validation for account registration, verifier update, paymaster authorization, and relay-backed executeUserOp.</p>
        </Link>
        <Link href="/docs/r/AA_NEODID_ORACLE_INTEGRATED_BASELINE_2026-03-14" className="card-industrial" style={{ padding: '2rem', textDecoration: 'none', transition: 'border-color 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>AA + MORPHEUS BASELINE</span>
            <ClipboardList size={18} color="var(--neo-green)" />
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>Review the unified testnet baseline across AA V3, NeoDID, privacy oracle, builtins, automation, and paymaster sponsorship before integrated attack execution.</p>
        </Link>
        <Link href="/docs/r/N3_INTEGRATED_ATTACK_REGRESSION_TESTNET_2026-03-17" className="card-industrial" style={{ padding: '2rem', textDecoration: 'none', transition: 'border-color 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>INTEGRATED ATTACK REGRESSION</span>
            <CheckCircle size={18} color="var(--neo-green)" />
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>Inspect the current Oracle + NeoDID + AA verifier regression run, including the latest live testnet attack-matrix stage results and remaining gaps.</p>
        </Link>
        <Link href="/docs/feed-status" className="card-industrial" style={{ padding: '2rem', textDecoration: 'none', transition: 'border-color 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>FEED STATUS</span>
            <Activity size={18} color="var(--neo-green)" />
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>Compare configured feed pairs, current on-chain values, live source values, and deprecated legacy keys in one view.</p>
        </Link>
        <Link href="/docs/neodid" className="card-industrial" style={{ padding: '2rem', textDecoration: 'none', transition: 'border-color 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>NEODID & DID</span>
            <Fingerprint size={18} color="var(--neo-green)" />
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>Review the Oracle-only NeoDID flow, Web3Auth-in-TEE validation path, and the new W3C DID resolver surface.</p>
        </Link>
      </div>
    </div>
  );
}
