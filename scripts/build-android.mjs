import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const variant = process.argv[2] ?? "debug";
const tasks = { debug: ":app:assembleDebug", release: ":app:assembleRelease" };

if (!Object.hasOwn(tasks, variant)) {
  console.error("Usage: pnpm build:android [debug|release]");
  process.exit(2);
}

const windows = process.platform === "win32";
const result = spawnSync(
  windows ? "cmd.exe" : "./gradlew",
  windows ? ["/d", "/c", "gradlew.bat", tasks[variant]] : [tasks[variant]],
  { cwd: fileURLToPath(new URL("../apps/android/", import.meta.url)), stdio: "inherit" },
);

if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
