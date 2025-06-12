module.exports = {
  apps: [
    {
      name: "mt5-agent",
      script: "mt5_connect.py",
      interpreter: "python", // hoặc "python" tùy hệ thống
      args: "",
      // cwd: "./mt5-agent", // thư mục chứa file mt5_connect.py
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "development"
      },
      env_production: {
        NODE_ENV: "production"
      }
    }
  ]
};
