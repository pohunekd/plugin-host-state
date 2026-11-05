// Loads config/package.json, the plugin package facts. Every key is required
// and validated; a missing, extra or malformed key throws and nothing is defaulted.
import { readFileSync } from "node:fs";

export type PackageConfig = {
  readonly id: string;
  readonly version: string;
  readonly sourceDigest: string;
  readonly command: string;
};

const packageIdPattern = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const versionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const sourceDigestPattern = /^sha256:[0-9a-f]{64}$/;
const commandPattern = /^[a-z][a-z0-9-]{0,31}$/;

const expectedKeys = ["id", "version", "sourceDigest", "command"];

function fail(key: string): never {
  throw new Error(`config package.json: invalid ${key}`);
}

export function loadPackageConfig(path: string): PackageConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch (e) {
    throw new Error(
      `config package.json: cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("package");
  }
  const fields = raw as Record<string, unknown>;
  for (const key of expectedKeys) {
    if (!(key in fields)) {
      fail(key);
    }
  }
  for (const key of Object.keys(fields)) {
    if (!expectedKeys.includes(key)) {
      fail(key);
    }
  }
  const { id, version, sourceDigest, command } = fields;
  if (typeof id !== "string" || !packageIdPattern.test(id)) {
    fail("id");
  }
  if (typeof version !== "string" || !versionPattern.test(version)) {
    fail("version");
  }
  if (typeof sourceDigest !== "string" || !sourceDigestPattern.test(sourceDigest)) {
    fail("sourceDigest");
  }
  if (typeof command !== "string" || !commandPattern.test(command)) {
    fail("command");
  }
  return { id, version, sourceDigest, command };
}
