/**
 * Represents the status of a node within a system or network.
 *
 * The status determines whether the node is currently reachable or not.
 * Possible values are:
 * - "online": Indicates that the node is active and reachable.
 * - "offline": Indicates that the node is inactive or unreachable.
 */
export type NodeStatus = "online" | "offline";

/**
 * Converts an HTTP or HTTPS URL to its corresponding WebSocket URL.
 * Replaces the scheme "http" with "ws" and "https" with "wss".
 *
 * @param {string} httpUrl - The HTTP or HTTPS URL to be converted.
 * @return {string} The converted WebSocket URL.
 */
export function toWsUrl(httpUrl: string): string {
    return httpUrl.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
}

/**
 * Determines if the given URL is a WebSocket URL.
 *
 * @param {string} url - The URL string to be checked.
 * @return {boolean} Returns true if the URL starts with "ws://" or "wss://", otherwise false.
 */
export function isWsUrl(url: string): boolean {
    return url.startsWith("ws://") || url.startsWith("wss://");
}