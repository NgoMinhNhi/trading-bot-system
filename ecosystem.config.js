module.exports = {
  apps: [
    {
      name: 'mt5-flask-api',
      script: 'mt5-agent/mt5_connect.py',           // ✅ Đây là file Flask
      interpreter: 'python',                          // ✅ Dùng command python đã được test là có sẵn
      cwd: './',
      env: {
        FLASK_ENV: 'production',
        PORT: 3115
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 1000
    }
  ]
};
