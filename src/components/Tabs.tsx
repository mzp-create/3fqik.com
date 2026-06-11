"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";

export function Tabs({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useT();
  const path = usePathname();
  const tabs = [
    { href: "/", label: t.tabMatches },
    { href: "/bets", label: t.tabBets },
    { href: "/balance", label: t.tabBalance },
    { href: "/profile", label: "⚙︎" },
    ...(isAdmin ? [{ href: "/admin", label: "🛠️" }] : []),
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 mx-auto flex max-w-md border-t border-ink/10 bg-white">
      {tabs.map((tab) => {
        const active = path === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex-1 whitespace-nowrap px-2 py-4 text-center text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us ${
              active ? "text-ink" : "text-gray-400"
            }`}
          >
            {tab.label}
            {active && (
              <span
                className="triband absolute bottom-0 left-1/2 -translate-x-1/2"
                style={{ width: "80%", height: "3px" }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
