import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/styles/tokens.css";

// Minimal root layout until workstream 01 ships the app shell.
export const metadata: Metadata = { title: "CommonGround" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
