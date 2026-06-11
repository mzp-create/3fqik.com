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
      setPinError(t.pinFormat);
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
      {/* Section header */}
      <div className="mb-6 flex items-center gap-2">
        <div
          className="triband-skew"
          style={{ height: "14px", width: "4px" }}
        />
        <h1 className="text-xl font-bold text-ink">{t.changePin}</h1>
      </div>

      <div className="mb-6 flex flex-col gap-3">
        <input
          className="rounded-lg border border-ink/20 bg-white p-4 text-lg tracking-widest text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder={t.currentPin}
          value={currentPin}
          onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
        />
        <input
          className="rounded-lg border border-ink/20 bg-white p-4 text-lg tracking-widest text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder={t.newPin}
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
        />
        <input
          className="rounded-lg border border-ink/20 bg-white p-4 text-lg tracking-widest text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder={t.pinConfirm}
          value={newPin2}
          onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, ""))}
        />
        {pinError && <p className="text-center text-sm text-ca">{pinError}</p>}
        {pinSuccess && (
          <p className="text-center text-sm text-mx">{t.changePin} ✓</p>
        )}
        <button
          className="rounded-lg bg-ink p-4 text-lg font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
          onClick={handleChangePin}
        >
          {t.changePin}
        </button>
      </div>

      <hr className="my-6 border-ink/10" />

      <div className="mb-6">
        <p className="mb-3 font-semibold text-ink">{t.language}</p>
        <div className="flex gap-3">
          <button
            className={`flex-1 rounded-lg border p-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us ${
              lang === "en"
                ? "border-mx bg-mx/10 text-mx"
                : "border-ink/20 text-ink/50"
            }`}
            onClick={() => handleLanguage("en")}
          >
            English
          </button>
          <button
            className={`flex-1 rounded-lg border p-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us ${
              lang === "mm"
                ? "border-mx bg-mx/10 text-mx"
                : "border-ink/20 text-ink/50"
            }`}
            onClick={() => handleLanguage("mm")}
          >
            မြန်မာ
          </button>
        </div>
      </div>

      <hr className="my-6 border-ink/10" />

      <button
        className="w-full rounded-lg bg-ca p-4 text-lg font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us disabled:opacity-50"
        onClick={handleLogout}
        disabled={loggingOut}
      >
        {t.logout}
      </button>
    </main>
  );
}
