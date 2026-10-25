#!/usr/bin/env node
import { red } from "colorette";

import { buildProgram } from "./program";

buildProgram()
  .parseAsync(process.argv)
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${red("error")} ${message}`);
    process.exit(1);
  });
