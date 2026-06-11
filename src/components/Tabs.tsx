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
    <nav className="fixed bottom-0 left-0 right-0 mx-auto flex max-w-md border-t bg-white">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`flex-1 p-4 text-center font-medium ${path === tab.href ? "text-green-700" : "text-gray-500"}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
