import Docker from "dockerode";

export function createDockerClient() {
    // Standard:
    // - Linux/WSL: socketPath /var/run/docker.sock
    // - Windows Docker Desktop: dockerode kann oft default nutzen.
    // Optional später: DOCKER_HOST (tcp) unterstützen
    const dockerHost = process.env.DOCKER_HOST;

    if (dockerHost) {
        // Beispiel: tcp://localhost:2375
        const url = new URL(dockerHost.replace("tcp://", "http://"));
        return new Docker({ host: url.hostname, port: Number(url.port) });
    }

    return new Docker(); // auto-detect
}
