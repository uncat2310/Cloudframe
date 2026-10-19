/**
 * Build-time switch for the self-hosted Cloudflare R2 mode: S3 credentials stay
 * on the server, the browser logs in with a password and every storage
 * operation is proxied through `/api/rpc`. See `selfhost/README.md`.
 */
export const selfHostMode = import.meta.env.VITE_S3IP_SELF_HOST === "true";
