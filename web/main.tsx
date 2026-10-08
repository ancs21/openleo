import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { installInteractionSounds } from "./lib/sounds";
import { router } from "./router";

installInteractionSounds();
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
