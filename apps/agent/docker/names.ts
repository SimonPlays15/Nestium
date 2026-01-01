export function containerName(serverId: string) {
    return `nestium_srv_${serverId}`;
}

export function volumeName(serverId: string) {
    return `nestium_vol_${serverId}`;
}
