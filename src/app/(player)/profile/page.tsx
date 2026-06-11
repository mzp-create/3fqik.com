"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { errMsg } from "@/lib/client/errMsg";

export default function ProfilePage() {
  const { t, lang, setLang } = useT();
  const router = useRouter();

  // Change PIN form
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSuccess, setPinSuccess] = useState(false);

  // Logout
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleChangePin() {
    setPinError("");
    setPinSuccess(false);
    if (!/^\d{6}$/.test(newPin)) {
      setPinError(t.pin);
      return;
    }
    if (newPin !== newPin2) {
      setPinError(`${t.newPin} ≠ ${t.pinConfirm}`);
      return;
    }
    try {
      await api("/api/auth/change-pin", { currentPin, newPin });
      setPinSuccess(true);
      setCurrentPin("");
      setNewPin("");
      setNewPin2("");
    } catch (e) {
      setPinError(errMsg(t, e));
    }
  }

  async function handleLanguage(l: "en" | "mm") {
    setLang(l);
    try {
      await api("/api/me", { language: l });
    } catch {
      // best-effort; local state already updated
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await api("/api/auth/logout", {});
    } finally {
      router.push("/login");
    }
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-6 text-2xl font-bold">{t.changePin}</h1>

      <div className="mb-6 flex flex-col gap-3">
        <input
          className="rounded-xl border p-4 text-lg tracking-widest"
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder={t.currentPin}
          value={currentPin}
          onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
        />
        <input
          className="rounded-xl border p-4 text-lg tracking-widest"
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder={t.newPin}
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
        />
        <input
          className="rounded-xl border p-4 text-lg tracking-widest"
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder={t.pinConfirm}
          value={newPin2}
          onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, ""))}
        />
        {pinError && <p className="text-center text-red-600">{pinError}</p>}
        {pinSuccess && (
          <p className="text-center text-green-700">{t.changePin} ✓</p>
        )}
        <button
          className="rounded-xl bg-green-700 p-4 text-lg font-bold text-white"
          onClick={handleChangePin}
        >
          {t.changePin}
        </button>
      </div>

      <hr className="my-6" />

      <div className="mb-6">
        <p className="mb-3 font-semibold">{t.language}</p>
        <div className="flex gap-3">
          <button
            className={`flex-1 rounded-xl border p-3 font-semibold ${lang === "en" ? "border-green-700 bg-green-50 text-green-700" : "text-gray-500"}`}
            onClick={() => handleLanguage("en")}
          >
            English
          </button>
          <button
            className={`flex-1 rounded-xl border p-3 font-semibold ${lang === "mm" ? "border-green-700 bg-green-50 text-green-700" : "text-gray-500"}`}
            onClick={() => handleLanguage("mm")}
          >
            မြန်မာ
          </button>
        </div>
      </div>

      <hr className="my-6" />

      <button
        className="w-full rounded-xl bg-red-600 p-4 text-lg font-bold text-white"
        onClick={handleLogout}
        disabled={loggingOut}
      >
        {t.logout}
      </button>
    </main>
  );
}
