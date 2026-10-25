/**
 * Canonical on-disk locations of the module install state, shared by the
 * newbie CLI (which writes and validates them) and the runtime module-hub
 * reporter (which reads them from inside a running process).
 *
 * All paths are relative to the consuming project root.
 */

/** Project-root install manifest (shadcn components.json style). */
export const MODULES_JSON = "modules.json";

/** Directory where assembled modules live in a consuming project. */
export const MODULES_DIR = "src/modules";

/** Manifest every module directory carries inside the registry / project. */
export const MODULE_MANIFEST_FILE = "newbie.module.json";
