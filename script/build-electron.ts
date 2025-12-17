import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";

const outdir = "dist-server";

async function buildServer() {
  console.log("Building server for Electron...");

  // Clean output directory
  if (fs.existsSync(outdir)) {
    fs.rmSync(outdir, { recursive: true });
  }
  fs.mkdirSync(outdir, { recursive: true });

  try {
    // Bundle the production server code with ALL dependencies
    const result = await esbuild.build({
      entryPoints: ["server/index-prod.ts"],
      bundle: true,
      platform: "node",
      target: "node20",
      format: "cjs",
      outfile: path.join(outdir, "server.cjs"),
      // Only external native modules that cannot be bundled
      external: [
        "better-sqlite3",
      ],
      // Define import.meta replacements for CJS
      define: {
        "import.meta.dirname": "__dirname",
      },
      // Banner to handle import.meta.url
      banner: {
        js: `
if (typeof globalThis.import_meta_url === 'undefined') {
  globalThis.import_meta_url = require('url').pathToFileURL(__filename).href;
}
`,
      },
      // Resolve all internal modules
      mainFields: ["module", "main"],
      resolveExtensions: [".ts", ".js", ".json"],
      minify: false,
      sourcemap: false,
      metafile: true,
      logLevel: "info",
    });

    console.log("Server bundle created: dist-server/server.cjs");
    
    // Log bundled modules
    const inputs = Object.keys(result.metafile?.inputs || {});
    console.log(`Bundled ${inputs.length} modules`);
    
    // Verify betfair.ts is included
    const betfairIncluded = inputs.some(i => i.includes("betfair"));
    const dbLocalIncluded = inputs.some(i => i.includes("db-local"));
    console.log(`betfair.ts bundled: ${betfairIncluded}`);
    console.log(`db-local.ts bundled: ${dbLocalIncluded}`);

  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

buildServer().then(() => {
  console.log("Server build complete!");
});
