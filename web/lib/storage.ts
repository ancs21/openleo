/** localStorage that never throws (private mode, blocked storage). */
export const storage = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
  remove: (k: string) => { try { localStorage.removeItem(k); } catch {} },
};
