"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useT } from "@/lib/i18n";
import { mmk, signedMmk, pickLabel } from "@/lib/client/format";

export type TicketRow = {
  ticketNo: string;
  side: "fav" | "dog";
  stakeMmk: number;
  status: string;
  scoreHomeAtBet: number;
  scoreAwayAtBet: number;
  placedAt: string;
  netMmk: number | null;
  qrUrl: string;
  match: { homeTeam: string; awayTeam: string; stage: string };
  line: { favSide: "home" | "away"; ballQ: number; priceC: number };
  playerName: string;
};

const STATUS_LABEL: Record<string, keyof ReturnType<typeof useT>["t"]> = {
  pending: "stPending",
  won: "stWon",
  half_won: "stHalfWon",
  push: "stPush",
  half_lost: "stHalfLost",
  lost: "stLost",
  void: "stVoid",
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

export function TicketCard({ ticket: b }: { ticket: TicketRow }) {
  const { t } = useT();
  const [qr, setQr] = useState("");
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(b.qrUrl, { width: 160 })
      .then(setQr)
      .catch(() => setQrError(true));
  }, [b.qrUrl]);

  async function save() {
    const qrData = qr || (await QRCode.toDataURL(b.qrUrl, { width: 160 }));
    const hasNet = b.netMmk != null;
    const canvasHeight = hasNet ? 590 : 560;
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 360, canvasHeight);
    ctx.fillStyle = "#000";
    ctx.font = "bold 22px monospace";
    ctx.textAlign = "center";
    ctx.fillText(b.ticketNo, 180, 40);
    ctx.font = "15px sans-serif";
    ctx.textAlign = "left";
    const rows: [string, string][] = [
      [t.player, b.playerName],
      [t.match, `${b.match.homeTeam} vs ${b.match.awayTeam}`],
      [t.pick, pickLabel(b.line, b.match, b.side)],
      [t.stake, `${mmk(b.stakeMmk)} MMK`],
      [t.scoreAtBet, `${b.scoreHomeAtBet}–${b.scoreAwayAtBet}`],
      [t.placed, formatMmt(b.placedAt)],
      [t.statusLbl, t[STATUS_LABEL[b.status] ?? "stPending"]],
    ];
    if (hasNet) {
      rows.push([t.net, `${signedMmk(b.netMmk!)} MMK`]);
    }
    rows.forEach(([k, v], idx) => {
      ctx.fillStyle = "#777";
      ctx.fillText(k, 24, 90 + idx * 30);
      ctx.fillStyle = "#000";
      ctx.fillText(v, 140, 90 + idx * 30);
    });
    const qrTop = 90 + rows.length * 30 + 10;
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
  }

  return (
    <div>
      <div className="rounded-xl border-2 border-dashed border-gray-500 p-4 text-center">
        <p className="text-xs text-gray-400">
          WORLDBET2026 · {t.ticket.toUpperCase()}
        </p>
        <p className="text-2xl font-bold tracking-widest">{b.ticketNo}</p>
        <hr className="my-2" />
        <dl className="text-left text-sm leading-7">
          <Row k={t.player} v={b.playerName} />
          <Row
            k={t.match}
            v={`${b.match.homeTeam} vs ${b.match.awayTeam} (${b.match.stage})`}
          />
          <Row k={t.pick} v={pickLabel(b.line, b.match, b.side)} />
          <Row k={t.stake} v={`${mmk(b.stakeMmk)} MMK`} />
          <Row k={t.scoreAtBet} v={`${b.scoreHomeAtBet}–${b.scoreAwayAtBet}`} />
          <Row k={t.placed} v={formatMmt(b.placedAt)} />
          <Row k={t.statusLbl} v={t[STATUS_LABEL[b.status] ?? "stPending"]} />
          {b.netMmk != null && (
            <Row k={t.net} v={`${signedMmk(b.netMmk)} MMK`} />
          )}
        </dl>
        {!qrError && qr && (
          <img src={qr} alt="QR" className="mx-auto mt-2 h-40 w-40" />
        )}
        <p className="text-xs text-gray-400">{t.scanToVerify}</p>
      </div>
      <button
        className="mt-2 w-full rounded-xl bg-gray-800 p-3 font-semibold text-white"
        onClick={save}
      >
        💾 {t.saveTicket}
      </button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
