import { redirect } from "next/navigation";
import { currentPlayer } from "@/lib/auth/session";
import { I18nProvider } from "@/lib/i18n";
import { Tabs } from "@/components/Tabs";
import { InstallBanner } from "@/components/InstallBanner";
import { AppBar } from "@/components/AppBar";

export default async function PlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await currentPlayer();
  if (!me) redirect("/login");
  return (
    <I18nProvider initial={me.language}>
      <div className="mx-auto w-full max-w-md pb-20">
        <AppBar isAdmin={me.role === "admin"} name={me.displayName} />
        {children}
      </div>
      <Tabs />
      <InstallBanner />
    </I18nProvider>
  );
}
