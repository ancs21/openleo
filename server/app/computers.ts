// Each board's computer starts with the server or the new account; on a Mac without one, setup gets one ready first.
import { listBoards } from "./boards";
import { SANDBOXED } from "../infra/config";
import { buildImage, openDocker, setupStatus, startApple, type SetupStatus } from "../infra/computer-setup";
import { computerState, repickRuntime, sandbox, SANDBOX_ON } from "../infra/sandbox";
import { inTenant, listTenants } from "../infra/tenant";

export function startComputers() {
  if (!SANDBOXED) return;
  for (const { id: bid } of listBoards()) {
    const name = computerState(bid).name;
    sandbox(bid).then(() => console.log(`computer "${name}" ready`), (e) => console.warn(`computer "${name}": ${e.message}`));
  }
}

/** A setup step finished: pick where computers run again and start every account's computers there. */
function afterSetup() {
  repickRuntime();
  for (const tenant of listTenants()) inTenant(tenant, startComputers);
}

/** Computers can start where they run now: a local runtime with the computer image built, or the cloud. */
export const computersWork = (runtime: string, s: Pick<SetupStatus, "apple" | "docker">) =>
  runtime === "cloud" || (runtime === "apple" ? s.apple.running && s.apple.image : s.docker.running && s.docker.image);

export async function computerSetup() {
  const status = await setupStatus();
  return { ...status, runtime: SANDBOX_ON, ready: !SANDBOXED || computersWork(SANDBOX_ON, status) };
}

export async function setupStep(step: string) {
  if (step === "start") return startApple(afterSetup);
  if (step === "build") return buildImage("apple", afterSetup);
  if (step === "build-docker") return buildImage("docker", afterSetup);
  if (step === "docker") { await openDocker(); return; }
  if (step === "check") return afterSetup(); // installed something by hand: look again
  throw new Error(`unknown setup step "${step}"`);
}
