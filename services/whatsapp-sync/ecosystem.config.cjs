// PM2 process definition for the WhatsApp sync worker.
//
// This exists specifically to bound PM2's restart behavior on Windows. The
// previous ad-hoc `pm2 start` had no restart limits, so when the machine woke
// from sleep and PM2 lost track of the still-running child (a known PM2 /
// Windows-sleep interaction), it respawned the process in an unbounded loop,
// each attempt flashing a console window for a fraction of a second. With
// `max_restarts` + `exp_backoff_restart_delay`, a crash loop now backs off and
// gives up after a bounded number of tries instead of running until someone
// notices and force-kills it.
module.exports = {
  apps: [
    {
      name: "closefy-whatsapp",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/index.ts",
      cwd: __dirname,
      windowsHide: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: 15_000,
      exp_backoff_restart_delay: 2_000,
      kill_timeout: 5_000,
    },
  ],
};
