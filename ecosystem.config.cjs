module.exports = {
  apps: [
    {
      name: "x-reply-bot",
      script: "npx",
      args: "trigger.dev@latest dev --profile xreply",
      cwd: "/Users/suresh/x-reply-bot",
      autorestart: true,
      watch: false,
      max_restarts: 50,
      min_uptime: "30s",
      restart_delay: 10_000,
      kill_timeout: 15_000,
      out_file: "/Users/suresh/x-reply-bot/data/pm2.out.log",
      error_file: "/Users/suresh/x-reply-bot/data/pm2.err.log",
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "production",
        PATH: process.env.PATH,
      },
    },
  ],
};
