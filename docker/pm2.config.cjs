const noGateway = /^(1|true|yes)$/i.test(process.env.LLMR_NO_GATEWAY || "");
const serverArgs = [
  "--host",
  process.env.LLMR_WEB_HOST || "127.0.0.1",
  "--port",
  process.env.LLMR_WEB_PORT || "3459",
  "--no-open"
];

if (noGateway) {
  serverArgs.push("--no-gateway");
}

module.exports = {
  apps: [
    {
      name: "llmr-server",
      script: "/app/packages/core/dist/main/server.js",
      args: serverArgs,
      cwd: "/app",
      interpreter: "node",
      env: {
        ...process.env,
        NODE_ENV: "production"
      }
    },
    {
      name: "llmr-nginx",
      script: "/usr/sbin/nginx",
      args: ["-g", "daemon off; pid /run/nginx/nginx.pid;"],
      cwd: "/app",
      interpreter: "none"
    }
  ]
};
