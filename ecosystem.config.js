module.exports = {
  apps: [
    {
      name: 'mt5-flask-api',
      script: 'python',
      args: 'mt5-agent/mt5_connect.py', // đường dẫn đến file .py
      interpreter: 'python3', // Hoặc 'python' tùy vào hệ thống
      cwd: './',              // Root folder của dự án (NestJS)
      env: {
        FLASK_ENV: 'production',
        PORT: 3115
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 1000,
    }
  ]
};
