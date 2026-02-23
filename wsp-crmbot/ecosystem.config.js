/**
 * ecosystem.config.js — PM2 multi-instance config
 *
 * Arquitectura: Opción A — cada número WhatsApp corre como proceso PM2 independiente
 * en el mismo VPS pero con puerto y sesión propios.
 *
 * Instancias activas:
 *   wsp-clientes  → Puerto 3001 → Campañas de marketing a clientesclub
 *   wsp-crmbot    → Puerto 3003 → Bot CRM híbrido (keywords + TF-IDF + Naive Bayes)
 * 
 * Para agregar un número nuevo, copiar el bloque y cambiar:
 *   - name          → nombre único del proceso PM2
 *   - cwd           → ruta de la nueva instancia en el VPS
 *   - env.PORT      → puerto único (3002, 3003, ...)
 *   - env.WSP_TOKEN → token diferente por instancia (definido en cada .env)
 *
 * Ver README.md → "Múltiples Números WhatsApp" para instrucciones completas.
 */

module.exports = {
  apps: [

    // ── Instancia 1: Marketing / Campañas a clientes ──────────────────────
    {
      name: 'wsp-clientes',
      script: 'src/app.js',
      cwd: '/var/www/wsp-clientes',   // ruta en el VPS
      watch: false,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        PORT: 3001
        // El resto de variables se leen del .env en cada carpeta
      },
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    },

    // ── Instancia 2 (FUTURA): RRHH / Planillas a colaboradores ────────────
    // Descomentar cuando se vaya a implementar. Ver README para setup.
    //
    // {
    //   name:          'wsp-rrhh',
    //   script:        'src/app.js',
    //   cwd:           '/var/www/wsp-rrhh',
    //   watch:         false,
    //   instances:     1,
    //   autorestart:   true,
    //   max_restarts:  10,
    //   restart_delay: 5000,
    //   env: {
    //     NODE_ENV: 'production',
    //     PORT:     3002
    //   },
    //   out_file:        './logs/out.log',
    //   error_file:      './logs/error.log',
    //   log_date_format: 'YYYY-MM-DD HH:mm:ss',
    //   merge_logs:      true
    // },

    // ── Instancia 3: CRM Bot (Bot híbrido WhatsApp) ───────────────────────
    // Usa bot de intenciones con keywords + TF-IDF + Naive Bayes
    // Setup VPS: ver multi_instancia_wsp.sql y README para configurar .env
    {
      name: 'wsp-crmbot',
      script: 'src/app.js',
      cwd: '/var/www/wsp-crmbot',
      watch: false,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        PORT: 3003
      },
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    },

  ]
};

