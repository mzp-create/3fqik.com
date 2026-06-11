"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { useT, I18nProvider } from "@/lib/i18n";
import { errMsg } from "@/lib/client/errMsg";

function LoginForm() {
  const { t } = useT();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    try {
      const me = await api<{ role: string; mustChangePin: boolean }>(
        "/api/auth/login",
        {
          phone,
          pin,
        },
      );
      router.push(
        me.mustChangePin ? "/profile" : me.role === "admin" ? "/admin" : "/",
      );
    } catch (e) {
      setError(errMsg(t, e));
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 bg-canvas p-6">
      {/* App name hero */}
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-ink/50">
          FIFA World Cup
        </p>
        <h1 className="text-4xl font-bold text-ink">
          WorldBet<span className="font-display text-5xl">26</span>
        </h1>
        <div className="triband-skew mx-auto mt-2 w-32" />
      </div>

      <input
        className="rounded-lg border border-ink/20 bg-white p-4 text-lg text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        inputMode="tel"
        placeholder={t.phone}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <input
        className="rounded-lg border border-ink/20 bg-white p-4 text-lg tracking-widest text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        inputMode="numeric"
        maxLength={6}
        type="password"
        placeholder={t.pin}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
      />
      {error && <p className="text-center text-sm text-ca">{error}</p>}
      <button
        className="rounded-lg bg-ink p-4 text-lg font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
        onClick={submit}
      >
        {t.login}
      </button>
      <a className="text-center text-sm text-us underline" href="/register">
        {t.register}
      </a>
    </main>
  );
}

export default function LoginPage() {
  return (
    <I18nProvider initial="en">
      <LoginForm />
    </I18nProvider>
  );
}
