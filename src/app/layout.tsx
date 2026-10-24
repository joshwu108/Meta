import type { Metadata } from 'next';
import './globals.css';

/** OWNED BY WORKSTREAM 01 — root layout. Main wins on the next sync. */
export const metadata: Metadata = {
  title: 'CommonGround',
  description: 'Local social discovery: people, groups and events near you.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
