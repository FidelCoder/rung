import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { ConnectButton } from '@/components/ConnectButton';
import { Providers } from '@/lib/providers';
import { preview } from '@/lib/chain';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rung — fund the work, one step at a time',
  description: 'Milestone based funding for builders on BOT Chain. Back a clear next step and follow the work as it ships.',
};

const nav = [
  { href: '/#projects', label: 'Projects' },
  { href: '/rounds', label: 'Retrofunding' },
  { href: '/#how-it-works', label: 'How it works' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="site-header">
            <div className="site-header-inner">
              <Link href="/" className="site-brand" aria-label="Rung home">
                <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
                <span>rung</span>
              </Link>
              <nav className="site-nav" aria-label="Main navigation">
                {nav.map(item => <Link key={item.href} href={item.href}>{item.label}</Link>)}
              </nav>
              <div className="site-actions">
                {preview && <span className="preview-chip"><i /> Preview</span>}
                <ConnectButton />
                <Link href="/new" className="header-launch">Launch project <ArrowUpRight aria-hidden="true" /></Link>
              </div>
            </div>
          </header>
          {preview && (
            <div className="preview-note">
              <p>
                <span>PREVIEW</span> Sample projects are shown here. Wallet transactions are unavailable in this demo.
              </p>
            </div>
          )}
          <main className="site-main">{children}</main>
          <footer className="site-footer">
            <div className="site-footer-inner">
              <Link href="/" className="site-brand site-brand-footer"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>rung</span></Link>
              <span>Milestone funding for builders on BOT Chain.</span>
              <div><Link href="/rounds">Retrofunding</Link><Link href="/workspace">Workspace</Link><Link href="/review">Review</Link><Link href="/admin">Admin</Link></div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
