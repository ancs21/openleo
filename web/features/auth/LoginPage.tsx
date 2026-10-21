import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "../../components/Button";
import { Logo } from "../../components/Logo";
import { api, json } from "../../lib/api";
import { useWallpaper, wallpaperBackground } from "../../lib/useWallpaper";
import { WallpaperCredit } from "../../components/WallpaperCredit";
import { ChatGPTButton } from "./ChatGPTButton";

export function LoginPage() {
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/";
  const [error, setError] = useState(params.get("error") ?? undefined);
  const [busy, setBusy] = useState(false);
  const [remembered, setRemembered] = useState<string>();
  const wallpaper = useWallpaper();

  useEffect(() => {
    // Sign-in returns to OpenLeo's public address and cookies are per host, so sign in there.
    api<{ origin: string; origins?: string[] }>("/api/auth/config").then(({ origin, origins = [origin] }) => {
      if (!origins.includes(location.origin)) return location.replace(origin + location.pathname + location.search);
      api<{ email?: string }>("/api/me").then(() => location.replace(next), () => {});
      api<{ email?: string }>("/api/auth/remembered").then(({ email }) => setRemembered(email), () => {});
    }, () => {});
  }, [next]);

  // `again`: as the account this browser used last; otherwise OpenAI asks which account.
  const signIn = async (again: boolean) => {
    setBusy(true); setError(undefined);
    try {
      const { url } = await api<{ url: string }>("/api/auth/chatgpt/login", json({ next, remembered: again }));
      location.assign(url);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <main className="relative h-full transition-[background] duration-500" style={{ background: wallpaperBackground(wallpaper) }}>
      <div className="absolute inset-3 flex flex-col overflow-y-auto rounded-[14px] bg-surface/75 shadow-overlay backdrop-blur-2xl">
        <div className="m-auto w-full max-w-[400px] px-6 py-10 animate-fade-up">
          <Logo follow className="size-9" />
          <h1 className="mt-6 text-[26px] font-medium tracking-tight text-ink">Welcome to OpenLeo</h1>

          <ChatGPTButton className="mt-7 h-10 w-full text-[14px]" busy={busy} onClick={() => void signIn(!!remembered)}>
            {remembered ? <span className="truncate">Continue as {remembered}</span> : undefined}
          </ChatGPTButton>
          {error && <p role="alert" className="mt-3 rounded-control bg-red-tint px-3 py-2 text-[12.5px] break-words text-red">{error}</p>}
          {remembered && (
            <Button className="mt-2 h-10 w-full text-[14px]" disabled={busy} onClick={() => void signIn(false)}>Use another account</Button>
          )}

          <p className="mt-4 text-[13px] leading-relaxed text-ink-2">New here? Continuing sets up your own OpenLeo automatically.</p>
        </div>
        <p className="shrink-0 px-6 pb-5 text-center text-[12.5px] text-ink-2">
          Your agents run on your ChatGPT plan. OpenLeo keeps your data on this computer.
        </p>
        <WallpaperCredit onPanel photo={wallpaper.photo} className="absolute right-4 bottom-5 max-sm:hidden" />
      </div>
    </main>
  );
}
