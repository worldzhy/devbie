/**
 * Resolve the output file path for a generated file.
 */

import path from "path";
import { Config } from "../types";

export const getOutputFilePath = (config: Config, file: string) => {
  const { dir, name } = path.parse(config.output || "");
  return path.join(dir, name, file);
};
