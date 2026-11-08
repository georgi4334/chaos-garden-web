const trimSlash = (url: string) => url.replace(/\/+$/, "");

export const CONTROL_API_URL = trimSlash(
  process.env.NEXT_PUBLIC_CONTROL_API_URL ?? "http://localhost:3000",
);
export const PROXY_URL = trimSlash(process.env.NEXT_PUBLIC_PROXY_URL ?? "http://localhost:3100");

export function proxyUrlFor(gardenId: string, targetName: string): string {
  return `${PROXY_URL}/g/${gardenId}/${encodeURIComponent(targetName)}`;
}
