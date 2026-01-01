export function minecraftSpec(opts: { hostPort: number; memoryMb: number; version?: string }) {
    return {
        image: "itzg/minecraft-server:latest", // Auswahl später möglich
        env: {
            EULA: "TRUE",
            TYPE: "VANILLA",
            VERSION: opts.version ?? "LATEST",
            // itzg Image kann MEMORY akzeptieren, alternativ JVM_*
            MEMORY: `${opts.memoryMb}M`,
        },
        ports: [{ hostPort: opts.hostPort, containerPort: 25565, protocol: "tcp" as const }],
        memoryMb: opts.memoryMb,
        cpus: 1, // MVP
    };
}
