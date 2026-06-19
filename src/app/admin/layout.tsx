import { redirect } from "next/navigation";
import Link from "next/link";
import { currentPlayer } from "@/lib/auth/session";
import { I18nProvider } from "@/lib/i18n";
import { LogoutButton } from "@/components/LogoutButton";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await currentPlayer();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");
  const nav = [
    ["/admin", "Overview"],
    ["/admin/lines", "Lines"],
    ["/admin/scores", "Scores"],
    ["/admin/settle", "Settle"],
    ["/admin/bets", "Bets"],
    ["/admin/audit", "Audit"],
    ["/admin/players", "Players"],
    ["/admin/settings", "Settings"],
    ["/admin/reports", "Reports"],
  ];
  return (
    <I18nProvider initial={me.language}>
      <div className="admin-light min-h-screen">
        <header className="relative bg-ink text-sm font-semibold">
          <div className="flex items-center justify-between px-3 pt-2">
            <span className="font-display tracking-wider text-white">
              WB26 ADMIN
            </span>
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-white/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
              >
                ⚽ App
              </Link>
              <LogoutButton className="text-white/80 hover:text-white" />
            </div>
          </div>
          <nav className="flex gap-3 overflow-x-auto p-3">
            {nav.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="text-white/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
              >
                {label}
              </Link>
            ))}
          </nav>
          {/* Triband bottom border */}
          <div className="triband absolute bottom-0 left-0 right-0" />
        </header>
        <div className="mx-auto w-full max-w-md p-3">{children}</div>
      </div>
    </I18nProvider>
  );
}
