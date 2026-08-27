// Node 20-compatible TypeScript loader for `node --test`.
//
// Node < 22.6 cannot execute .ts test files natively and throws
// ERR_UNKNOWN_FILE_EXTENSION (type stripping is only enabled by default from
// Node >= 22.18). This loader transpiles .ts on the fly with esbuild (already
// a dependency via vite), so `node --test` works on any Node >= 20.6 when the
// test scripts pass `--import ./ts-loader.mjs`.
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts") || url.endsWith(".tsx") || url.endsWith(".mts")) {
    const source = readFileSync(new URL(url), "utf8");
    const { code } = transformSync(source, {
      loader: url.endsWith(".tsx") ? "tsx" : "ts",
      format: "esm",
      sourcefile: url,
    });
    return { format: "module", source: code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
