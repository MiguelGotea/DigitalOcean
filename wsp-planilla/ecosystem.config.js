/**
 * ecosystem.config.js — Configuración PM2 de Wsp-Planilla
 * Esta instancia maneja únicamente las notificaciones de planilla a colaboradores.
 * 
 * VPS: pm2 start /var/www/wsp-planilla/ecosystem.config.js
 */

module.exports = {
    apps: [
        {
            name: 'wsp-planilla',
            script: 'src/app.js',
            cwd: '/var/www/wsp-planilla',
            watch: false,
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            max_restarts: 10,
            restart_delay: 10000,
            max_memory_restart: '800M',
            env: {
                NODE_ENV: 'production',
                PORT: 3005,
                WSP_INSTANCIA: 'wsp-planilla'
            },
            out_file: './logs/out.log',
            error_file: './logs/error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            merge_logs: true
        }
    ]
};
