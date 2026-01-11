import {createDockerClient} from "./client";
import {containerName, volumeName} from "./names";
import {ServerSpec} from "./types";
import {Readable} from "stream";

const docker = createDockerClient();

export async function ensureImage(image: string) {
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

export async function ensureVolume(serverId: string) {
    const name = volumeName(serverId);
    try {
        await docker.getVolume(name).inspect();
        return name;
    } catch {
        const v = await docker.createVolume({ Name: name });
        return v.Name;
    }
}

export async function createOrReplaceContainer(spec: ServerSpec) {
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

function isNotFound(err: any) {
    return err?.statusCode === 404 || /no such container/i.test(String(err?.message ?? ""));
}

export async function containerExists(serverId: string) {
    const name = containerName(serverId);
    try {
        await docker.getContainer(name).inspect();
        return true;
    } catch (e) {
        if (isNotFound(e)) return false;
        throw e;
    }
}

export async function containerStatus(serverId: string) {
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

export async function restartContainer(serverId: string) {
    const name = containerName(serverId);
    const c = docker.getContainer(name);
    await c.restart({ t: 10 });
}

export async function startContainer(serverId: string) {
    const name = containerName(serverId);
    const c = docker.getContainer(name);
    await c.start();
}

export async function stopContainer(serverId: string) {
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

export async function deleteContainer(serverId: string) {
    const name = containerName(serverId);
    const c = docker.getContainer(name);
    try { await c.stop({ t: 5 }); } catch {}
    await c.remove({ force: true });
}

export async function tailLogs(serverId: string, tail = 200) {
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