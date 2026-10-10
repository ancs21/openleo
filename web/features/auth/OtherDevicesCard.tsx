// Open OpenLeo on your own devices over Tailscale; shown only to this computer's owner.
import { useEffect, useState } from "react";
import { encode } from "uqr";
import { Switch } from "../../components/Switch";
import { api, json } from "../../lib/api";

type Remote = { manage: boolean; installed?: boolean; running?: boolean; address?: string; https?: boolean; shared?: boolean };

const TAILSCALE_DOWNLOAD = "https://tailscale.com/download";
const HTTPS_SETTINGS = "https://login.tailscale.com/admin/dns";
const link = "text-accent-ink underline underline-offset-2";

/** The address as a QR code to scan with a phone: dark on white, which cameras read in either theme. */
function QrCode({ text }: { text: string }) {
  const { data, size } = encode(text, { border: 2 });
  const d = data.flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : ""))).join("");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto mt-2.5 size-36 rounded-control bg-white" shapeRendering="crispEdges" role="img" aria-label={`QR code for ${text}`}>
      <path d={d} fill="black" />
    </svg>
  );
}

export function OtherDevicesCard() {
  const [remote, setRemote] = useState<Remote>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = () => api<Remote>("/api/remote").then(setRemote, () => {});
  useEffect(() => { void load(); }, []);

  if (!remote?.manage) return null;
  const toggle = async () => {
    setBusy(true); setError(undefined);
    try { setRemote(await api<Remote>("/api/remote", json({ on: !remote.shared }))); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  // With the switch shown, the whole title row is its label: a click anywhere on it toggles.
  const canToggle = !!(remote.running && remote.https);
  const Row = canToggle ? "label" : "div";
  return (
    <div className="rounded-card bg-surface p-3 shadow-card">
      <Row className={`flex items-center justify-between gap-3 ${canToggle ? (busy ? "cursor-wait" : "cursor-pointer") : ""}`}>
        <span className="text-[13px] font-semibold">Open on your other devices</span>
        {canToggle && <Switch checked={!!remote.shared} onChange={() => void toggle()} disabled={busy} label="Open on your other devices" />}
      </Row>
      <p className="mt-1 text-[12.5px] leading-snug text-ink-2">
        {!remote.installed ? <>Install <a className={link} href={TAILSCALE_DOWNLOAD} target="_blank" rel="noopener">Tailscale</a> on this computer and your phone, and sign in to both with the same account. Only your devices can reach OpenLeo.</>
          : !remote.running ? <>Open Tailscale on this computer and sign in, then <button type="button" className={link} onClick={() => void load()}>check again</button>.</>
          : !remote.https ? <>First turn on <b>HTTPS Certificates</b> in <a className={link} href={HTTPS_SETTINGS} target="_blank" rel="noopener">Tailscale's DNS settings</a>, then <button type="button" className={link} onClick={() => void load()}>check again</button>.</>
          : remote.shared ? <>On your phone or laptop with Tailscale, scan the code or open <a className={`${link} break-all`} href={remote.address} target="_blank" rel="noopener">{remote.address}</a>. Your own devices come straight in. Keep this computer awake.</>
          : "Use OpenLeo on your phone or laptop, wherever you are, through Tailscale. Only your devices can reach it."}
      </p>
      {remote.shared && remote.address && <QrCode text={remote.address} />}
      {error && <p role="alert" className="mt-2 rounded-control bg-red-tint px-2.5 py-2 text-[12px] break-words text-red">{error}</p>}
    </div>
  );
}
