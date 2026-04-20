export function shouldRenderDemo(demoUrl: string | undefined): boolean {
  if (!demoUrl) return false;
  const trimmed = demoUrl.trim();
  if (trimmed.length === 0) return false;
  return trimmed.startsWith("https://");
}
