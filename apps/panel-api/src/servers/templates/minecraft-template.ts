/**
 * Generates a specification object for configuring a Minecraft server container.
 *
 * @param {Object} opts - Configuration options for the Minecraft server.
 * @param {number} opts.hostPort - The port on the host machine to bind to the Minecraft server's default port (25565).
 * @param {number} opts.memoryMb - The amount of memory in megabytes to allocate to the Minecraft server.
 * @param {string} [opts.version] - The Minecraft server version to use. Defaults to "LATEST" if not specified.
 * @return {Object} A configuration object for the Minecraft server container, including image details, environment variables, ports, memory, and CPU allocation.
 */
export function minecraftSpec(opts: {
  hostPort: number;
  memoryMb: number;
  version?: string;
}): object {
  return {
    image: 'itzg/minecraft-server:latest', // Auswahl später möglich
    env: {
      EULA: 'TRUE',
      TYPE: 'VANILLA',
      VERSION: opts.version ?? 'LATEST',
      // itzg Image kann MEMORY akzeptieren, alternativ JVM_*
      MEMORY: `${opts.memoryMb}M`,
    },
    ports: [
      {
        hostPort: opts.hostPort,
        containerPort: 25565,
        protocol: 'tcp' as const,
      },
    ],
    memoryMb: opts.memoryMb,
    cpus: 1, // MVP
  };
}
