// Side panel widths, remembered in this browser.
import { create } from "zustand";
import { storage } from "../lib/storage";

export type Panel = "card" | "leo";
const PANEL_WIDTHS: Record<Panel, number> = { card: 680, leo: 440 };
const savedWidths = (): Partial<Record<Panel, number>> => { try { return JSON.parse(storage.get("panelWidths") ?? "{}"); } catch { return {}; } };

export const usePanels = create<{ panelWidth: Record<Panel, number>; setPanelWidth: (panel: Panel, width?: number) => void }>((set, get) => ({
  panelWidth: { ...PANEL_WIDTHS, ...savedWidths() },
  setPanelWidth: (panel, width) => {
    const panelWidth = { ...get().panelWidth, [panel]: width ?? PANEL_WIDTHS[panel] };
    set({ panelWidth });
    storage.set("panelWidths", JSON.stringify(panelWidth));
  },
}));
