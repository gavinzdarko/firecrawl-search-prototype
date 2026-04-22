import { spawn } from "node:child_process";

function start(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`${name} exited with signal ${signal}`);
    } else if (code !== 0) {
      console.error(`${name} exited with code ${code}`);
      process.exitCode = code ?? 1;
    }
  });

  return child;
}

const api = start("api", "npm", ["run", "dev"], {
  PROTOTYPE_PORT: process.env.PROTOTYPE_PORT ?? "3000",
  PROTOTYPE_USE_FIXTURES: process.env.PROTOTYPE_USE_FIXTURES ?? "true",
});

const web = start("web", "npm", ["run", "start:web"], {
  PROTOTYPE_WEB_PORT: process.env.PROTOTYPE_WEB_PORT ?? "4173",
});

function shutdown(signal) {
  for (const child of [api, web]) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

