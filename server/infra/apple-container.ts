// Board computers on Apple's own container runtime (https://github.com/apple/container, macOS 26+) instead of Docker.
// Each computer is a light VM with its own address on a host-only network; we start it with the `container`
// command and then talk to its control service (port 3211) directly, like any cua computer.
// Used by default when this Mac can run it (appleAvailable), or with OPENLEO_SANDBOX_ON=apple; build the image with `bun run computer:build:apple`.
import { embedded, type SandboxLike } from "@trycua/cua";
import { randomBytes } from "node:crypto";
import { release } from "node:os";
import { APPLE_DNS as DNS, APPLE_IMAGE as IMAGE, LIMITS } from "./config";
import { computerSize } from "./limits";


const TOKEN_VAR = "CUA_ENV_TOKEN=";

/** This Mac can run computers natively: Apple silicon, macOS 26+ (Darwin 25), the `container` command running, and the image built. */
export function appleAvailable() {
  if (process.platform !== "darwin" || process.arch !== "arm64" || Number(release().split(".")[0]) < 25) return false;
  try { return Bun.spawnSync(["container", "image", "inspect", IMAGE], { stdout: "ignore", stderr: "ignore" }).exitCode === 0; }
  catch { return false; } // no `container` command
}

async function run(...args: string[]) {
  const r = await Bun.$`container ${args}`.quiet().nothrow();
  if (r.exitCode !== 0) throw new Error(`container ${args[0]}: ${r.stderr.toString().trim() || `exit ${r.exitCode}`}`);
  return r.stdout.toString();
}

type Info = { status?: { state?: string; networks?: { ipv4Address?: string }[] }; configuration?: { initProcess?: { environment?: string[] } } };
const inspect = (name: string): Promise<Info | undefined> =>
  run("inspect", name).then((out) => JSON.parse(out)[0], (e: Error) => { if (/not found/.test(e.message)) return undefined; throw e; });

const addressOf = (info?: Info) => info?.status?.state === "running" ? info.status.networks?.[0]?.ipv4Address?.split("/")[0] : undefined;

/** The computer's address now. It changes whenever the computer restarts, and is undefined while it is stopped. */
export const appleAddress = async (name: string) => addressOf(await inspect(name));

/** Start (creating on first use) the named computer and attach to it. Its token lives in the container's own settings. */
export async function appleComputer(name: string): Promise<{ sb: SandboxLike; address: string }> {
  let info = await inspect(name);
  if (!info) {
    // No limit means "the whole machine" to Docker but 1 GB to this runtime, so fall back to the usual size.
    const { cpus = LIMITS.computerCpus, memoryMb = LIMITS.computerMemoryMb } = computerSize();
    await run("run", "-d", "--name", name, "--dns", DNS, "--shm-size", "2G", "-c", String(cpus), "-m", `${memoryMb}M`,
      "-e", `${TOKEN_VAR}${randomBytes(24).toString("hex")}`, "-e", "DISPLAY=:1", "-e", "CUA_X_SERVER=xvfb", IMAGE);
  } else if (info.status?.state !== "running") await run("start", name);
  info = await inspect(name);
  const address = addressOf(info);
  const token = info?.configuration?.initProcess?.environment?.find((e) => e.startsWith(TOKEN_VAR))?.slice(TOKEN_VAR.length);
  if (!address || !token) throw new Error(`computer ${name} started without an address`);
  return { sb: await embedded().sandboxes().connectUrl(`http://${address}:3211`, token, name), address };
}

/** Stop the computer; its files stay for next time. */
export const stopAppleComputer = (name: string) => run("stop", name).then(() => {});

/**
 * Power-cycle a computer that stopped answering. A hung VM ignores `container stop` and `kill`, so its runtime
 * process is ended instead (like pulling the plug: its files stay). The next attach starts it again.
 */
export async function restartAppleComputer(name: string) {
  await Bun.$`pkill -f ${`container-runtime-linux start .* --uuid ${name}$`}`.quiet().nothrow();
  for (let i = 0; i < 20 && addressOf(await inspect(name)); i++) await Bun.sleep(500);
}
