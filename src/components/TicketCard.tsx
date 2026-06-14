"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useT } from "@/lib/i18n";
import { mmk, signedMmk, pickLabel } from "@/lib/client/format";
import { statusKey } from "@/lib/client/status";

export type TicketRow = {
  ticketNo: string;
  side: "fav" | "dog" | "over" | "under";
  stakeMmk: number;
  status: string;
  scoreHomeAtBet: number;
  scoreAwayAtBet: number;
  placedAt: string;
  netMmk: number | null;
  feeMmk: number | null;
  qrUrl: string;
  match: { homeTeam: string; awayTeam: string; stage: string };
  line: {
    favSide: "home" | "away";
    ballQ: number;
    priceC: number;
    market?: "ah" | "ou";
  };
  playerName: string;
};

function formatMmt(isoStr: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoStr));
}

/** Stamp color based on ticket status */
function stampClasses(status: string): string {
  if (status === "won" || status === "half_won") {
    return "border-mx text-mx";
  }
  if (status === "lost" || status === "half_lost") {
    return "border-ca text-ca";
  }
  return "border-gray-400 text-gray-400";
}

/** Stamp label — shown only for graded tickets */
function stampLabel(status: string): string | null {
  if (status === "won") return "WON";
  if (status === "half_won") return "½ WON";
  if (status === "lost") return "LOST";
  if (status === "half_lost") return "½ LOST";
  if (status === "push") return "PUSH";
  if (status === "void") return "VOID";
  return null;
}

export function TicketCard({ ticket: b }: { ticket: TicketRow }) {
  const { t } = useT();
  const [qr, setQr] = useState("");
  const [qrError, setQrError] = useState(false);
  const stamp = stampLabel(b.status);
  const ouLabels = { over: t.over, under: t.under };

  useEffect(() => {
    QRCode.toDataURL(b.qrUrl, { width: 160 })
      .then(setQr)
      .catch(() => setQrError(true));
  }, [b.qrUrl]);

  async function save() {
    try {
      const qrData = qr || (await QRCode.toDataURL(b.qrUrl, { width: 160 }));
      const hasNet = b.netMmk != null;
      const fee = b.feeMmk ?? 0;
      const hasFee = hasNet && fee !== 0;
      // Each extra fee+effectiveNet line adds 36px; base 620, +40 for net, +72 for fee lines
      const canvasHeight = hasNet ? (hasFee ? 732 : 660) : 620;
      const canvas = document.createElement("canvas");
      canvas.width = 360;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 360, canvasHeight);
      ctx.fillStyle = "#000";
      // Ticket number larger/bolder for PNG (~20% bump from 28px)
      ctx.font = "bold 34px monospace";
      ctx.textAlign = "center";
      ctx.fillText(b.ticketNo, 180, 50);
      ctx.font = "18px sans-serif";
      ctx.textAlign = "left";
      const rows: [string, string][] = [
        [t.player, b.playerName],
        [t.match, `${b.match.homeTeam} vs ${b.match.awayTeam}`],
        [t.pick, pickLabel(b.line, b.match, b.side, ouLabels)],
        [t.stake, `${mmk(b.stakeMmk)} MMK`],
        [t.scoreAtBet, `${b.scoreHomeAtBet}–${b.scoreAwayAtBet}`],
        [t.placed, formatMmt(b.placedAt)],
        [t.statusLbl, t[statusKey(b.status)]],
      ];
      if (hasNet) {
        if (hasFee) {
          // gross net (before fee)
          rows.push([t.net, `${signedMmk(b.netMmk!)} MMK`]);
          // fee line
          const feeLabel = fee < 0 ? t.commission : t.discount;
          const feeDisplay =
            fee < 0 ? `−${mmk(Math.abs(fee))} MMK` : `+${mmk(fee)} MMK`;
          rows.push([feeLabel, feeDisplay]);
          // effective net (after fee) — headline
          const effectiveNet = b.netMmk! + fee;
          rows.push([
            `${t.net} (${feeLabel})`,
            `${signedMmk(effectiveNet)} MMK`,
          ]);
        } else {
          rows.push([t.net, `${signedMmk(b.netMmk!)} MMK`]);
        }
      }
      rows.forEach(([k, v], idx) => {
        ctx.fillStyle = "#777";
        ctx.fillText(k, 24, 100 + idx * 36);
        ctx.fillStyle = "#000";
        ctx.fillText(v, 140, 100 + idx * 36);
      });
      const qrTop = 100 + rows.length * 36 + 10;
      const img = new Image();
      await new Promise((res) => {
        img.onload = res;
        img.src = qrData;
      });
      ctx.drawImage(img, 100, qrTop, 160, 160);
      const a = document.createElement("a");
      a.download = `${b.ticketNo}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    } catch {
      // save failed silently — QR or canvas unavailable
    }
  }

  return (
    <div>
      {/* Event-ticket card */}
      <div className="relative overflow-hidden rounded-xl border border-dashed border-ink/30 bg-white">
        {/* Triband top bar */}
        <div className="triband w-full" />

        {/* Stamp overlay for graded tickets */}
        {stamp && (
          <div
            className={`absolute right-3 top-6 rotate-[-8deg] rounded border-2 px-3 py-1.5 font-display text-base uppercase opacity-80 ${stampClasses(b.status)}`}
          >
            {stamp}
          </div>
        )}

        <div className="p-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-ink/40">
            WORLDBET<span className="font-display">26</span> ·{" "}
            {t.ticket.toUpperCase()}
          </p>
          <p className="font-display mt-1 text-4xl tracking-wider text-ink">
            {b.ticketNo}
          </p>
          <hr className="my-3 border-dashed border-ink/20" />
          <dl className="text-left text-base leading-loose">
            <Row k={t.player} v={b.playerName} />
            <Row
              k={t.match}
              v={`${b.match.homeTeam} vs ${b.match.awayTeam} (${b.match.stage})`}
            />
            <Row k={t.pick} v={pickLabel(b.line, b.match, b.side, ouLabels)} />
            <Row k={t.stake} v={`${mmk(b.stakeMmk)} MMK`} />
            <Row
              k={t.scoreAtBet}
              v={`${b.scoreHomeAtBet}–${b.scoreAwayAtBet}`}
            />
            <Row k={t.placed} v={formatMmt(b.placedAt)} />
            <Row k={t.statusLbl} v={t[statusKey(b.status)]} />
            {b.netMmk != null &&
              (() => {
                const fee = b.feeMmk ?? 0;
                const hasFee = fee !== 0;
                const effectiveNet = b.netMmk + fee;
                return (
                  <>
                    {hasFee && (
                      <Row k={t.net} v={`${signedMmk(b.netMmk)} MMK`} />
                    )}
                    {hasFee && (
                      <Row
                        k={fee < 0 ? t.commission : t.discount}
                        v={
                          fee < 0
                            ? `−${mmk(Math.abs(fee))} MMK`
                            : `+${mmk(fee)} MMK`
                        }
                      />
                    )}
                    <Row
                      k={
                        hasFee
                          ? `${t.net} (${fee < 0 ? t.commission : t.discount})`
                          : t.net
                      }
                      v={`${signedMmk(hasFee ? effectiveNet : b.netMmk)} MMK`}
                    />
                  </>
                );
              })()}
          </dl>
          {!qrError && qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt="QR"
              className="mx-auto mt-3 h-[180px] w-[180px]"
            />
          )}
          <p className="mt-2 text-sm text-ink/40">{t.scanToVerify}</p>
        </div>
      </div>

      <button
        className="mt-2 w-full rounded-lg bg-ink p-4 text-base font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-us disabled:opacity-40"
        onClick={save}
        disabled={qrError}
      >
        💾 {t.saveTicket}
      </button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink/50">{k}</dt>
      <dd className="font-medium text-ink">{v}</dd>
    </div>
  );
}
