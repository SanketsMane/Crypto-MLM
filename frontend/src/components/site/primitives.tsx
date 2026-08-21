import { clsx } from 'clsx';
import type { ReactNode } from 'react';

/* Layout and typographic primitives for the public site.
   The console has its own set; these are deliberately separate because the
   marketing surface has one fixed identity and a much larger type scale. */

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('mx-auto w-full max-w-[1200px] px-5 sm:px-8', className)}>{children}</div>;
}

export function Section({
  children, className, id, tone = 'base',
}: {
  children: ReactNode; className?: string; id?: string;
  tone?: 'base' | 'raised' | 'deep';
}) {
  return (
    <section
      id={id}
      className={clsx(
        'py-16 sm:py-20 lg:py-28',
        tone === 'raised' && 'bg-navy',
        tone === 'deep' && 'bg-navy-deep',
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Small gold-on-navy label that opens a section. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={clsx('inline-flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-brand-gold', className)}>
      <span aria-hidden className="h-px w-6 bg-brand-gold/60" />
      {children}
    </p>
  );
}

export function Heading({
  children, level = 2, className, size = 'lg',
}: {
  children: ReactNode; level?: 1 | 2 | 3; className?: string; size?: 'xl' | 'lg' | 'md';
}) {
  const Tag = (['h1', 'h2', 'h3'] as const)[level - 1];
  return (
    <Tag
      className={clsx(
        'font-semibold tracking-[-0.03em] text-white',
        size === 'xl' && 'text-[34px] leading-[1.08] sm:text-[46px] lg:text-[58px]',
        size === 'lg' && 'text-[27px] leading-[1.14] sm:text-[34px] lg:text-[40px]',
        size === 'md' && 'text-[20px] leading-[1.2] sm:text-[23px]',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={clsx('text-[15.5px] leading-[1.7] text-white/62 sm:text-[16.5px]', className)}>
      {children}
    </p>
  );
}

/** Section intro: eyebrow, heading and standfirst in one consistent block. */
export function SectionHead({
  eyebrow, title, lead, align = 'left', className,
}: {
  eyebrow?: string; title: ReactNode; lead?: ReactNode;
  align?: 'left' | 'center'; className?: string;
}) {
  return (
    <div className={clsx(align === 'center' && 'mx-auto max-w-[720px] text-center', 'max-w-[760px]', className)}>
      {eyebrow && <Eyebrow className={align === 'center' ? 'justify-center' : undefined}>{eyebrow}</Eyebrow>}
      <Heading className="mt-4">{title}</Heading>
      {lead && <Lead className="mt-4">{lead}</Lead>}
    </div>
  );
}

/** Bordered navy panel — the site's equivalent of a card. */
export function Panel({
  children, className, hover = false,
}: { children: ReactNode; className?: string; hover?: boolean }) {
  return (
    <div className={clsx(
      'rounded-2xl border border-white/[0.07] bg-navy-card/70 backdrop-blur-[2px]',
      hover && 'transition-all duration-300 hover:border-brand-gold/25 hover:bg-navy-card',
      className,
    )}>
      {children}
    </div>
  );
}

/** A hairline that fades out at both ends — used between major sections. */
export function Rule({ className }: { className?: string }) {
  return (
    <div aria-hidden className={clsx('h-px bg-gradient-to-r from-transparent via-white/12 to-transparent', className)} />
  );
}
