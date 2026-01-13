import Docker from "dockerode";

/**
 * Creates and returns a Docker client instance. The function checks for the presence of
 * an environment variable `DOCKER_HOST` to determine the Docker host configuration. If
 * `DOCKER_HOST` is defined, it parses the value to configure the client with the specified
 * host and port. If not provided, the client is created using the default settings or
 * auto-detected socket paths/platform-specific defaults.
 *
 * @return {Docker} A Docker client instance configured based on the environment or default settings.
 */
export function createDockerClient(): Docker {
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
