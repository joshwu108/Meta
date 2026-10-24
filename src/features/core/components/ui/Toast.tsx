'use client';
import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from './cn';

export type ToastTone = 'info' | 'success' | 'danger';
export type ToastItem = { id: number; message: string; tone: ToastTone };

type ToastContextValue = { toast: (message: string, tone?: ToastTone) => void };
const ToastContext = createContext<ToastContextValue>({ toast: () => undefined });
const TOAST_MS = 4000;

const icons: Record<ToastTone, ReactNode> = {
  info: <Info size={18} className="text-brand" aria-hidden />,
  success: <CheckCircle2 size={18} className="text-success" aria-hidden />,
  danger: <XCircle size={18} className="text-danger" aria-hidden />,
};

/** Provides `useToast()`; renders toasts bottom-left ≥768px, bottom on mobile, 4s each. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, message, tone }]);
    setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), TOAST_MS);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--tabbar-height)+16px)] z-[60] flex flex-col gap-2 md:inset-x-auto md:bottom-4 md:left-4 md:w-80">
        {items.map((item) => (
          <ToastView key={item.id} item={item} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function ToastView({ item }: { item: ToastItem }) {
  return (
    <div role="status" className={cn('rise-in pointer-events-auto flex items-center gap-3 rounded-md bg-surface px-4 py-3 shadow-[var(--shadow-3)]')}>
      {icons[item.tone]}
      <span className="text-[length:var(--text-sm)]">{item.message}</span>
    </div>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
