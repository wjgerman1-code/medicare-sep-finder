import { describe, expect, it } from "vitest";
import { applySessionPersistence, canonicalRedirect, isPublicPath, safeNextPath } from "@/lib/routing";

describe("authentication gate", () => {
  it("only the login, auth callback and setup routes are public", () => {
    for (const p of ["/login", "/auth/callback", "/auth/signout", "/setup"]) expect(isPublicPath(p)).toBe(true);
    for (const p of ["/", "/activity", "/production", "/settings", "/api/export/summary", "/loginx", "/metrics"]) expect(isPublicPath(p)).toBe(false);
  });

  it("post-login redirects stay on this site", () => {
    expect(safeNextPath("/production?product=x")).toBe("/production?product=x");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });
});

describe("canonical domain portal.gracenguard.com", () => {
  const opts = { enforce: true, canonicalHost: "portal.gracenguard.com" };
  const url = { pathname: "/goals", search: "?campaign=aep-2026" };

  it("redirects other hosts to the portal, keeping path and query", () => {
    expect(canonicalRedirect("grace-guard.vercel.app", url, opts)).toBe("https://portal.gracenguard.com/goals?campaign=aep-2026");
    expect(canonicalRedirect("www.gracenguard.com", url, opts)).toBe("https://portal.gracenguard.com/goals?campaign=aep-2026");
  });

  it("leaves the portal itself, localhost and non-enforced environments alone", () => {
    expect(canonicalRedirect("portal.gracenguard.com", url, opts)).toBeNull();
    expect(canonicalRedirect("PORTAL.gracenguard.com", url, opts)).toBeNull();
    expect(canonicalRedirect("localhost:3000", url, opts)).toBeNull();
    expect(canonicalRedirect("127.0.0.1:3100", url, opts)).toBeNull();
    expect(canonicalRedirect("grace-guard.vercel.app", url, { ...opts, enforce: false })).toBeNull();
  });
});

describe("persistent session handling", () => {
  const opts = { path: "/", maxAge: 34_560_000, sameSite: "lax" as const };
  it("keeps Supabase's long-lived cookies when 'Keep me signed in' is on", () => {
    expect(applySessionPersistence(opts, true)).toEqual(opts);
  });
  it("turns them into browser-session cookies when it is off", () => {
    expect(applySessionPersistence({ ...opts, expires: new Date() }, false)).toEqual({ path: "/", sameSite: "lax" });
  });
});
