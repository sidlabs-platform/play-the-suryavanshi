import { readFileSync } from "node:fs";
// A feature ticket is not permission to edit the referee. Check old and new names on renames.
export const permitted = name => /^(?:site\/[\w/-]+\.(?:html|css|js)|test\/features\/[\w/-]+\.test\.js)$/.test(name);
const args = process.argv.slice(2);
if (args.length) {
  let paths;
  if (args[0] === "staged") paths = readFileSync(0,"utf8").split("\0").filter(Boolean);
  else if (args[0] === "pr") {
    const files = JSON.parse(readFileSync(0,"utf8")).flat();
    if (files.length !== Number(args[1]) || files.length === 0) throw new Error("Incomplete PR file list; refusing to vouch for scope.");
    paths = files.flatMap(f=>f.previous_filename ? [f.filename,f.previous_filename] : [f.filename]);
  } else throw new Error("Expected staged or pr input.");
  const denied = paths.filter(path=>!permitted(path));
  if (denied.length) {
    process.stderr.write(`OUTSIDE FEATURE SCOPE: ${denied.map(p=>JSON.stringify(p)).join(", ")}\nRequest a separate owner-reviewed policy change.\n`);
    process.exitCode=1;
  } else process.stdout.write("Feature scope OK: game assets and feature tests only.\n");
}
