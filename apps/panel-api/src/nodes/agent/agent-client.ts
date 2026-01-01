import crypto from "crypto";

function sha256Hex(input: string) {
    return crypto.createHash("sha256").update(input).digest("hex");
}

function hmacSha256Hex(secret: string, data: string) {
    return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export function agentSignedHeaders(opts: {
    nodeId: string;
    sharedSecret: string;
    method: string;   // "GET"
    path: string;     // "/v1/servers/:id/logs/stream"
    bodyStr?: string; // bei WS: ""
}) {
    const method = opts.method.toUpperCase();
    const ts = Date.now().toString();
    const bodyStr = opts.bodyStr ?? "";
    const bodyHash = sha256Hex(bodyStr);
    const pathOnly = opts.path.split("?")[0];

    const signingString = `${ts}.${method}.${pathOnly}.${bodyHash}`;
    const sig = hmacSha256Hex(opts.sharedSecret, signingString);

    return {
        "X-Node-Id": opts.nodeId,
        "X-Timestamp": ts,
        "X-Body-SHA256": bodyHash,
        "X-Signature": sig,
    };
}


export async function agentFetch(opts: {
    nodeId: string;
    sharedSecret: string;
    endpointUrl: string; // e.g. http://localhost:8081
    path: string;        // e.g. /v1/test
    method?: string;     // GET/POST...
    body?: unknown;      // object -> JSON
}) {
    const method = (opts.method ?? "GET").toUpperCase();
    const ts = Date.now().toString();

    const bodyStr =
        opts.body === undefined || opts.body === null
            ? ""
            : typeof opts.body === "string"
                ? opts.body
                : JSON.stringify(opts.body);

    const bodyHash = sha256Hex(bodyStr);
    const pathOnly = opts.path.split("?")[0];

    const signingString = `${ts}.${method}.${pathOnly}.${bodyHash}`;
    const sig = hmacSha256Hex(opts.sharedSecret, signingString);

    return await fetch(`${opts.endpointUrl}${opts.path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            "X-Node-Id": opts.nodeId,
            "X-Timestamp": ts,
            "X-Body-SHA256": bodyHash,
            "X-Signature": sig,
        },
        body: method === "GET" || method === "HEAD" ? undefined : bodyStr,
    });
}
