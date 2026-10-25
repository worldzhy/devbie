import chalk from "chalk";

/** Log a plain message. */
export function log(message?: any, ...args: any[]): void {
  console.log(message, ...args);
}

/** Log an error message. */
export function error(message?: any, ...args: any[]): void {
  console.error(chalk.magenta(message), ...args);
}

/** Log an info message. */
export function info(message?: any, ...args: any[]): void {
  console.info(chalk.yellowBright(message), ...args);
}

/** Log a warning message. */
export function warn(message?: any, ...args: any[]): void {
  console.warn(chalk.blue(message), ...args);
}

/** Log a soft tip message with a prefix icon. */
export function tips(message?: any, ...args: any[]): void {
  console.log(chalk.yellow(`🔈 ${message}\n`), ...args);
}

/** Log a success message. */
export function success(message?: any, ...args: any[]): void {
  console.log(chalk.cyan(`✓ ${message}`), ...args);
}

/** Print tabular data as a table. */
export function table(tabularData: any, properties?: ReadonlyArray<string>): void {
  console.table(tabularData, properties);
}

/** Print a separator line (or a blank line). */
export function line(blank?: boolean) {
  console.log(`\n${!blank ? "-----------------------" : ""}`);
}
