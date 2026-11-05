// Validates HostCapacity JSON against contracts/v1/host-capacity.schema.json.
// Usage: bun run contract:check               (the committed fixtures)
//        bun run contract:check -             (one JSON document from stdin)
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";

const fixtures = [
  "contracts/v1/fixtures/host-capacity.json",
  "contracts/v1/fixtures/host-capacity-busy.json",
  "contracts/v1/fixtures/host-capacity-low-battery.json",
];

const ajv = new Ajv({ strict: true });
addFormats(ajv);
const validate = ajv.compile(
  JSON.parse(readFileSync("contracts/v1/host-capacity.schema.json", "utf-8")) as object,
);

function check(label: string, value: unknown): boolean {
  if (validate(value)) {
    console.log(`ok host-capacity <- ${label}`);
    return true;
  }
  console.error(`FAIL host-capacity <- ${label}`);
  console.error(JSON.stringify(validate.errors, null, 2));
  return false;
}

const arg = Bun.argv[2];
let failed = 0;
if (arg === "-") {
  const text = await new Response(Bun.stdin.stream()).text();
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    console.error("FAIL host-capacity <- stdin (not JSON)");
    process.exit(1);
  }
  if (!check("stdin", value)) failed += 1;
} else if (arg === undefined) {
  for (const path of fixtures) {
    if (!check(path, JSON.parse(readFileSync(path, "utf-8")) as unknown)) failed += 1;
  }
} else {
  console.error("Usage: bun run contract:check [-]");
  process.exit(1);
}
if (failed > 0) {
  console.error(`${String(failed)} document(s) failed validation`);
  process.exit(1);
}
