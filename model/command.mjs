import { MAX_OUTPUT_CHARS } from "./limits.mjs"

// Keep collected output within the model's limits.
export const MAX_STDOUT_BYTES = MAX_OUTPUT_CHARS
export const MAX_STDERR_BYTES = 4096

// Cap both pipes while preserving producer failures.
export function boundedCommand(argv) {
  const script = "set -o pipefail; " +
    '{ exec "$@" 2>&1 1>&3 | head -c ' + MAX_STDERR_BYTES + " >&2; } 3>&1" +
    " | head -c " + MAX_STDOUT_BYTES
  return ["bash", "-c", script, "caldir-widget"].concat(argv)
}
