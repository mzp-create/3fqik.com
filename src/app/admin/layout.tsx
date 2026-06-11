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
      <nav className="flex gap-3 overflow-x-auto border-b bg-amber-50 p-3 text-sm font-semibold">
        {nav.map(([href, label]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="mx-auto max-w-md p-3">{children}</div>
    </I18nProvider>
  );
}
