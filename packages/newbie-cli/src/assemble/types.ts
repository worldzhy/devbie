import { ModulesState } from "@devbie/modules-state";

import { ModuleManifest } from "../core/module-manifest";
import { IssueBag } from "../lib/issues";
import { RegistryLocation } from "../lib/registry";
import { Sink } from "../lib/sink";

/** Everything the assemble steps need; commands build it once. */
export interface PipelineContext {
  cwd: string;
  sink: Sink;
  issues: IssueBag;
  state: ModulesState;
  registry: RegistryLocation;
  skipPrismaGenerate?: boolean;
}

/** A module resolved from the consuming project directory after copy. */
export interface ResolvedModule {
  key: string;
  /** Relative to the project root, e.g. "src/modules/account". */
  srcPath: string;
  manifest: ModuleManifest;
}
