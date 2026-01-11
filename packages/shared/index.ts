export type NodeStatus = "online" | "offline";

export function toWsUrl(httpUrl: string) {
    return httpUrl.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
}

export function isWsUrl(url: string) {
    return url.startsWith("ws://") || url.startsWith("wss://");
}