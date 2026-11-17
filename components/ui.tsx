"use client";

import Link from "next/link";
import { useEffect, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variantCls: Record<Variant, string> = {
  primary: "glass-tint",
  secondary: "glass text-link",
  ghost: "text-link",
  danger: "glass text-danger",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  const s = { sm: "h-9 px-3.5 text-sm", md: "h-11 px-4 text-[15px]", lg: "h-14 px-5 text-base" }[size];
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-bold transition duration-150 active:scale-[0.97] disabled:opacity-45 disabled:active:scale-100 ${variantCls[variant]} ${s} ${className}`}
    >
      {loading ? <Spinner small /> : null}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  className = "",
  variant = "secondary",
}: {
  href: string;
  children: ReactNode;
  className?: string;
  variant?: Variant;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-bold transition active:scale-[0.97] ${variantCls[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

/** A floating glass panel with an optional quiet heading above it. */
export function Section({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-5 ${className}`}>
      {(title || action) && (
        <div className="mb-2 flex items-end justify-between px-2">
          {title ? <h2 className="text-[15px] font-bold text-fg/80">{title}</h2> : <span />}
          {action}
        </div>
      )}
      <div className="glass overflow-hidden rounded-[28px]">{children}</div>
    </section>
  );
}

export function Row({
  children,
  onClick,
  href,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const cls = `flex w-full items-center gap-3 px-4 py-3.5 text-left border-b hairline last:border-b-0 ${
    onClick || href ? "active:bg-fg/5 transition-colors" : ""
  } ${className}`;
  if (href)
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {children}
      </button>
    );
  return <div className={cls}>{children}</div>;
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      aria-label="Завантаження"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? "h-4 w-4" : "h-7 w-7 text-hint"}`}
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
    <div className="flex flex-col items-center px-6 py-9 text-center">
      {icon && <div className="mb-2 text-4xl">{icon}</div>}
      <div className="font-bold">{title}</div>
      {children && <div className="mt-1 max-w-xs text-sm text-hint">{children}</div>}
    </div>
  );
}

/** Segmented control with a glass thumb sliding under the active option. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const style: CSSProperties = {
    width: `calc((100% - 8px) / ${options.length})`,
    transform: `translateX(${idx * 100}%)`,
  };
  return (
    <div className="relative flex rounded-full bg-fg/7 p-1">
      <span
        aria-hidden
        className="glass-strong absolute top-1 bottom-1 left-1 rounded-full transition-transform duration-300 ease-[cubic-bezier(.3,1.3,.5,1)]"
        style={style}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`relative z-10 flex-1 rounded-full px-3 py-2 text-sm font-bold transition-colors ${value === o.value ? "text-fg" : "text-hint"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet made of thick glass (mobile-first). */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
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
      <div className="animate-fade absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="glass-strong animate-sheet pb-safe relative m-2 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[34px] px-4 pt-3">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-fg/20 sm:hidden" />
        {title && (
          <div className="mb-4 flex items-center justify-between gap-3 px-1">
            <h3 className="font-display truncate text-lg font-bold">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрити"
              className="glass grid h-9 w-9 shrink-0 place-items-center rounded-full text-hint"
            >
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
    <label className="block border-b hairline px-4 py-3.5 last:border-b-0">
      <span className="mb-1.5 block text-[13px] font-semibold text-hint">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-hint">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-2xl bg-fg/6 px-3.5 py-3 text-[16px] font-medium outline-none ring-1 ring-inset ring-fg/5 placeholder:text-hint/70 focus:ring-2 focus:ring-link/60";

/** Pill used for quick choices (stack presets, reminder interval…). */
export function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-full py-2.5 text-sm font-bold tabular transition active:scale-95 ${active ? "glass-tint" : "bg-fg/6 text-fg/80"}`}
    >
      {children}
    </button>
  );
}

export function Signed({ value, children, className = "" }: { value: number; children: ReactNode; className?: string }) {
  return <span className={`tabular ${value > 0 ? "text-pos" : value < 0 ? "text-neg" : "text-hint"} ${className}`}>{children}</span>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "pos" | "neg" | "gold" }) {
  const t = {
    neutral: "bg-fg/8 text-hint",
    accent: "bg-link/14 text-link",
    pos: "bg-pos/15 text-pos",
    neg: "bg-neg/15 text-neg",
    gold: "bg-gold/18 text-gold",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${t}`}>{children}</span>;
}

/** Poker-chip avatar. */
export function ChipAvatar({ color, label, size = 42, muted }: { color: string; label: ReactNode; size?: number; muted?: boolean }) {
  return (
    <span
      className={`chip grid shrink-0 place-items-center font-display text-[13px] font-bold text-white ${muted ? "grayscale" : ""}`}
      style={{ width: size, height: size, ["--chip" as string]: color }}
    >
      <span className="relative z-10 drop-shadow-sm">{label}</span>
    </span>
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="animate-fade pointer-events-none fixed inset-x-0 bottom-28 z-[60] flex justify-center px-4">
      <div className="glass-strong rounded-full px-5 py-3 text-sm font-semibold" role="status">
        {message}
      </div>
    </div>
  );
}

/** iOS-style switch row. */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 border-b hairline px-4 py-3.5 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] text-hint">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-link ${checked ? "bg-pos" : "bg-fg/15"}`}
      >
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </label>
  );
}
