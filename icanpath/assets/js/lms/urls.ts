/** Provider links are metadata, never arbitrary navigation targets. */
export function providerUrl(value: string, provider: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Enter a valid link that starts with https://."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Use a link from the selected service. The link must not include a password or a custom port.");
  const host = url.hostname.toLowerCase();
  const allowed = provider === "drive" ? host === "drive.google.com"
    : provider === "google_meet" ? host === "meet.google.com"
    : provider === "zoom" ? host === "zoom.us" || host.endsWith(".zoom.us")
    : provider === "youtube_live" ? ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(host)
    : false;
  if (!allowed) throw new Error("Use a link from the service you selected.");
  return url.href;
}
