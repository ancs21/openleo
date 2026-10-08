// The installers in the newest release, shared by the home page's button and the download page.
// File names stay the same from release to release, so these links always get the latest.
export const GITHUB = "https://github.com/ancs21/openleo";
export const RELEASE = `${GITHUB}/releases/latest`;

const installer = (os: string, label: string, file: string, note: string, steps: string[]) =>
  ({ os, label, file, note, steps, url: `${RELEASE}/download/${file}` });

export const MAC = installer("Mac", "Mac", "macos-arm64-OpenLeo.dmg", "For Macs with Apple silicon", [
  "Open the downloaded file and drag OpenLeo into Applications.",
  "Open OpenLeo from Applications. It's signed and checked by Apple.",
]);
export const WINDOWS = installer("Windows", "Windows", "win-x64-OpenLeo-Setup.zip", "For Windows PCs (x64)", [
  "Unzip the downloaded file and run OpenLeo-Setup.exe.",
  "If Windows says it protected your PC, choose More info, then Run anyway.",
]);
export const LINUX = installer("Linux", "Linux (x64)", "linux-x64-OpenLeo-Setup.tar.gz", "For Linux (x64)", [
  "Extract the downloaded file and run ./installer in that folder.",
  "It installs OpenLeo in ~/.local/share and adds it to your apps.",
]);
export const LINUX_ARM = installer("Linux", "Linux (ARM)", "linux-arm64-OpenLeo-Setup.tar.gz", "For Linux on ARM", LINUX.steps);
export const DOWNLOADS = [MAC, WINDOWS, LINUX, LINUX_ARM];

/** The installer for the visitor's system. */
export function detectDownload(ua = typeof navigator === "undefined" ? "" : navigator.userAgent) {
  if (/Windows/.test(ua)) return WINDOWS;
  if (/Linux/.test(ua) && !/Android/.test(ua)) return /aarch64|arm64/i.test(ua) ? LINUX_ARM : LINUX;
  return MAC; // also phones: the Mac app is the main one
}
