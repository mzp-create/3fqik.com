export default function InviteOnlyPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 bg-canvas p-6">
      {/* App name hero (same as login) */}
      <div className="text-center">
        <p className="text-base font-semibold uppercase tracking-widest text-faint">
          FIFA World Cup
        </p>
        <h1 className="text-5xl font-bold text-ink">
          WorldBet<span className="font-display text-6xl">26</span>
        </h1>
        <div className="triband-skew mx-auto mt-2 w-32" />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <p className="text-lg font-semibold text-ink">
          This app is invite-only. Ask an admin for an invite link to join.
        </p>
        <p className="mt-3 text-lg text-muted">
          ဤအက်ပ်သည် ဖိတ်ကြားထားသူများသာ ဝင်ရောက်နိုင်သည်။ ပါဝင်ရန် အက်မင်ထံမှ
          ဖိတ်ကြားလင့်ခ်တောင်းပါ။
        </p>
      </div>

      <a
        href="/login"
        className="rounded-lg bg-mx p-5 text-center text-xl font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us"
      >
        Log in / ဝင်မည်
      </a>
    </main>
  );
}
