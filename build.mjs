import { mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const distDir = path.join(root, "dist");
const publicDir = path.join(distDir, "public");
const serverOutDir = path.join(distDir, "server");

await mkdir(publicDir, { recursive: true });
await mkdir(serverOutDir, { recursive: true });

await build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: path.join(serverOutDir, "index.js"),
  sourcemap: false,
  packages: "external"
});

await build({
  entryPoints: ["client/app.ts"],
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  outfile: path.join(publicDir, "app.js"),
  sourcemap: false
});

await copyFile(path.join(root, "client", "index.html"), path.join(publicDir, "index.html"));
await copyFile(path.join(root, "client", "styles.css"), path.join(publicDir, "styles.css"));
try {
  await copyFile(path.join(root, "client", "imperial-seal-engraving.svg"), path.join(publicDir, "imperial-seal-engraving.svg"));
} catch {
  // Optional cosmetic asset; build should still succeed without it.
}
try {
  await copyFile(path.join(root, "client", "cat-paw-clear-transparent.png"), path.join(publicDir, "cat-paw.png"));
} catch {
  try {
  await copyFile(
    "/Users/ywang/.cursor/projects/Users-ywang-indeed-dsp/assets/images-afccca38-8022-4582-b440-90adfc10408f.png",
    path.join(publicDir, "cat-paw.png")
  );
  } catch {
    try {
      await copyFile(
        "/Users/ywang/.cursor/projects/Users-ywang-indeed-dsp/assets/cat-paw-original-base-remake.png",
        path.join(publicDir, "cat-paw.png")
      );
    } catch {
      try {
        await copyFile(path.join(root, "client", "cat-paw-transparent.png"), path.join(publicDir, "cat-paw.png"));
      } catch {
        // Optional cosmetic asset; build should still succeed without it.
      }
    }
  }
}
try {
  await copyFile(path.join(root, "client", "maneki-neko-win-transparent.png"), path.join(publicDir, "maneki-neko-win.png"));
} catch {
  // Optional cosmetic asset; build should still succeed without it.
}
try {
  await copyFile(path.join(root, "client", "maneki-neko-cry-transparent.png"), path.join(publicDir, "maneki-neko-cry.png"));
} catch {
  // Optional cosmetic asset; build should still succeed without it.
}
try {
  await copyFile(path.join(root, "client", "maneki-neko-blasted-transparent.png"), path.join(publicDir, "maneki-neko-blasted.png"));
} catch {
  // Optional cosmetic asset; build should still succeed without it.
}
try {
  await copyFile(path.join(root, "client", "lobby-maneki-neko.png"), path.join(publicDir, "lobby-maneki-neko.png"));
} catch {
  // Optional cosmetic asset; build should still succeed without it.
}
try {
  await copyFile(path.join(root, "client", "avatar-default.png"), path.join(publicDir, "avatar-default.png"));
} catch {
  // Optional cosmetic asset; build should still succeed without it.
}
for (const name of ["cat-paw-black", "cat-paw-white", "cat-paw-gray"]) {
  try {
    await copyFile(path.join(root, "client", `${name}.png`), path.join(publicDir, `${name}.png`));
  } catch {
    // Optional cosmetic asset
  }
}
for (const name of ["avatar-cat-east", "avatar-cat-south", "avatar-cat-west", "avatar-cat-north"]) {
  try {
    await copyFile(path.join(root, "client", `${name}.png`), path.join(publicDir, `${name}.png`));
  } catch {
    try {
      await copyFile(`/Users/ywang/.cursor/projects/Users-ywang-indeed-dsp/assets/${name}.png`, path.join(publicDir, `${name}.png`));
    } catch {
      // Optional cosmetic asset; build should still succeed without it.
    }
  }
}
await writeFile(path.join(publicDir, ".gitkeep"), "", "utf8");
