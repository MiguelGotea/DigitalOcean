/**
 * ecosystem.config.js — Configuración PM2 de Wsp-Clientes
 * Esta instancia maneja únicamente las campañas de marketing.
 * 
 * VPS: pm2 start /var/www/wsp-clientes/ecosystem.config.js
 */

module.exports = {
  apps: [
    {
      name: 'wsp-clientes',
      script: 'src/app.js',
      cwd: '/var/www/wsp-clientes',
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 10000,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        WSP_INSTANCIA: 'wsp-clientes',
        // Usar el proxy como punto de entrada a la API
        // api.batidospitaya.com dejó de responder desde el VPS tras la migración del proxy
        API_BASE_URL: 'https://proxy.batidospitaya.com'
      },
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    }
  ]
};
