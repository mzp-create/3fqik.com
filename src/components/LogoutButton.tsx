"use client";

export function LogoutButton({ className = "" }: { className?: string }) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <button
      className={`font-semibold focus-visible:ring-us focus-visible:outline-none focus-visible:ring-2 ${className}`}
      onClick={logout}
    >
      Logout
    </button>
  );
}
