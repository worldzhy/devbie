#!/usr/bin/env node
import { run } from "@devbie/cli-kit";

import { buildProgram } from "./program";

void run(async () => {
  await buildProgram().parseAsync(process.argv);
});
