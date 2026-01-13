import {createDockerClient} from "./client";
import {containerName, volumeName} from "./names";
import {ServerSpec} from "./types";
import {Readable} from "stream";

/**
 * Represents an instance of a Docker client used to interact with Docker containers,
 * images, networks, and other Docker resources.
 *
 * This variable is initialized with a Docker client object, providing methods to
 * manage and communicate with the Docker Engine API.
 */
const docker = createDockerClient();

/**
 * Ensures that the specified Docker image is available locally. If the image is missing, it pulls the image from the repository.
 *
 * @param {string} image - The name of the Docker image, including the tag or version, to check and pull if necessary.
 * @return {Promise<void>} A promise that resolves when the image is confirmed to be available locally, either by being already present or successfully pulled.
 */
export async function ensureImage(image: string): Promise<void> {
    // Pull image if missing
    try {
        await docker.getImage(image).inspect();
        return;
    } catch {
        // pull
        await new Promise<void>((resolve, reject) => {
            docker.pull(image, (err: Error, stream: any) => {
                if (err) return reject(err);
                docker.modem.followProgress(stream, (err2) => (err2 ? reject(err2) : resolve()));
            });
        });
    }
}

/**
 * Ensures that a Docker volume exists for the provided server ID. If the volume does not exist, it creates a new one.
 *
 * @param {string} serverId - The unique identifier of the server for which the volume is ensured.
 * @return {Promise<string>} A promise that resolves to the name of the existing or newly created volume.
 */
export async function ensureVolume(serverId: string): Promise<string> {
    const name = volumeName(serverId);
    try {
        await docker.getVolume(name).inspect();
        return name;
    } catch {
        const v = await docker.createVolume({ Name: name });
        return v.Name;
    }
}

/**
 * Creates or replaces a Docker container for the specified server configuration.
 *
 * @param {ServerSpec} spec - The server configuration specifying container properties, including server ID, image, environment variables, ports, memory, CPUs, and other metadata.
 *
 * @return {Promise<{containerId: string, name: string, volume: string}>} A promise that resolves to an object containing the container ID, name, and associated volume name upon successful creation or replacement of the container.
 */
export async function createOrReplaceContainer(spec: ServerSpec): Promise<{
    containerId: string;
    name: string;
    volume: string;
}> {
    console.log("createOrReplaceContainer", {spec});
    const name = containerName(spec.serverId);
    console.log("createOrReplaceContainer", {name});
    // remove if exists
    try {
        const existing = docker.getContainer(name);
        await existing.inspect();
        // stop if running (ignore errors)
        try { await existing.stop({ t: 5 }); } catch {}
        await existing.remove({ force: true });
    } catch (err) {
        console.error("Failed to remove existing container", {name, error: err});
        // doesn't exist
    }

    await ensureImage(spec.image);
    const vol = await ensureVolume(spec.serverId);

    const envArr = Object.entries(spec.env).map(([k, v]) => `${k}=${v}`);
    console.log("createOrReplaceContainer", {envArr});

    const exposedPorts: Record<string, {}> = {};
    const portBindings: Record<string, Array<{ HostPort: string }>> = {};

    for (const p of spec.ports) {
        const proto = p.protocol ?? "tcp";
        const key = `${p.containerPort}/${proto}`;
        exposedPorts[key] = {};
        portBindings[key] = [{ HostPort: String(p.hostPort) }];
    }

    const hostConfig: any = {
        Binds: [`${vol}:/data`],
        PortBindings: portBindings,
        RestartPolicy: { Name: "unless-stopped" },
    };

    if (spec.memoryMb) {
        hostConfig.Memory = spec.memoryMb * 1024 * 1024;
    }
    if (spec.cpus) {
        // Docker uses NanoCPUs (1 CPU = 1e9)
        hostConfig.NanoCpus = Math.floor(spec.cpus * 1e9);
    }

    const container = await docker.createContainer({
        name,
        Image: spec.image,
        Env: envArr,
        ExposedPorts: exposedPorts,
        HostConfig: hostConfig,
        Tty: true,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        OpenStdin: true,
        Labels: {
            "nestium.serverId": spec.serverId,
            "nestium.managed": "true",
        },
    });

    return { containerId: container.id, name, volume: vol };
}

/**
 * Checks if the provided error object corresponds to a "not found" condition.
 *
 * @param {any} err - The error object to evaluate.
 * @return {boolean} Returns `true` if the error indicates a "not found" status (HTTP 404)
 *                   or matches the "no such container" message pattern, otherwise `false`.
 */
function isNotFound(err: any): boolean {
    return err?.statusCode === 404 || /no such container/i.test(String(err?.message ?? ""));
}

/**
 * Checks if a Docker container with the specified server ID exists.
 *
 * @param {string} serverId - The unique identifier of the server.
 * @return {Promise<boolean>} A promise that resolves to `true` if the container exists, or `false` if it does not exist. Throws an error for unexpected issues.
 */
export async function containerExists(serverId: string): Promise<boolean> {
    const name = containerName(serverId);
    try {
        await docker.getContainer(name).inspect();
        return true;
    } catch (e) {
        if (isNotFound(e)) return false;
        throw e;
    }
}

/**
 * Fetches the status of a Docker container based on the provided server ID.
 *
 * @param {string} serverId - A unique identifier for the server whose container status is requested.
 * @return {Promise<Object>} A promise that resolves to an object containing the container's status information:
 *   - `exists` (boolean): Indicates if the container exists.
 *   - `status` (string): The current status of the container (e.g., running, exited, created).
 *   - `running` (boolean): Indicates if the container is currently running.
 *   - `startedAt` (string|null): The timestamp when the container was started, or null if not applicable.
 *   - `finishedAt` (string|null): The timestamp when the container finished, or null if not applicable.
 *   - `exitCode` (number|null): The exit code of the container process, or null if not applicable.
 *   - `error` (string|null): Any error associated with the container, or null if none exists.
 * If the container does not exist, the returned object will only contain `exists: false`.
 */
export async function containerStatus(serverId: string): Promise<object> {
    const name = containerName(serverId);
    const c = docker.getContainer(name);

    try {
        const info = await c.inspect();
        return {
            exists: true,
            status: info?.State?.Status ?? "unknown",     // running, exited, created...
            running: Boolean(info?.State?.Running),
            startedAt: info?.State?.StartedAt ?? null,
            finishedAt: info?.State?.FinishedAt ?? null,
            exitCode: info?.State?.ExitCode ?? null,
            error: info?.State?.Error ?? null,
        };
    } catch (e) {
        if (isNotFound(e)) return { exists: false };
        throw e;
    }
}

/**
 * Restarts a Docker container associated with the specified server ID.
 *
 * @param {string} serverId - The unique identifier for the server whose container must be restarted.
 * @return {Promise<void>} A promise that resolves when the container has been successfully restarted.
 */
export async function restartContainer(serverId: string): Promise<void> {
    const name = containerName(serverId);
    const c = docker.getContainer(name);
    await c.restart({ t: 10 });
}

/**
 * Starts a Docker container with the specified server ID.
 *
 * @param {string} serverId - The unique identifier of the server whose container needs to be started.
 * @return {Promise<void>} A promise that resolves when the container has successfully started.
 */
export async function startContainer(serverId: string): Promise<void> {
    const name = containerName(serverId);
    const c = docker.getContainer(name);
    await c.start();
}

/**
 * Stops a running Docker container identified by the specified server ID. If the container is already stopped,
 * paused, or not running, the method tolerates the error and does not throw.
 *
 * @param {string} serverId - The unique identifier of the server whose container needs to be stopped.
 * @return {Promise<void>} A promise that resolves once the container has been stopped or if it was already not running.
 */
export async function stopContainer(serverId: string): Promise<void> {
    const name = containerName(serverId);
    const c = docker.getContainer(name);

    // Wenn schon aus/paused etc. -> stop kann Fehler werfen. Wir tolerieren "not running".
    try {
        await c.stop({ t: 10 });
    } catch (e: any) {
        const msg = String(e?.message ?? "");
        if (/is not running/i.test(msg) || /container.*stopped/i.test(msg) || e?.statusCode === 304) {
            return;
        }
        throw e;
    }
}

/**
 * Deletes a Docker container associated with the specified server ID.
 *
 * @param {string} serverId - The unique identifier for the server whose container is to be deleted.
 * @return {Promise<void>} A promise that resolves when the container is successfully deleted.
 */
export async function deleteContainer(serverId: string): Promise<void> {
    const name = containerName(serverId);
    const c = docker.getContainer(name);
    try { await c.stop({ t: 5 }); } catch {}
    await c.remove({ force: true });
}

/**
 * Fetches and returns logs from a specific Docker container.
 *
 * @param {string} serverId - The identifier for the server whose logs are to be fetched.
 * @param {number} [tail=200] - The number of log lines to retrieve from the end. Defaults to 200 if not specified.
 * @return {Promise<string>} A promise that resolves to a string containing the logs of the specified container.
 */
export async function tailLogs(serverId: string, tail: number = 200): Promise<string> {
    const name = containerName(serverId);
    const c = docker.getContainer(name);

    const result = await c.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: false,
        follow: false,
    });

    // dockerode kann Buffer oder Stream liefern
    if (Buffer.isBuffer(result)) {
        return result.toString("utf8");
    }

    // Stream case
    const stream = result as unknown as Readable;
    return await new Promise<string>((resolve, reject) => {
        let out = "";
        stream.on("data", (chunk: Buffer) => (out += chunk.toString("utf8")));
        stream.on("end", () => resolve(out));
        stream.on("error", reject);
    });
}