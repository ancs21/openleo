// Getting a computer for agents on this machine: what's installed and running (Apple's container tool on new Macs,
// Docker on any Mac, Linux or Windows PC), and the setup steps OpenLeo can do itself: turn on the container
// service, build the computer image (for this machine's chip), start Docker.
// Installing either tool is the person's own step (an installer they open); everything after that is a button.
import { existsSync } from "node:fs";
import { release } from "node:os";
import { APPLE_IMAGE, DOCKER_IMAGE, PUBLISHED_IMAGE } from "./config";

/** The computer image's recipe (computer/): next to the server in the Mac app, at the repo root in development. */
const RECIPE = `${process.cwd()}/computer`;

export type SetupJob = { step: "start" | "build"; log: string[]; done: boolean; error?: string };
export type Tool = "apple" | "docker";
export type SetupStatus = {
  /** darwin, linux or win32: the steps and their words differ a little. */
  platform: NodeJS.Platform;
  /** This Mac can run computers natively: Apple silicon and macOS 26 or later. */
  native: boolean;
  apple: { installed: boolean; running: boolean; image: boolean };
  /** running: Docker is up and runs Linux containers. windows: it's up but set to Windows containers (Windows only). */
  docker: { installed: boolean; running: boolean; windows: boolean; image: boolean };
  job?: SetupJob;
};

/** Run a command; its output when it worked, else undefined. A missing command, or one that hangs, is a no. */
async function run(cmd: string[], timeoutMs = 8_000) {
  try {
    const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore" });
    const timer = setTimeout(() => p.kill(), timeoutMs);
    const [text, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
    clearTimeout(timer);
    return code === 0 ? text.trim() : undefined;
  } catch { return undefined; }
}
const ok = async (cmd: string[], timeoutMs?: number) => (await run(cmd, timeoutMs)) !== undefined;

const g = globalThis as { openleoSetupJob?: SetupJob }; // survives bun --hot reloads while a build runs

export async function setupStatus(): Promise<SetupStatus> {
  const native = process.platform === "darwin" && process.arch === "arm64" && Number(release().split(".")[0]) >= 25; // Darwin 25 = macOS 26
  const appleInstalled = native && (await ok(["container", "--version"]));
  const appleRunning = appleInstalled && (await ok(["container", "system", "status"]));
  const [image, dockerInstalled] = await Promise.all([appleRunning ? ok(["container", "image", "inspect", APPLE_IMAGE]) : false, ok(["docker", "--version"])]);
  // The computer is a Linux image: Docker set to Windows containers can't run it.
  const dockerOs = dockerInstalled ? await run(["docker", "info", "--format", "{{.OSType}}"], 15_000) : undefined;
  const dockerRunning = dockerOs === "linux";
  return {
    platform: process.platform,
    native,
    apple: { installed: appleInstalled, running: appleRunning, image },
    docker: { installed: dockerInstalled, running: dockerRunning, windows: dockerOs === "windows", image: dockerRunning && (await ok(["docker", "image", "inspect", DOCKER_IMAGE])) },
    ...(g.openleoSetupJob ? { job: g.openleoSetupJob } : {}),
  };
}

/**
 * Run setup commands one after another as the current job, keeping the last lines of their output for the page.
 * When one fails and there's a fallback, run the fallback's commands instead.
 */
function runJob(step: SetupJob["step"], commands: string[][], onDone: () => void, fallback?: string[][]) {
  if (g.openleoSetupJob && !g.openleoSetupJob.done) throw new Error("setup is already working on something");
  const job: SetupJob = (g.openleoSetupJob = { step, log: [], done: false });
  const note = (text: string) => { for (const line of text.split(/\r?\n/)) if (line.trim()) job.log.push(line.slice(0, 300)); job.log.splice(0, job.log.length - 40); };
  void (async () => {
    try {
      const runAll = async (list: string[][]) => {
        for (const cmd of list) {
          const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", cwd: existsSync(RECIPE) ? RECIPE : undefined });
          const read = async (s: ReadableStream<Uint8Array>) => { const text = new TextDecoder(); for await (const chunk of s) note(text.decode(chunk, { stream: true })); };
          await Promise.all([read(p.stdout), read(p.stderr)]);
          if ((await p.exited) !== 0) throw new Error(job.log.at(-1) ?? `${cmd.slice(0, 3).join(" ")} failed`);
        }
      };
      try { await runAll(commands); } catch (e) { if (!fallback) throw e; note("Download didn't work, building it here instead."); await runAll(fallback); }
      onDone();
    } catch (e) { job.error = (e as Error).message; }
    finally { job.done = true; }
  })();
}

/** Turn on Apple's container service (it downloads the small Linux kernel it needs the first time). */
export const startApple = (onDone: () => void) =>
  runJob("start", [["container", "system", "start", "--enable-kernel-install"]], onDone);

/**
 * Get OpenLeo's computer image with Apple's tool or Docker: download the published one (for this machine's chip) and
 * name it as OpenLeo runs it. When that fails and this install has the recipe, build it here (about 10 minutes).
 */
export function buildImage(tool: Tool, onDone: () => void) {
  const cli = tool === "apple" ? "container" : "docker", name = tool === "apple" ? APPLE_IMAGE : DOCKER_IMAGE;
  const download = [[cli, "image", "pull", PUBLISHED_IMAGE], [cli, "image", "tag", PUBLISHED_IMAGE, name]];
  const build = [
    ...(tool === "apple" ? [["sh", "-c", "container builder start --dns 1.1.1.1 || true"]] : []), // a running builder is fine
    [cli, "build", "--pull", "-t", name, "."],
  ];
  runJob("build", download, onDone, existsSync(`${RECIPE}/Dockerfile`) ? build : undefined);
}

/**
 * Start Docker: Docker Desktop on a Mac or Windows; on Linux, Docker Desktop's service for this user (Docker Engine
 * runs as a system service, which needs an administrator: the page says how). On Windows, also switch Docker Desktop
 * to Linux containers when it's set to Windows ones.
 */
export async function openDocker() {
  if (process.platform === "darwin") return ok(["open", "-a", "Docker"]);
  if (process.platform === "win32") {
    const dir = `${process.env.ProgramFiles ?? "C:\\Program Files"}\\Docker\\Docker`;
    if ((await run(["docker", "info", "--format", "{{.OSType}}"], 15_000)) === "windows") {
      if (await ok([`${dir}\\DockerCli.exe`, "-SwitchLinuxEngine"], 60_000)) return true;
      throw new Error("couldn't switch Docker. Right-click Docker's icon by the clock and choose Switch to Linux containers. Docker without Docker Desktop (Windows Server) can't run Linux containers.");
    }
    return ok(["cmd", "/c", "start", "", `${dir}\\Docker Desktop.exe`]);
  }
  return ok(["systemctl", "--user", "start", "docker-desktop"]);
}
