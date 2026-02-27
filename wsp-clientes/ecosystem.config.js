/**
 * ecosystem.config.js — PM2 multi-instance config
 *
 * Arquitectura: Opción A — cada número WhatsApp corre como proceso PM2 independiente
 * en el mismo VPS pero con puerto y sesión propios.
 *
 * Instancias activas:
 *   wsp-clientes  → Puerto 3001 → Campañas de marketing a clientesclub
 *   wsp-crmbot    → Puerto 3003 → Bot CRM híbrido (keywords + TF-IDF + Naive Bayes)
 *   wsp-planilla  → Puerto 3005 → Notificaciones de planilla a colaboradores (Operarios)
 * 
 * Para agregar un número nuevo, copiar el bloque y cambiar:
 *   - name             → nombre único del proceso PM2
 *   - cwd              → ruta de la nueva instancia en el VPS
 *   - env.PORT         → puerto único (3002, 3004, ...)
 *   - env.WSP_INSTANCIA → nombre de la instancia
 *
 * Ver README.md → "Múltiples Números WhatsApp" para instrucciones completas.
 */

module.exports = {
  apps: [

    // ── Instancia 1: Marketing / Campañas a clientes ──────────────────────
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
        WSP_INSTANCIA: 'wsp-clientes'
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
    },

    // ── Instancia 4: Planilla — Notificaciones a colaboradores ───────────
    // Envía WhatsApp a Operarios cuando su boleta de pago está disponible.
    // ERP: modulos/rh/planilla_wsp.php  |  API: /api/wsp/pendientes_planilla.php
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
    },

  ]
};
