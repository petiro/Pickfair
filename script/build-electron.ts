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
    // Bundle the production server code
    await esbuild.build({
      entryPoints: ["server/index-prod.ts"],
      bundle: true,
      platform: "node",
      target: "node20",
      format: "cjs",
      outfile: path.join(outdir, "server.cjs"),
      external: [
        // Better-sqlite3 needs to be external (native module)
        "better-sqlite3",
      ],
      define: {
        "import.meta.dirname": "__dirname",
        "import.meta.url": "require('url').pathToFileURL(__filename).href",
      },
      minify: false,
      sourcemap: false,
    });

    console.log("Server bundle created: dist-server/server.cjs");

  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

buildServer().then(() => {
  console.log("Server build complete!");
});
