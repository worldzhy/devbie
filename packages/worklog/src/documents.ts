import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";

import type { WorklogConfig } from "./config";
import { redact } from "./redact";
import type { WorklogState } from "./state";
import type { UploadDocument } from "./api";

const DOCUMENT_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);

/** One changed document plus the state entry to commit after a successful upload. */
export interface ScannedDocument {
  /** Absolute file path, the key in `state.documents`. */
  filePath: string;
  hash: string;
  upload: UploadDocument;
}

/**
 * Declared-layer document scan (ADR-029 §8, ADR-030). Only declared
 * workspaces are walked; anything else on the machine is never visited.
 * A document is re-uploaded only when its content hash changes.
 *
 * This function never mutates `state`: the hash is committed by the caller
 * only after the upload succeeds, so a failed upload is retried next run.
 */
export function scanDocuments(config: WorklogConfig, state: WorklogState): ScannedDocument[] {
  const documents: ScannedDocument[] = [];

  for (const workspace of config.workspaces) {
    for (const directory of config.documentDirectories) {
      const absoluteDirectory = join(workspace.rootPath, directory);
      // A declared directory that is itself a symlink would escape the
      // workspace boundary — only real directories are walked.
      try {
        if (lstatSync(absoluteDirectory).isSymbolicLink()) continue;
      } catch {
        continue;
      }
      for (const filePath of walk(absoluteDirectory)) {
        const extension = filePath.slice(filePath.lastIndexOf("."));
        if (!DOCUMENT_EXTENSIONS.has(extension)) continue;

        const stats = lstatSync(filePath);
        if (stats.size > config.maxDocumentBytes) continue;

        const content = readFileSync(filePath, "utf8");
        const hash = createHash("sha256").update(content).digest("hex");
        const refPath = relative(workspace.rootPath, filePath);
        if (state.documents[filePath]?.hash === hash) continue;

        documents.push({
          filePath,
          hash,
          upload: {
            workspaceKey: workspace.workspaceKey,
            title: basename(filePath),
            refPath,
            content: redact(content),
            capturedAt: stats.mtime.toISOString(),
          },
        });
      }
    }
  }

  return documents;
}

function* walk(directory: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolute = join(directory, entry);
    let stats;
    try {
      // lstat, not stat: a symlink inside the workspace can point anywhere on
      // the machine, and following it would read outside the declared boundary.
      stats = lstatSync(absolute);
    } catch {
      continue;
    }
    if (stats.isSymbolicLink()) continue;
    if (stats.isDirectory()) {
      yield* walk(absolute);
    } else if (stats.isFile()) {
      yield absolute;
    }
  }
}
