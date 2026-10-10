import type { ElectrobunConfig } from "electrobun";

// The desktop app: a Bun main process (desktop/main.ts) that runs the compiled OpenLeo server.
// Build the server first: `bun run app:server` (the app:dev / app:build scripts do it).
// Electrobun builds for the OS it runs on (macOS arm64, Linux x64/arm64, Windows x64): CI builds each one.
const exe = process.platform === "win32" ? ".exe" : "";

export default {
  app: {
    name: "OpenLeo",
    identifier: "si.openleo.app",
    version: "0.10.11",
  },
  // Updates: the app checks the latest GitHub release for this platform's update.json (made by each build).
  release: { baseUrl: "https://github.com/ancs21/openleo/releases/latest/download", generatePatch: false },
  build: {
    mainProcess: "bun",
    bun: { entrypoint: "desktop/main.ts" },
    copy: {
      [`dist/openleo-server${exe}`]: `openleo/openleo-server${exe}`,
      "dist/node_modules": "openleo/node_modules",
      "desktop/tray.png": "tray.png", // macOS menu bar (a template image)
      "desktop/icon.iconset/icon_32x32@2x.png": "tray-color.png", // Windows and Linux trays
      "computer": "openleo/computer", // the computer image's recipe, for setup on this machine
    },
    mac: {
      bundleCEF: false, icons: "desktop/icon.iconset", // bun run app:icons
      // Signed and notarized when the Developer ID is set (ELECTROBUN_DEVELOPER_ID plus Apple's notary keys, see
      // .github/workflows/desktop.yml); unsigned otherwise, which macOS warns about on first open.
      codesign: !!process.env.ELECTROBUN_DEVELOPER_ID,
      notarize: !!process.env.ELECTROBUN_DEVELOPER_ID,
      // Bun compiles JavaScript as it runs, and the server loads its own native library (cua).
      entitlements: {
        "com.apple.security.cs.allow-jit": true,
        "com.apple.security.cs.allow-unsigned-executable-memory": true,
        "com.apple.security.cs.disable-library-validation": true,
      },
    },
    win: { icon: "desktop/icon.iconset/icon_256x256.png" }, // Windows icons top out at 256 px
    linux: { icon: "desktop/icon.iconset/icon_256x256@2x.png" }, // 512 px
  },
  runtime: {
    exitOnLastWindowClosed: false, // keep running in the menu bar
  },
} satisfies ElectrobunConfig;
