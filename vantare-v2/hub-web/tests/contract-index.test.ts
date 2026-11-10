import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { contractIndex } from "../scripts/contract-index";

describe("screen contract discovery", () => {
  it("adds an independent screen without editing any existing module", () => {
    const directory = mkdtempSync(join(tmpdir(), "vantare-contract-index-"));
    const root = pathToFileURL(directory + sep);
    try {
      mkdirSync(join(directory, "generated", "corpus"), { recursive: true });
      mkdirSync(join(directory, "modules"));
      const add = (id: string) => {
        const prefix = id[0].toUpperCase() + id.slice(1);
        const source = ["Request", "Reply", "HostError", "Event", "Topic"]
          .map((kind) => `export type ${prefix}${kind} = never;`)
          .join("\n");
        writeFileSync(
          join(directory, "generated", `${id}.ts`),
          `${source}\nexport type ${prefix}PayloadRequest = { payload: string };\nexport const ${id}Methods = ["${id}.get"] as const;\n`,
        );
        writeFileSync(
          join(directory, "generated", "corpus", `${id}.json`),
          JSON.stringify({ host: [], ui: [] }),
        );
        writeFileSync(join(directory, "modules", `${id}.ts`), "export {};\n");
      };
      add("alpha");
      contractIndex(root);
      const original = readFileSync(
        join(directory, "generated", "alpha.ts"),
        "utf8",
      );
      add("beta");
      contractIndex(root);
      expect(
        readFileSync(join(directory, "generated", "alpha.ts"), "utf8"),
      ).toBe(original);
      expect(
        readFileSync(join(directory, "generated", "contract.ts"), "utf8"),
      ).toContain("export type Request = AlphaRequest | BetaRequest;");
      expect(
        readFileSync(join(directory, "generated", "validators.ts"), "utf8"),
      ).toContain("export const validators = [alpha, beta]");
      const once = readFileSync(
        join(directory, "generated", "contract.ts"),
        "utf8",
      );
      contractIndex(root);
      expect(
        readFileSync(join(directory, "generated", "contract.ts"), "utf8"),
      ).toBe(once);
      writeFileSync(join(directory, "modules", "orphan.ts"), "export {};\n");
      expect(() => contractIndex(root)).toThrow("must match exactly");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
