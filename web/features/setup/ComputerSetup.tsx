// Sets up the agents' computer: Apple's container tool where it runs, Docker otherwise.
// OpenLeo does every step it can; installing the tool is the one step people do, then press Check again.
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "../../components/Button";
import { Icon, glyphs } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { Spinner } from "../../components/motion";
import { api } from "../../lib/api";
import { useApp } from "../../stores/app-store";
import { useBoard } from "../board/store";

type Status = {
  manage: boolean; ready: boolean; runtime: "apple" | "local" | "cloud"; platform?: string;
  native?: boolean;
  apple?: { installed: boolean; running: boolean; image: boolean };
  docker?: { installed: boolean; running: boolean; windows?: boolean; image: boolean };
  job?: { step: "start" | "build"; log: string[]; done: boolean; error?: string };
};

const APPLE_DOWNLOAD = "https://github.com/apple/container/releases/latest";
const DOCKER_DOWNLOAD = "https://www.docker.com/products/docker-desktop/";
const WORKING = { start: "Turning it on…", build: "Setting up the computer… This takes a few minutes." };

export function ComputerSetup() {
  const { setupOpen, setSetup } = useApp();
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState<string>();

  const check = () => api<Status>("/api/setup").then((s) => {
    setStatus(s);
    setSetup({ setupNeeded: s.manage && !s.ready });
    return s;
  }, (e) => void setError((e as Error).message));

  // No computer on this machine yet, so nothing an agent does will work: say so right away.
  useEffect(() => { void check().then((s) => { if (s?.manage && !s.ready) setSetup({ setupOpen: true }); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // While open: follow a running step closely, and notice an install or Docker starting.
  const working = !!status?.job && !status.job.done;
  useEffect(() => {
    if (!setupOpen) return;
    void check();
    const t = setInterval(() => void check(), working ? 1500 : 4000);
    return () => clearInterval(t);
  }, [setupOpen, working]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ready now: start the open board's computer (the server already started them; this shows it).
  useEffect(() => { if (status?.ready) void useBoard.getState().load().catch(() => {}); }, [status?.ready]);

  const run = async (step: string) => {
    setError(undefined);
    try { setStatus(await api<Status>(`/api/setup/${step}`, { method: "POST" })); } catch (e) { setError((e as Error).message); }
  };

  if (!status?.manage) return null;
  const { apple, docker, native, job } = status;
  const here = status.platform === "darwin" ? "your Mac" : "this computer";
  const linux = status.platform === "linux";
  const close = () => setSetup({ setupOpen: false });
  return (
    <Modal open={setupOpen} onClose={close} title={status.ready ? "Your agents' computer is ready" : "Give your agents a computer"}
      className="w-[min(500px,calc(100vw-32px))] text-left"
      actions={<>
        {!status.ready && <Button type="button" onClick={() => void run("check")} disabled={working}>Check again</Button>}
        <Button value="close" variant={status.ready ? "primary" : "secondary"}>{status.ready ? "Done" : "Later"}</Button>
      </>}>
      {status.ready ? (
        <p>Agents can now browse, use files and run code on their own computer. Open <b>Computer</b> on a board to watch them.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p>Agents work on their own computer, a private Linux desktop on {here}. Set it up once.</p>
          {native && apple && (
            <Choice title="Apple's container tool" note="Recommended: built for your Mac, fast and light.">
              <Step done={apple.installed} label="Install it" hint="Open the downloaded installer, then press Check again.">
                <a className="text-accent-ink underline underline-offset-2" href={APPLE_DOWNLOAD} target="_blank" rel="noopener">Download</a>
              </Step>
              <Step done={apple.running} label="Turn it on">
                <Button type="button" onClick={() => void run("start")} disabled={!apple.installed || working}>Turn on</Button>
              </Step>
              <Step done={apple.image} label="Set up the computer" hint="A few minutes: it downloads a Linux desktop with Chrome.">
                <Button type="button" variant="primary" onClick={() => void run("build")} disabled={!apple.running || working}>Set up</Button>
              </Step>
            </Choice>
          )}
          {docker && (
            <Choice title={native ? "Or use Docker Desktop" : "Docker Desktop"} note={native ? undefined : `Docker runs the agents' computer on ${here}.`}>
              <Step done={docker.installed} label="Install it" hint={linux ? "Docker Desktop or Docker Engine both work. Then press Check again." : "Open the downloaded app once, then press Check again."}>
                <a className="text-accent-ink underline underline-offset-2" href={DOCKER_DOWNLOAD} target="_blank" rel="noopener">Download</a>
              </Step>
              <Step done={docker.running} label="Start it" hint={docker.windows ? "Docker is set to Windows containers. The computer needs Linux containers." : linux ? "With Docker Engine, run sudo systemctl start docker, then press Check again." : undefined}>
                <Button type="button" onClick={() => void run("docker")} disabled={!docker.installed || working}>{docker.windows ? "Switch to Linux" : linux ? "Start Docker" : "Open Docker"}</Button>
              </Step>
              <Step done={docker.image} label="Set up the computer" hint="A few minutes: it downloads a Linux desktop with Chrome.">
                <Button type="button" variant={native ? "secondary" : "primary"} onClick={() => void run("build-docker")} disabled={!docker.running || working}>Set up</Button>
              </Step>
            </Choice>
          )}
          {job && !job.done && (
            <div className="flex flex-col gap-1.5 rounded-control bg-inset p-2.5">
              <span className="flex items-center gap-2 text-ink"><Spinner />{WORKING[job.step]}</span>
              {job.log.at(-1) && <code className="truncate font-mono text-[11.5px] text-ink-3">{job.log.at(-1)}</code>}
            </div>
          )}
          {(job?.error || error) && <p role="alert" className="rounded-control bg-red-tint px-2.5 py-2 text-[12.5px] break-words text-red">That didn't work: {job?.error ?? error}</p>}
        </div>
      )}
    </Modal>
  );
}

function Choice({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-card border border-line p-3">
      <div>
        <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
        {note && <p className="text-[12.5px] text-ink-3">{note}</p>}
      </div>
      <ol className="flex flex-col gap-2">{children}</ol>
    </section>
  );
}

function Step({ done, label, hint, children }: { done: boolean; label: string; hint?: string; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className={`flex size-5 shrink-0 items-center justify-center rounded-full ${done ? "bg-green text-white" : "border border-line-strong"}`}>
        {done && <Icon size={11} strokeWidth={2.6}>{glyphs.check}</Icon>}
      </span>
      <div className="min-w-0 flex-1">
        <span className={done ? "text-ink-3" : "text-ink"}>{label}</span>
        {!done && hint && <p className="text-[12px] text-ink-3">{hint}</p>}
      </div>
      {!done && children}
    </li>
  );
}
