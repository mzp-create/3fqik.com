"use client";
import { useT } from "@/lib/i18n";

export default function RulesPage() {
  const { t } = useT();
  const sections = [
    { title: t.rulesAhTitle, body: t.rulesAhBody },
    { title: t.rulesOuTitle, body: t.rulesOuBody },
    { title: t.rulesPriceTitle, body: t.rulesPriceBody },
    { title: t.rulesPushTitle, body: t.rulesPushBody },
  ];
  return (
    <main className="p-4">
      <h1 className="font-display text-2xl text-ink">{t.rulesTitle}</h1>
      <div className="mt-4 space-y-3">
        {sections.map((s) => (
          <section
            key={s.title}
            className="rounded-xl border border-border bg-surface p-4"
          >
            <h2 className="text-base font-bold text-ink">{s.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
