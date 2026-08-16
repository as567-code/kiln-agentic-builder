import { Sandbox } from "@vercel/sandbox";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const blueprintRoot = path.join(
  repositoryRoot,
  "blueprints/react-fastapi-postgres",
);
const sandboxRoot = "/vercel/sandbox/workspace";
const excludedNames = new Set([
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".venv",
  "__pycache__",
  "dist",
  "node_modules",
  "tsconfig.tsbuildinfo",
]);

const files = await collectFiles(blueprintRoot);
const sandbox = await Sandbox.create({
  runtime: "node24",
  timeout: 10 * 60_000,
  resources: { vcpus: 2 },
  networkPolicy: "allow-all",
  persistent: false,
  tags: { product: "kiln", purpose: "blueprint-snapshot" },
});

try {
  await sandbox.writeFiles(
    await Promise.all(
      files.map(async (relativePath) => ({
        path: `${sandboxRoot}/${relativePath}`,
        content: await readFile(path.join(blueprintRoot, relativePath)),
        mode: 0o640,
      })),
    ),
  );

  await runChecked(
    sandbox,
    "sudo",
    ["dnf", "install", "-y", "python3.13", "python3.13-pip"],
    sandboxRoot,
    180_000,
  );
  await runChecked(
    sandbox,
    "sudo",
    ["ln", "-sf", "/usr/bin/python3.13", "/usr/local/bin/python"],
    sandboxRoot,
    30_000,
  );
  await runChecked(sandbox, "npm", ["ci"], `${sandboxRoot}/frontend`, 180_000);
  await runChecked(
    sandbox,
    "python",
    ["-m", "pip", "install", "--disable-pip-version-check", "-e", ".[dev]"],
    `${sandboxRoot}/backend`,
    240_000,
  );
  const snapshot = await sandbox.snapshot();
  process.stdout.write(`${snapshot.snapshotId}\n`);
} finally {
  await sandbox.stop().catch(() => undefined);
}

async function collectFiles(root: string, directory = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, directory), {
    withFileTypes: true,
  });
  const collected: string[] = [];
  for (const entry of entries) {
    if (excludedNames.has(entry.name)) continue;
    const relativePath = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) {
      collected.push(...(await collectFiles(root, relativePath)));
    } else if (entry.isFile()) {
      collected.push(relativePath);
    }
  }
  return collected.sort();
}

async function runChecked(
  sandbox: InstanceType<typeof Sandbox>,
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<void> {
  const result = await sandbox.runCommand({ cmd: command, args, cwd, timeoutMs });
  if (result.exitCode !== 0) {
    const stderr = (await result.stderr()).slice(0, 2000);
    throw new Error(`${command} failed while preparing the blueprint: ${stderr}`);
  }
}
