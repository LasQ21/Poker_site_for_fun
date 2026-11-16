"use client";

import Link from "next/link";
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  const v = {
    primary: "bg-button text-button-fg",
    secondary: "bg-button/12 text-link",
    ghost: "text-link",
    danger: "bg-danger/12 text-danger",
  }[variant];
  const s = { sm: "h-9 px-3 text-sm", md: "h-11 px-4 text-[15px]", lg: "h-13 px-5 text-base" }[size];
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:opacity-50 ${v} ${s} ${className}`}
    >
      {loading ? <Spinner small /> : null}
      {children}
    </button>
  );
}

export function LinkButton({ href, children, className = "", variant = "secondary" }: { href: string; children: ReactNode; className?: string; variant?: Variant }) {
  const v = { primary: "bg-button text-button-fg", secondary: "bg-button/12 text-link", ghost: "text-link", danger: "bg-danger/12 text-danger" }[variant];
  return (
    <Link href={href} className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition active:scale-[0.98] ${v} ${className}`}>
      {children}
    </Link>
  );
}

export function Section({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mb-4 ${className}`}>
      {(title || action) && (
        <div className="mb-1.5 flex items-end justify-between px-4">
          {title ? <h2 className="text-[13px] font-medium uppercase tracking-wide text-hint">{title}</h2> : <span />}
          {action}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl bg-section">{children}</div>
    </section>
  );
}

export function Row({ children, onClick, href, className = "" }: { children: ReactNode; onClick?: () => void; href?: string; className?: string }) {
  const cls = `flex w-full items-center gap-3 px-4 py-3 text-left border-b border-sep last:border-b-0 ${onClick || href ? "active:bg-fg/5 transition-colors" : ""} ${className}`;
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{children}</button>;
  return <div className={cls}>{children}</div>;
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      aria-label="Завантаження"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? "h-4 w-4" : "h-6 w-6 text-hint"}`}
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-2 text-4xl">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {children && <div className="mt-1 text-sm text-hint">{children}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-fg/6 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${value === o.value ? "bg-section text-fg shadow-sm" : "text-hint"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet modal (mobile-first). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="animate-fade absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="animate-sheet pb-safe relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-section px-4 pt-3 sm:rounded-3xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-hint/40 sm:hidden" />
        {title && (
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold">{title}</h3>
            <button type="button" onClick={onClose} aria-label="Закрити" className="grid h-8 w-8 place-items-center rounded-full bg-fg/8 text-hint">
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block px-4 py-3 border-b border-sep last:border-b-0">
      <span className="mb-1 block text-[13px] text-hint">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-hint">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl bg-fg/6 px-3 py-2.5 text-[16px] outline-none placeholder:text-hint/70 focus:ring-2 focus:ring-button/50";

export function Signed({ value, children, className = "" }: { value: number; children: ReactNode; className?: string }) {
  return <span className={`tabular ${value > 0 ? "text-pos" : value < 0 ? "text-neg" : "text-hint"} ${className}`}>{children}</span>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "pos" | "neg" }) {
  const t = { neutral: "bg-fg/8 text-hint", accent: "bg-button/15 text-link", pos: "bg-pos/15 text-pos", neg: "bg-neg/15 text-neg" }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${t}`}>{children}</span>;
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="animate-fade pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
      <div className="rounded-xl bg-black/85 px-4 py-2.5 text-sm text-white shadow-lg">{message}</div>
    </div>
  );
}
