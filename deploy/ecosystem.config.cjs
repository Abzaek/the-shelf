// pm2 process definition for The Shelf on the server.
module.exports = {
  apps: [
    {
      name: "the-shelf",
      script: "server.js",
      cwd: "/home/opc/apps/the-shelf/current",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3002",
        HOSTNAME: "127.0.0.1",
      },
      max_memory_restart: "400M",
    },
  ],
};
