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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 p-6">
      <h1 className="text-center text-3xl font-bold">⚽ {t.appName}</h1>
      <input
        className="rounded-xl border p-4 text-lg"
        inputMode="tel"
        placeholder={t.phone}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <input
        className="rounded-xl border p-4 text-lg tracking-widest"
        inputMode="numeric"
        maxLength={6}
        type="password"
        placeholder={t.pin}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
      />
      {error && <p className="text-center text-red-600">{error}</p>}
      <button
        className="rounded-xl bg-green-700 p-4 text-lg font-bold text-white"
        onClick={submit}
      >
        {t.login}
      </button>
      <a className="text-center text-blue-600 underline" href="/register">
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
