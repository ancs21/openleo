import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Outlet } from "react-router";
import { PlanDialogs } from "../features/auth/PlanDialogs";
import { ComputerSetup } from "../features/setup/ComputerSetup";
import { useApp } from "../stores/app-store";

export function RootLayout() {
  const notice = useApp((s) => s.notice);
  const setNotice = useApp((s) => s.setNotice);
  const [signedIn, setSignedIn] = useState(false); // api() sends signed-out visitors to /login
  useEffect(() => {
    api("/api/me").then(() => { setSignedIn(true); void useApp.getState().init(); }, () => {});
    // Background tabs throttle timers, so re-check sign-in when the user comes back.
    const onFocus = () => void useApp.getState().loadChatGPT().catch(() => {});
    addEventListener("focus", onFocus);
    return () => removeEventListener("focus", onFocus);
  }, []);
  if (!signedIn) return null;
  return (
    <>
      <Outlet />
      <PlanDialogs />
      <ComputerSetup />
      {notice && (
        <div role="status" className="fixed bottom-4 left-1/2 z-[90] flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-4 py-2 text-[12.5px] text-surface shadow-overlay animate-fade-up">
          <span className="min-w-0 truncate">{notice}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(undefined)} className="text-surface/70 hover:text-surface">✕</button>
        </div>
      )}
    </>
  );
}
