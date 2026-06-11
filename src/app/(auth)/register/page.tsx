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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 p-6">
      <h1 className="text-center text-2xl font-bold">{t.register}</h1>
      <input
        className="rounded-xl border p-4 text-lg"
        placeholder={t.inviteCode}
        value={form.code}
        onChange={set("code")}
      />
      <input
        className="rounded-xl border p-4 text-lg"
        inputMode="tel"
        placeholder={t.phone}
        value={form.phone}
        onChange={set("phone")}
      />
      <input
        className="rounded-xl border p-4 text-lg"
        placeholder={t.displayName}
        value={form.name}
        onChange={set("name")}
      />
      <input
        className="rounded-xl border p-4 text-lg tracking-widest"
        type="password"
        inputMode="numeric"
        maxLength={6}
        placeholder={t.pin}
        value={form.pin}
        onChange={set("pin")}
      />
      <input
        className="rounded-xl border p-4 text-lg tracking-widest"
        type="password"
        inputMode="numeric"
        maxLength={6}
        placeholder={t.pinConfirm}
        value={form.pin2}
        onChange={set("pin2")}
      />
      {error && <p className="text-center text-red-600">{error}</p>}
      <button
        className="rounded-xl bg-green-700 p-4 text-lg font-bold text-white"
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
