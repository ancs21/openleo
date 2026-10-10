/** Opens the tab synchronously (inside the click) so popup blockers allow it, then points it at the async URL. */
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
