// Tests get their own OpenLeo home, so they never create tenants next to real data.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.OPENLEO_HOME = mkdtempSync(join(tmpdir(), "openleo-test-"));
