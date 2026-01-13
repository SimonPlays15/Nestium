/**
 * Generates a container name by appending the given server ID to a predefined prefix.
 *
 * @param serverId The unique identifier of the server.
 * @return The generated container name in the format "nestium_srv_<serverId>".
 */
export function containerName(serverId: string): string {
    return `nestium_srv_${serverId}`;
}

/**
 * Generates a formatted volume name based on the given server ID.
 *
 * @param {string} serverId - The unique identifier of the server.
 * @return {string} The generated volume name in the format `nestium_vol_<serverId>`.
 */
export function volumeName(serverId: string): string {
    return `nestium_vol_${serverId}`;
}
