import { homedir } from "node:os";
import { join } from "node:path";
import { type ConfigCategory, envConfigHomeFor } from "./gentle-config-scope.ts";
import { bundledGentlePiConfigHome, runningBundledPrefix } from "./gentle-shell-bundled.ts";

// Pi Subagents resolves its global directory as `PI_CODING_AGENT_DIR || ~/.pi/agent`,
// so an empty value must fall through here too or the two homes diverge again.
export function resolveGentlePiAgentHome(env: NodeJS.ProcessEnv = process.env): string {
	return env.GENTLE_PI_AGENT_HOME || env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

// The Gentle AI config directory outside `~/.pi/agent`: everything the extension
// commands own lives here. It is defined once because the launch-time profile pin
// resolver reads the same profiles store the `/gentle:profiles` panel writes, and
// two spellings of the override would silently read two different stores.
// A bundled Gentle Shell keeps it inside its prefix (S9, bundledGentlePiConfigHome).
//
// `category` names what the caller reads or writes (lib/gentle-config-scope.ts).
// In a named env that owns that category, it resolves to the env's own config
// home, ahead of the bundled prefix and GENTLE_PI_CONFIG_HOME. Every other
// case, and install-level reads that pass no category, keep the chain above.
export function gentlePiConfigHome(env: NodeJS.ProcessEnv = process.env, category?: ConfigCategory): string {
	return envConfigHomeFor(env, category) ?? bundledGentlePiConfigHome(env) ?? (env.GENTLE_PI_CONFIG_HOME || join(homedir(), ".pi", "gentle-ai"));
}

// The same chain for the readers that historically kept an empty
// GENTLE_PI_CONFIG_HOME as-is (`??`: a relative, cwd-based home) instead of
// falling back (`||`): the banner and the shell's profile reader. Kept
// separately so their established behavior does not change.
export function gentlePiConfigHomeKeepingEmpty(env: NodeJS.ProcessEnv = process.env, category?: ConfigCategory): string {
	return envConfigHomeFor(env, category) ?? bundledGentlePiConfigHome(env) ?? env.GENTLE_PI_CONFIG_HOME ?? join(homedir(), ".pi", "gentle-ai");
}

// The agent home Pi runs with, only in a bundled Gentle Shell (S9): there the
// extensions that otherwise write under ~/.pi/agent keep their files in it.
// Undefined elsewhere, where they keep their existing locations.
export function bundledGentlePiAgentHome(env: NodeJS.ProcessEnv = process.env): string | undefined {
	return runningBundledPrefix(env) === undefined ? undefined : resolveGentlePiAgentHome(env);
}
