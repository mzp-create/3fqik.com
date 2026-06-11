import { redirect } from "next/navigation";
import Link from "next/link";
import { currentPlayer } from "@/lib/auth/session";
import { I18nProvider } from "@/lib/i18n";

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
    ["/admin/players", "Players"],
    ["/admin/settings", "Settings"],
  ];
  return (
    <I18nProvider initial={me.language}>
      <nav className="relative flex gap-3 overflow-x-auto bg-ink p-3 text-sm font-semibold">
        {nav.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="text-white/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
          >
            {label}
          </Link>
        ))}
        {/* Triband bottom border */}
        <div className="triband absolute bottom-0 left-0 right-0" />
      </nav>
      <div className="mx-auto max-w-md p-3">{children}</div>
    </I18nProvider>
  );
}
