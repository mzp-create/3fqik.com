import { cookies } from "next/headers";
import { I18nProvider } from "@/lib/i18n";
import { OnboardingGate } from "@/components/OnboardingGate";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const langCookie = jar.get("lang")?.value;
  const lang = langCookie === "mm" ? "mm" : "en";
  return (
    <I18nProvider initial={lang}>
      <OnboardingGate
        hasLangCookie={langCookie === "en" || langCookie === "mm"}
      >
        {children}
      </OnboardingGate>
    </I18nProvider>
  );
}
