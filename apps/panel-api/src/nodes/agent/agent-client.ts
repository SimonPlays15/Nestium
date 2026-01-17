import crypto from 'crypto';

/**
 * Generates a SHA-256 hash of the given input and returns its hexadecimal representation.
 *
 * @param {string} input - The string input to hash.
 * @return {string} The hexadecimal representation of the SHA-256 hash of the input.
 */
function sha256Hex(input: string) {
    return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Generates an HMAC-SHA256 hash of the input data using the provided secret key.
 * The result is returned as a hexadecimal string.
 *
 * @param {string} secret - The secret key used for HMAC generation.
 * @param {string} data - The input data to hash.
 * @return {string} The hexadecimal representation of the HMAC-SHA256 hash.
 */
function hmacSha256Hex(secret: string, data: string) {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Generates signed headers for authenticating requests from an agent.
 *
 * @param {Object} opts - Options for generating signed headers.
 * @param {string} opts.nodeId - Unique identifier for the agent node.
 * @param {string} opts.sharedSecret - Shared secret key used for generating the signature.
 * @param {string} opts.method - HTTP method of the request (e.g., "GET").
 * @param {string} opts.path - Request path, including the endpoint and any URL parameters.
 * @param {string} [opts.bodyStr] - Optional string representation of the request body (default is an empty string).
 * @return {Object} Signed headers object including `X-Node-Id`, `X-Timestamp`, `X-Body-SHA256`, and `X-Signature`.
 */
export function agentSignedHeaders(opts: {
    nodeId: string;
    sharedSecret: string;
    method: string; // "GET"
    path: string; // "/v1/servers/:id/logs/stream"
    bodyStr?: string; // bei WS: ""
}): {
    'X-Node-Id': string;
    'X-Timestamp': string;
    'X-Body-SHA256': string;
    'X-Signature': string;
} {
    const method = opts.method.toUpperCase();
    const ts = Date.now().toString();
    const bodyStr = opts.bodyStr ?? '';
    const bodyHash = sha256Hex(bodyStr);
    const pathOnly = opts.path.split('?')[0];

    const signingString = `${ts}.${method}.${pathOnly}.${bodyHash}`;
    const sig = hmacSha256Hex(opts.sharedSecret, signingString);

    return {
        'X-Node-Id': opts.nodeId,
        'X-Timestamp': ts,
        'X-Body-SHA256': bodyHash,
        'X-Signature': sig,
    };
}

/**
 * Makes an HTTP request to a specified endpoint with authentication headers,
 * including a cryptographic signature for request verification.
 *
 * @param {Object} opts - Options to configure the request.
 * @param {string} opts.nodeId - A unique identifier for the requesting node.
 * @param {string} opts.sharedSecret - A shared secret used for request signing.
 * @param {string} opts.endpointUrl - The base URL of the target endpoint (e.g., http://localhost:8081).
 * @param {string} opts.path - The specific path of the API to call (e.g., /v1/test).
 * @param {string} [opts.method] - The HTTP method to use for the request (e.g., GET, POST). Defaults to GET.
 * @param {unknown} [opts.body] - The request body, which will be serialized as JSON if an object is provided.
 *
 * @return {Promise<Response>} A promise that resolves to the Response object from the fetch call.
 */
export async function agentFetch(opts: {
    nodeId: string;
    sharedSecret: string;
    endpointUrl: string; // e.g. http://localhost:8081
    path: string; // e.g. /v1/test
    method?: string; // GET/POST...
    body?: unknown; // object -> JSON
}): Promise<Response> {
    const method = (opts.method ?? 'GET').toUpperCase();
    const ts = Date.now().toString();

    const bodyStr =
        opts.body === undefined || opts.body === null
            ? ''
            : typeof opts.body === 'string'
                ? opts.body
                : JSON.stringify(opts.body);

    const bodyHash = sha256Hex(bodyStr);
    const pathOnly = opts.path.split('?')[0];

    const signingString = `${ts}.${method}.${pathOnly}.${bodyHash}`;
    const sig = hmacSha256Hex(opts.sharedSecret, signingString);

    return await fetch(`${opts.endpointUrl}${opts.path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-Node-Id': opts.nodeId,
            'X-Timestamp': ts,
            'X-Body-SHA256': bodyHash,
            'X-Signature': sig,
        },
        body: method === 'GET' || method === 'HEAD' ? undefined : bodyStr,
    });
}
