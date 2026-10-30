import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import { Logger } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";

const logger = new Logger("PortRace");

/**
 * Port-race recovery for `nest start --watch` under Docker bind mounts.
 *
 * Watch restarts can be messy under bind mounts: duplicate file events may
 * spawn two new processes simultaneously, and the old instance may not release
 * the port promptly. This module handles all three cases:
 *
 *  1. Probe the port; if free, call app.listen(). A listen-time EADDRINUSE
 *     (a sibling bound first between probe and listen) is caught and retried
 *     instead of crashing the process.
 *  2. On the first occupied probe, SIGKILL holders that belong to a PREVIOUS
 *     process generation AND run the same entry script (/proc/<pid>/cmdline).
 *     Same-generation siblings (started within seconds of us) are never killed,
 *     and neither is an unrelated service that merely grabbed the same port.
 *  3. If the port never frees:
 *     - held by a same-generation sibling → that sibling is already serving,
 *       stand down and exit(0) cleanly;
 *     - held by an unkillable stale process → fall back to SO_REUSEPORT.
 *
 * It also registers SIGTERM/SIGINT handlers that close the listening socket
 * and exit immediately. We skip `app.close()` (async lifecycle hooks) because
 * a hanging hook would keep the port bound and break watch restarts. The OS
 * reclaims all resources (DB connections, etc.) when the process exits.
 */

// Reference to the HTTP server, set by listenWithPortRaceRecovery(). Used by
// the signal handlers so they can close the listening socket on shutdown.
let httpServer: http.Server | null = null;

let signalCount = 0;
const handleSignal = () => {
  signalCount++;
  // Second signal: force exit without cleanup.
  if (signalCount >= 2) process.exit(1);
  // Drop active connections and stop listening so the port is released at once.
  httpServer?.closeAllConnections();
  httpServer?.close();
  process.exit(0);
};

let signalHandlersRegistered = false;
function registerSignalHandlersOnce(): void {
  if (signalHandlersRegistered) return;
  signalHandlersRegistered = true;
  process.on("SIGTERM", handleSignal);
  process.on("SIGINT", handleSignal);
}

/**
 * Start the HTTP server with port-race recovery; see the file header for the
 * full strategy. Also registers the fast-shutdown signal handlers.
 */
export async function listenWithPortRaceRecovery(
  app: NestExpressApplication,
  port: number,
  host: string,
  maxRetries = 30,
  retryDelayMs = 200,
): Promise<http.Server> {
  registerSignalHandlersOnce();
  logger.log(`Probing port ${port} availability before listen...`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (await isPortAvailable(port, host)) {
      try {
        // The probe closes microseconds before listen; a sibling can grab the
        // port in that window. Catch the race and keep probing instead of
        // letting the EADDRINUSE crash the process.
        const server = await app.listen(port, host);
        httpServer = server;
        return server;
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code !== "EADDRINUSE") throw err;
        logger.warn(`app.listen() lost the port race on attempt ${attempt}, another instance bound first.`);
        // A sibling just won the bind — stand down immediately instead of
        // retrying for several seconds against a healthy instance.
        standDownIfSiblingWon(port);
      }
    } else {
      logger.warn(`Port ${port} is still in use (probe ${attempt}/${maxRetries}), waiting ${retryDelayMs}ms...`);
      // Only attempt eviction once: only previous-generation holders are
      // killable, so a same-generation sibling left alive is here to stay.
      if (attempt === 1) {
        killStalePortHolders(port);
      } else {
        // From attempt 2 on, a non-stale holder means a sibling won earlier.
        standDownIfSiblingWon(port);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  // Retries exhausted without an identifiable sibling — share the port via
  // SO_REUSEPORT (last resort against an unkillable stale holder).
  logger.warn(`Port ${port} still occupied after ${maxRetries} retries; binding with SO_REUSEPORT.`);
  const server = await listenWithReusePort(app, port, host);
  httpServer = server;
  return server;
}

/**
 * If every current holder of the port started in the same generation as us
 * (i.e. a duplicate watch spawn already won the bind), exit cleanly so only
 * one instance serves. Does nothing while holders are unknown or stale.
 */
function standDownIfSiblingWon(port: number): void {
  const holders = findPortHolderPids(port).filter((pid) => pid !== process.pid);
  if (holders.length === 0) return;
  // A holder running a different entry script is an unrelated service, not a
  // sibling of ours: standing down would leave that foreign process serving
  // our routes, so keep probing instead.
  const foreign = holders.filter((pid) => matchesEntryScript(pid) === false);
  if (foreign.length > 0) {
    logger.warn(
      `Port ${port} is held by unrelated process(es) [${foreign.join(", ")}] running a different entry script; not standing down.`,
    );
    return;
  }
  if (holders.every((pid) => !isPreviousGeneration(pid))) {
    logger.log(`A sibling instance [${holders.join(", ")}] is already serving port ${port}; standing down.`);
    process.exit(0);
  }
}

/**
 * Bind the NestJS app to the port using SO_REUSEPORT (exclusive: false).
 *
 * On Linux this allows two processes to listen on the same port simultaneously.
 * Used as a last-resort fallback when a previous instance refuses to release
 * the port. Requests will be load-balanced across both processes until the
 * stale one is killed.
 */
async function listenWithReusePort(app: NestExpressApplication, port: number, host: string): Promise<http.Server> {
  await app.init();
  const expressApp = app.getHttpAdapter().getInstance();
  const server = http.createServer(expressApp);

  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      server.close();
      reject(err);
    };
    server.once("error", onError);
    server.listen({ port, host, exclusive: false }, () => {
      server.off("error", onError);
      resolve(server);
    });
  });
}

// Clock ticks per second (Linux always exports CLK_TCK; 100 is the universal
// default and getconf is just a defensive read).
const clockTicksPerSecond = (() => {
  try {
    return (
      Number(
        execSync("getconf CLK_TCK", { stdio: ["ignore", "pipe", "ignore"] })
          .toString()
          .trim(),
      ) || 100
    );
  } catch {
    return 100;
  }
})();

// This process's own start time in clock ticks since boot (/proc/self/stat
// field 22). Used to distinguish stale holders from same-generation siblings.
const selfStartTick = readProcessStartTick(process.pid);

// A holder must be at least this much older than us to be considered stale.
// Duplicate watch spawns start within the same second; previous-generation
// processes are typically seconds (often a full recompile) older. 3s cleanly
// separates the two.
const STALE_GENERATION_MARGIN_TICKS = 3 * clockTicksPerSecond;

/**
 * Read a process start time from /proc/<pid>/stat (field 22, clock ticks
 * since boot). Returns null when /proc is unavailable or the process is gone.
 */
function readProcessStartTick(pid: number): number | null {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf-8");
    // Field 2 (comm) may contain spaces/parens, so cut at the LAST ')'.
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    // After removing fields 1-2 (pid, comm), field 22 lands at index 19.
    return Number(fields[19]);
  } catch {
    return null;
  }
}

// Entry script of this process (argv[1]). null for `node -e`, workers and
// other invocations that carry no script path.
const selfEntryScript: string | null = process.argv[1] || null;

/** Read /proc/<pid>/cmdline as an argv array, or null when /proc is unavailable. */
function readProcessCmdline(pid: number): string[] | null {
  try {
    return fs
      .readFileSync(`/proc/${pid}/cmdline`, "utf-8")
      .split("\0")
      .filter((part) => part.length > 0);
  } catch {
    return null;
  }
}

/**
 * The script argument of a node process, skipping the binary path plus any
 * leading flags (`node --enable-source-maps dist/src/main` -> `dist/src/main`).
 */
function entryScriptOf(argv: string[]): string | null {
  for (let i = 1; i < argv.length; i++) {
    if (!argv[i].startsWith("-")) return argv[i];
  }
  return null;
}

/**
 * Whether `pid` runs the same entry script as this process. Returns null when
 * it cannot be determined (no /proc, unreadable cmdline, or this process has
 * no script path), so callers stay conservative and never kill blindly.
 */
function matchesEntryScript(pid: number): boolean | null {
  if (selfEntryScript === null) return null;
  const argv = readProcessCmdline(pid);
  if (argv === null) return null;
  const script = entryScriptOf(argv);
  if (script === null) return false;
  return script === selfEntryScript;
}

/**
 * Whether the given PID belongs to a previous process generation (started
 * noticeably earlier than us AND running the same entry script). Conservative:
 * when the age or the command line cannot be determined (no /proc, process
 * vanished), returns false so we never kill an unrelated process that merely
 * happens to hold the same port.
 */
function isPreviousGeneration(pid: number): boolean {
  if (pid === process.pid || selfStartTick === null) return false;
  const tick = readProcessStartTick(pid);
  if (tick === null) return false;
  if (selfStartTick - tick < STALE_GENERATION_MARGIN_TICKS) return false;
  return matchesEntryScript(pid) === true;
}

/**
 * SIGKILL every previous-generation process holding the given port.
 * Same-generation siblings and ourselves are always spared.
 */
function killStalePortHolders(port: number): void {
  for (const pid of findPortHolderPids(port)) {
    if (pid === process.pid) continue;
    if (!isPreviousGeneration(pid)) {
      logger.log(`Skipping non-stale holder ${pid} of port ${port} (same generation).`);
      continue;
    }
    logger.log(`Killing stale process ${pid} holding port ${port}.`);
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

/**
 * Find PIDs of processes with a listening socket on the given TCP port.
 * Tries `lsof`, `fuser`, then a `/proc/net/tcp` scan (always available on Linux).
 */
function findPortHolderPids(port: number): number[] {
  const pids = new Set<number>();

  // 1) Try lsof
  try {
    const out = execSync(`lsof -ti tcp:${port}`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    out
      .trim()
      .split("\n")
      .map((s: string) => parseInt(s.trim(), 10))
      .filter((n: number) => n > 0)
      .forEach((n: number) => pids.add(n));
  } catch {
    /* lsof unavailable */
  }

  // 2) Try fuser
  try {
    const out = execSync(`fuser ${port}/tcp 2>&1`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    out
      .match(/\d+/g)
      ?.map((s: string) => parseInt(s, 10))
      .filter((n: number) => n > 0)
      .forEach((n: number) => pids.add(n));
  } catch {
    /* fuser unavailable */
  }

  // 3) Fallback: scan /proc/net/tcp (always available on Linux)
  if (pids.size === 0) {
    try {
      const hexPort = port.toString(16).padStart(4, "0").toUpperCase();
      const tcp = fs.readFileSync("/proc/net/tcp", "utf-8");
      // Find listening sockets (state 0A) on our port. Column format:
      // sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode
      const inodes = new Set<string>();
      for (const line of tcp.split("\n").slice(1)) {
        const cols = line.trim().split(/\s+/);
        if (cols.length < 10) continue;
        const local = cols[1]; // address:port in hex
        const state = cols[3];
        const inode = cols[9];
        if (state === "0A" && local.endsWith(":" + hexPort)) {
          inodes.add(inode);
        }
      }
      if (inodes.size > 0) {
        // Walk /proc/*/fd to find which process owns the socket inode.
        const procs = fs.readdirSync("/proc");
        for (const proc of procs) {
          if (!/^\d+$/.test(proc)) continue;
          const pid = parseInt(proc, 10);
          if (pid === process.pid) continue;
          try {
            const fds = fs.readdirSync(`/proc/${proc}/fd`);
            for (const fd of fds) {
              try {
                const link = fs.readlinkSync(`/proc/${proc}/fd/${fd}`);
                const m = link.match(/socket:\[(\d+)\]/);
                if (m && inodes.has(m[1])) {
                  pids.add(pid);
                  break;
                }
              } catch {
                /* permission denied or fd vanished */
              }
            }
          } catch {
            /* process exited or no permission */
          }
        }
      }
    } catch {
      /* /proc not available (non-Linux) */
    }
  }

  // lsof/fuser may list our own PID; the /proc scan already skips it, so
  // filter ourselves uniformly for all callers.
  return [...pids].filter((pid) => pid !== process.pid);
}

/**
 * Probe whether a TCP port is free by briefly binding a throwaway server to it.
 * Returns true if the port is available, false if it is already in use.
 */
function isPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", (err: NodeJS.ErrnoException) => {
      resolve(err.code !== "EADDRINUSE");
    });
    probe.listen(port, host, () => {
      probe.close(() => resolve(true));
    });
  });
}
