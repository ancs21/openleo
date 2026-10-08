/**
 * Open a new tab for a URL we only get after an async call. The tab is opened synchronously
 * (inside the click) so popup blockers allow it, then pointed at the URL; closed again on error.
 */
export async function openInNewTab(getUrl: () => Promise<string>) {
  const tab = window.open("", "_blank");
  try {
    const url = await getUrl();
    if (tab) tab.location.href = url; else window.open(url, "_blank", "noopener");
  } catch (e) {
    tab?.close();
    throw e;
  }
}
