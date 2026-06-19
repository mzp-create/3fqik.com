import Link from "next/link";

export function EmptyState({
  icon,
  title,
  body,
  ctaLabel,
  ctaHref,
}: {
  icon: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="mb-4 flex h-[74px] w-[74px] items-center justify-center rounded-full border border-border bg-raised text-[34px]">
        {icon}
      </div>
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      <p className="mt-2 max-w-[240px] text-sm leading-relaxed text-muted">
        {body}
      </p>
      <Link
        href={ctaHref}
        className="mt-5 rounded-xl border border-mx bg-mx/90 px-5 py-3 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
      >
        {ctaLabel} →
      </Link>
    </div>
  );
}
