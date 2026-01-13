/**
 * Represents a mapping of ports between a host machine and a container.
 *
 * This type is typically used in containerized environments to define how
 * a host port is forwarded to a container port. An optional protocol
 * may also be specified to indicate whether the mapping is TCP or UDP.
 *
 * Properties:
 * - `hostPort`: The port number on the host machine.
 * - `containerPort`: The port number within the container.
 * - `protocol` (optional): The protocol used for the port mapping; defaults to "tcp" if not specified.
 */
export type PortMapping = {
    hostPort: number;
    containerPort: number;
    protocol?: "tcp" | "udp";
};

/**
 * Contains the configuration details for a server.
 *
 * An exclusive identifier for the server.
 * The Docker image that will be utilized for the server (e.g., itzg/minecraft-server:latest).
 * Environmental variables for the server, frequently utilized for setup (e.g., EULA, VERSION).
 * A collection of port connections that specify how container ports correspond to host ports.
 * A discretionary limit for the server's memory in MB.
 * An optional CPU assignment for the server, represented as a decimal or integer (e.g., 1.5).
 */
export type ServerSpec = {
    serverId: string;
    image: string;                 // itzg/minecraft-server:latest
    env: Record<string, string>;   // EULA, VERSION...
    ports: PortMapping[];
    memoryMb?: number;
    cpus?: number;                 // e.g. 1.5
};
