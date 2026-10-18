// Names the read/write/edit sensitive-path guard does not refuse by file name.
//
// Two sources:
//   - built in: an environment TEMPLATE (.env.example, .env.sample,
//     .env.template, .env.dist, and compounds such as .env.production.example)
//     holds no secret, so it is never sensitive by its name;
//   - configured: the "sensitivePathAllow" array of exact file names in the
//     GLOBAL runtime-guardrails.json (`<config home>/runtime-guardrails.json`).
//     There is deliberately no project-level list: a repository must not be
//     able to unlock other sensitive names.
//
// A name only lifts the FILE-NAME match: a path whose directory is itself
// sensitive (secrets/, .ssh/, ...) stays blocked. A malformed or unreadable
// file contributes nothing (fail closed) and never throws.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const SENSITIVE_PATH_ALLOW_KEY = "sensitivePathAllow";

const ENV_TEMPLATE = /^\.env(?:\.[^/]+)?\.(?:example|sample|template|dist)$/i;

/** Whether a file name is an environment template (.env.example and kin). */
export function isEnvTemplateName(name: string): boolean {
	return ENV_TEMPLATE.test(name);
}

/** An exact file name: no separators, no wildcards, not `.` or `..`. */
function isFileName(value: unknown): value is string {
	return typeof value === "string" && value.trim() === value && value !== "" && value !== "." && value !== ".." && !/[\\/*?[\]{}]/.test(value);
}

/** The configured names, lowercased, from the global runtime-guardrails.json. */
export function loadSensitivePathAllow(configHome: string): Set<string> {
	try {
		const parsed: unknown = JSON.parse(readFileSync(join(configHome, "runtime-guardrails.json"), "utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Set();
		const list = (parsed as Record<string, unknown>)[SENSITIVE_PATH_ALLOW_KEY];
		return new Set(Array.isArray(list) ? list.filter(isFileName).map((name) => name.toLowerCase()) : []);
	} catch {
		return new Set();
	}
}

/**
 * Whether a sensitive path is lifted: its file name is an environment template
 * or is in `allow` (lowercase), and its directory, on its own, is not
 * sensitive. `normalized` is the guard's normalized path (slashes, lowercase);
 * `isSensitive` is the guard's own test.
 */
export function isAllowedSensitivePath(normalized: string, allow: ReadonlySet<string>, isSensitive: (path: string) => boolean): boolean {
	const cut = normalized.replace(/\/+$/, "").lastIndexOf("/");
	const name = normalized.replace(/\/+$/, "").slice(cut + 1);
	if (!isEnvTemplateName(name) && !allow.has(name.toLowerCase())) return false;
	const directory = cut < 0 ? "" : normalized.slice(0, cut);
	return !isSensitive(`${directory}/_`);
}
