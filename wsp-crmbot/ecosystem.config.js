/**
 * ecosystem.config.js — Configuración PM2 de Wsp-CrmBot
 * Esta instancia maneja únicamente el bot CRM (keywords + TF-IDF + Naive Bayes).
 * 
 * VPS: pm2 start /var/www/wsp-crmbot/ecosystem.config.js
 */

module.exports = {
  apps: [
    {
      name: 'wsp-crmbot',
      script: 'src/app.js',
      cwd: '/var/www/wsp-crmbot',
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 10000,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
        WSP_INSTANCIA: 'wsp-crmbot'
      },
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    }
  ]
};
