import { format as prettierFormat, resolveConfig } from "prettier";

/**
 * Format generated code with prettier.
 *
 * When the output file path is known, the consumer project's own prettier
 * config is resolved from it (resolveConfig walks up from the file location),
 * so generated code lands clean under the consumer's `prettier --check`. When
 * the consumer has no config, pure prettier defaults are used, mirroring what
 * the consumer's own prettier would produce. `filepath` is always set so
 * prettier infers the parser from the extension and applies any matching
 * `overrides` from the consumer config.
 *
 * @param content code to format
 * @param filePath output file path used to resolve the consumer config
 * @returns formatted code
 * @see https://prettier.io/docs/en/options.html
 */
export async function formatContent(content: string, filePath?: string): Promise<string> {
  if (!filePath) {
    // No path to resolve a config from: format with pure prettier defaults.
    // prettier 3 made `format` asynchronous; callers must await the result.
    return prettierFormat(content, { parser: "babel-ts" });
  }
  const consumerConfig = (await resolveConfig(filePath)) ?? {};
  return prettierFormat(content, { ...consumerConfig, filepath: filePath });
}

/**
 * Generate the banner comment placed at the top of every generated file.
 * @returns banner comment
 */
export function generatedFileBanner(): string {
  return `
  /**
   * Created By @devbie/apits
   */

  `;
}
