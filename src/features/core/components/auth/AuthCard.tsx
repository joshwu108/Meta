import type { ReactNode } from 'react';

/** Centered auth frame: wordmark, lead title, white card. */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <p className="mb-6 text-[length:var(--text-lg)] font-bold text-brand-ink">CommonGround</p>
      <section aria-labelledby="auth-title" className="surface-card w-full max-w-[400px] p-6">
        <h1 id="auth-title" className="text-lead">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-text-2">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </section>
      {footer && <p className="mt-4 text-[length:var(--text-sm)] text-text-2">{footer}</p>}
    </main>
  );
}
