/**
 * Log redaction shared by preload (renderer logs + IPC traffic) and main (electron-log hook).
 *
 * Keys are split into words (camelCase / PascalCase / acronyms / `_` / `-` / `.` / spaces) and
 * matched as whole words, so `pat` is caught but `filePath` / `iterationPath` are not.
 * Values are not inspected - only keys.
 */

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 20;

/** Any one of these as a whole word in the key → redact. */
const SENSITIVE_WORDS = new Set([
    "pat",
    "password",
    "passwd",
    "pwd",
    "secret",
    "secrets",
    "token",
    "tokens",
    "cookie",
    "cookies",
    "authorization",
    "auth",
    "credential",
    "credentials",
    "bearer"
]);

/** Consecutive word pairs that are sensitive together but not apart (`api` / `key` alone are fine). */
const SENSITIVE_PAIRS: ReadonlyArray<readonly [string, string]> = [
    ["api", "key"],
    ["private", "key"],
    ["session", "id"]
];

/**
 * Fallback for keys with no word boundaries (`apikey`, `accesstoken`, `clientsecret`): the
 * joined key ending in one of these. Deliberately excludes `pat` - suffix-matching that would
 * catch every `...path` key.
 */
const SENSITIVE_SUFFIXES = ["token", "tokens", "secret", "password", "apikey", "cookie", "cookies"];

export const splitKeyWords = (key: string): string[] =>
    key
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // fooBar → foo Bar
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // APIKey → API Key
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);

export const isSensitiveKey = (key: string): boolean => {
    const words = splitKeyWords(key);
    if (words.some((w) => SENSITIVE_WORDS.has(w))) return true;
    for (let i = 0; i < words.length - 1; i++) {
        if (SENSITIVE_PAIRS.some(([a, b]) => words[i] === a && words[i + 1] === b)) return true;
    }
    const joined = words.join("");
    return SENSITIVE_SUFFIXES.some((s) => joined.endsWith(s));
};

const redactInner = (value: unknown, ancestors: WeakSet<object>, depth: number): unknown => {
    if (value === null || typeof value !== "object") return value;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
    }
    if (ancestors.has(value)) return "[Circular]";
    if (depth >= MAX_DEPTH) return "[MaxDepth]";

    ancestors.add(value);
    try {
        const recurse = (v: unknown): unknown => redactInner(v, ancestors, depth + 1);
        const entry = (key: string, v: unknown): unknown =>
            isSensitiveKey(key) ? REDACTED : recurse(v);

        if (Array.isArray(value)) return value.map(recurse);

        if (value instanceof Error) {
            // Rebuild as a real Error so electron-log still formats name/message/stack natively.
            // (Object.entries() would drop message/stack - they are non-enumerable.)
            const copy = new Error(value.message);
            copy.name = value.name;
            copy.stack = value.stack;
            if ("cause" in value) copy.cause = recurse(value.cause);
            for (const [k, v] of Object.entries(value)) {
                (copy as unknown as Record<string, unknown>)[k] = entry(k, v);
            }
            return copy;
        }

        if (value instanceof Map) {
            return Object.fromEntries(
                Array.from(value.entries(), ([k, v]) => [
                    String(k),
                    typeof k === "string" ? entry(k, v) : recurse(v)
                ])
            );
        }

        if (value instanceof Set) return Array.from(value, recurse);

        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, entry(k, v)]));
    } finally {
        // Ancestors only (not "seen anywhere"), so a shared non-cyclic reference isn't mislabelled.
        ancestors.delete(value);
    }
};

/** Deep-copies `value`, replacing values under sensitive keys with `[REDACTED]`. Never mutates input. */
export const redact = (value: unknown): unknown => redactInner(value, new WeakSet(), 0);
