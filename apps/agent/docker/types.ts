export type PortMapping = {
    hostPort: number;
    containerPort: number;
    protocol?: "tcp" | "udp";
};

export type ServerSpec = {
    serverId: string;
    image: string;                 // itzg/minecraft-server:latest
    env: Record<string, string>;   // EULA, VERSION...
    ports: PortMapping[];
    memoryMb?: number;
    cpus?: number;                 // e.g. 1.5
};
