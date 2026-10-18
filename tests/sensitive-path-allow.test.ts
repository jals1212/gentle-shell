import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { __testing } from "../extensions/gentle-ai.ts";
import { isAllowedSensitivePath, isEnvTemplateName, loadSensitivePathAllow } from "../lib/sensitive-path-allow.ts";

// The guard's own patterns (extensions/gentle-ai.ts, SENSITIVE_PATH_PATTERNS).
const PATTERNS = [
	/(^|\/)\.ssh(?:\/|$)/,
	/(^|\/)\.credentials(?:\/|$)/,
	/(^|\/)library\/keychains(?:\/|$)/,
	/(^|\/)\.aws\/credentials$/,
	/(^|\/)\.config\/gh\/hosts\.ya?ml$/,
	/(^|\/)secrets(?:\/|$)/,
	/(^|\/)\.env(?:$|[./_-])/,
	/\.(?:pem|key|p12|pfx)$/,
];
const isSensitive = (path: string) => PATTERNS.some((pattern) => pattern.test(path));

function configHome(global?: unknown): string {
	const home = mkdtempSync(join(tmpdir(), "spa-home-"));
	if (global !== undefined) writeFileSync(join(home, "runtime-guardrails.json"), typeof global === "string" ? global : JSON.stringify(global));
	return home;
}
const load = (global?: unknown) => loadSensitivePathAllow(configHome(global));
const allowed = (path: string, allow: ReadonlySet<string> = new Set()) => isAllowedSensitivePath(path, allow, isSensitive);

test("environment templates are allowed by file name, compounds included", () => {
	for (const name of [".env.example", ".env.sample", ".env.template", ".env.dist", ".env.production.example", ".env.local.sample", ".ENV.Example"]) {
		assert.equal(isEnvTemplateName(name), true, name);
		assert.equal(allowed(`/repo/${name.toLowerCase()}`), true, name);
	}
	assert.equal(allowed(".env.example"), true);
	assert.equal(allowed("/repo/docker/.env.example"), true);
});

test("real environment files stay blocked", () => {
	for (const name of [".env", ".env.local", ".env.production", ".env.example.bak", ".env.examples", ".env.", ".env.example.key", "env.example"]) {
		assert.equal(isEnvTemplateName(name), false, name);
		assert.equal(allowed(`/repo/${name}`), false, name);
	}
});

test("a template inside a sensitive directory stays blocked", () => {
	assert.equal(allowed("/repo/secrets/.env.example"), false);
	assert.equal(allowed("/home/u/.ssh/.env.example"), false);
	assert.equal(allowed("/repo/.credentials/.env.sample"), false);
	assert.equal(allowed("/home/u/library/keychains/.env.template"), false);
	assert.equal(allowed("/repo/.env.d/.env.example"), false);
});

test("a template-named directory does not allow what is inside it", () => {
	assert.equal(allowed("/repo/.env.example/.env"), false);
	assert.equal(allowed("/repo/.env.example/token"), false);
});

test("the global list lifts the names it lists, case-insensitively", () => {
	const allow = load({ sensitivePathAllow: ["deploy.key", "Server.PEM"] });
	assert.deepEqual([...allow].sort(), ["deploy.key", "server.pem"]);
	assert.equal(allowed("/repo/deploy.key", allow), true);
	assert.equal(allowed("/repo/ci/deploy.key", allow), true);
	assert.equal(allowed("/repo/server.pem", allow), true);
	assert.equal(allowed("/repo/other.key", allow), false);
	assert.equal(allowed("/repo/.env", allow), false);
	assert.equal(allowed("/repo/.env.production", allow), false);
});

test("a listed name inside a sensitive directory stays blocked", () => {
	const allow = load({ sensitivePathAllow: ["deploy.key"] });
	assert.equal(allowed("/repo/secrets/deploy.key", allow), false);
	assert.equal(allowed("/home/u/.ssh/deploy.key", allow), false);
});

test("invalid entries are ignored", () => {
	const bad = ["", " ", ".", "..", " deploy.key", "deploy.key ", "a/b.key", "a\\b.key", "*.key", "deploy?.key", "[a].key", "{a,b}.key", 7, null, {}, ["x.key"]];
	assert.equal(load({ sensitivePathAllow: bad }).size, 0);
	assert.deepEqual([...load({ sensitivePathAllow: [...bad, "ok.key"] })], ["ok.key"]);
	assert.equal(load({ sensitivePathAllow: "deploy.key" }).size, 0);
});

test("a malformed, unreadable or absent file contributes nothing", () => {
	assert.equal(load().size, 0);
	assert.equal(load("{ not json").size, 0);
	assert.equal(load("").size, 0);
	assert.equal(load("[]").size, 0);
	assert.equal(load("null").size, 0);
	assert.equal(load({ other: 1 }).size, 0);
	const home = configHome();
	// A plain file where the config home should be: reading under it throws.
	writeFileSync(join(home, "not-a-dir"), "x");
	assert.equal(loadSensitivePathAllow(join(home, "not-a-dir")).size, 0);
	assert.equal(loadSensitivePathAllow(join(home, "missing")).size, 0);
});

test("the guard: templates pass, real env files and the rest stay blocked, other tools unaffected", () => {
	const home = configHome({ sensitivePathAllow: ["deploy.key"] });
	const previous = process.env.GENTLE_PI_CONFIG_HOME;
	process.env.GENTLE_PI_CONFIG_HOME = home;
	try {
		const evaluate = __testing.evaluateSensitivePathTool;
		for (const tool of ["read", "write", "edit"]) {
			assert.equal(evaluate(tool, { path: "/repo/.env.example" }), undefined, `${tool} .env.example`);
			assert.equal(evaluate(tool, { path: "/repo/.env.production.example" }), undefined, `${tool} compound`);
			assert.equal(evaluate(tool, { path: "/repo/deploy.key" }), undefined, `${tool} listed`);
			for (const path of ["/repo/.env", "/repo/.env.local", "/repo/.env.example.bak", "/repo/other.key", "/repo/secrets/.env.example", "/repo/secrets/deploy.key"]) {
				const denied = evaluate(tool, { path });
				assert.equal(denied?.block, true, `${tool} ${path}`);
				assert.match(denied?.reason ?? "", /sensitive path/);
			}
		}
		assert.equal(evaluate("bash", { path: "/repo/.env" }), undefined);
		assert.equal(evaluate("grep", { path: "/repo/.env" }), undefined);
	} finally {
		if (previous === undefined) delete process.env.GENTLE_PI_CONFIG_HOME;
		else process.env.GENTLE_PI_CONFIG_HOME = previous;
		rmSync(home, { recursive: true, force: true });
	}
});
