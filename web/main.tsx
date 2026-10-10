import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { inMacApp } from "./lib/computer-files";
import { installInteractionSounds } from "./lib/sounds";
import { router } from "./router";

installInteractionSounds();
// The Mac app's web view has no Reload of its own: ⌘R reloads the page there, as in a browser.
if (inMacApp()) window.addEventListener("keydown", (e: KeyboardEvent) => { if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === "r") { e.preventDefault(); location.reload(); } });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
