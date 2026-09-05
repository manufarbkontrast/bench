#!/usr/bin/env node
// A child that ignores SIGTERM, for proving the runner's SIGKILL escalation actually lands.
process.on("SIGTERM", () => undefined);
console.log("hang-hard: alive, ignoring SIGTERM");
setInterval(() => undefined, 1000);
