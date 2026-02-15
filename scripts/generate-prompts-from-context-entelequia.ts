import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  buildGeneratedBusinessPromptFiles,
  loadCanonicalBusinessPrompts,
} from './_helpers/entelequia-canonical-context';

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const canonicalPrompts = await loadCanonicalBusinessPrompts(rootDir);
  const targets = buildGeneratedBusinessPromptFiles(canonicalPrompts);

  for (const target of targets) {
    const absolutePath = resolve(rootDir, target.path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${target.content}\n`, 'utf8');
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        generatedFiles: targets.map((target) => target.path),
      },
      null,
      2,
    ) + '\n',
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown_error';
  process.stderr.write(
    JSON.stringify(
      {
        ok: false,
        error: message,
      },
      null,
      2,
    ) + '\n',
  );
  process.exitCode = 1;
});
