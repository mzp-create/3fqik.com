import { redirect } from "next/navigation";
import { currentPlayer } from "@/lib/auth/session";
import { I18nProvider } from "@/lib/i18n";
import { Tabs } from "@/components/Tabs";

export default async function PlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await currentPlayer();
  if (!me) redirect("/login");
  if (me.mustChangePin) redirect("/profile");
  return (
    <I18nProvider initial={me.language}>
      <div className="mx-auto max-w-md pb-20">{children}</div>
      <Tabs isAdmin={me.role === "admin"} />
    </I18nProvider>
  );
}
