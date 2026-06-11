"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { useT, I18nProvider } from "@/lib/i18n";

function RegisterForm() {
  const { t } = useT();
  const router = useRouter();
  const [form, setForm] = useState({
    code: "",
    phone: "",
    name: "",
    pin: "",
    pin2: "",
  });
  const [error, setError] = useState("");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({
      ...f,
      [k]:
        k === "pin" || k === "pin2"
          ? e.target.value.replace(/\D/g, "")
          : e.target.value,
    }));

  async function submit() {
    if (form.pin !== form.pin2) {
      setError(`${t.pin} ≠ ${t.pinConfirm}`);
      return;
    }
    try {
      await api("/api/auth/register", {
        code: form.code,
        phone: form.phone,
        name: form.name,
        pin: form.pin,
      });
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 bg-canvas p-6">
      {/* App name hero (same as login) */}
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-ink/50">
          FIFA World Cup
        </p>
        <h1 className="text-3xl font-bold text-ink">
          WorldBet<span className="font-display text-4xl">26</span>
        </h1>
        <div className="triband-skew mx-auto mt-2 w-32" />
        <p className="mt-2 text-sm font-semibold text-ink/60">{t.register}</p>
      </div>

      <input
        className="rounded-lg border border-ink/20 bg-white p-4 text-lg text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        placeholder={t.inviteCode}
        value={form.code}
        onChange={set("code")}
      />
      <input
        className="rounded-lg border border-ink/20 bg-white p-4 text-lg text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        inputMode="tel"
        placeholder={t.phone}
        value={form.phone}
        onChange={set("phone")}
      />
      <input
        className="rounded-lg border border-ink/20 bg-white p-4 text-lg text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        placeholder={t.displayName}
        value={form.name}
        onChange={set("name")}
      />
      <input
        className="rounded-lg border border-ink/20 bg-white p-4 text-lg tracking-widest text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        type="password"
        inputMode="numeric"
        maxLength={6}
        placeholder={t.pin}
        value={form.pin}
        onChange={set("pin")}
      />
      <input
        className="rounded-lg border border-ink/20 bg-white p-4 text-lg tracking-widest text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        type="password"
        inputMode="numeric"
        maxLength={6}
        placeholder={t.pinConfirm}
        value={form.pin2}
        onChange={set("pin2")}
      />
      {error && <p className="text-center text-sm text-ca">{error}</p>}
      <button
        className="rounded-lg bg-ink p-4 text-lg font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        onClick={submit}
      >
        {t.register}
      </button>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <I18nProvider initial="en">
      <RegisterForm />
    </I18nProvider>
  );
}
