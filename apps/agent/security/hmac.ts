import crypto from "crypto";

export function sha256Hex(input: string | Buffer) {
    return crypto.createHash("sha256").update(input).digest("hex");
}

export function hmacSha256Hex(secret: string, data: string) {
    return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export function safeEqualHex(a: string, b: string) {
    // Timing-safe compare
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}
