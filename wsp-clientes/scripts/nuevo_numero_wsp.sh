#!/bin/bash
# =============================================================
# nuevo_numero_wsp.sh
# Script para desplegar una nueva instancia WhatsApp en el VPS
#
# USO:
#   bash nuevo_numero_wsp.sh <nombre> <puerto>
#
# EJEMPLO:
#   bash nuevo_numero_wsp.sh wsp-rrhh 3002
#
# Requisitos previos:
#   - El código fuente ya fue copiado al VPS via GitHub Actions
#   - El archivo .env ya fue creado en /var/www/<nombre>/
#   - La columna reset_solicitado ya existe en wsp_sesion_vps_
# =============================================================

set -e

NOMBRE="${1:-wsp-nueva}"
PUERTO="${2:-3002}"
BASE_DIR="/var/www"
SOURCE_DIR="$BASE_DIR/wsp-clientes"   # Copiar desde la instancia base
TARGET_DIR="$BASE_DIR/$NOMBRE"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Nueva instancia WhatsApp: $NOMBRE"
echo "  Puerto: $PUERTO"
echo "  Directorio: $TARGET_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Copiar archivos fuente desde instancia base
echo ""
echo "📁 Copiando archivos desde $SOURCE_DIR..."
cp -r "$SOURCE_DIR/src" "$TARGET_DIR/"
cp "$SOURCE_DIR/package.json" "$TARGET_DIR/"
cp "$SOURCE_DIR/package-lock.json" "$TARGET_DIR/" 2>/dev/null || true

# 2. Instalar dependencias
echo ""
echo "📦 Instalando dependencias npm..."
cd "$TARGET_DIR"
npm install --production

# 3. Crear .env si no existe
if [ ! -f "$TARGET_DIR/.env" ]; then
    echo ""
    echo "⚙️  Creando .env de ejemplo..."
    cat > "$TARGET_DIR/.env" << EOF
API_BASE_URL=https://api.batidospitaya.com
WSP_TOKEN=CAMBIAR_POR_TOKEN_UNICO_DE_ESTA_INSTANCIA
PORT=$PUERTO
HORA_INICIO_ENVIO=08:00
HORA_FIN_ENVIO=20:00
MAX_MENSAJES_DIA=150
MAX_MENSAJES_POR_HORA=50
DELAY_MIN_SEGUNDOS=8
DELAY_MAX_SEGUNDOS=25
EOF
    echo "   ⚠️  Edita $TARGET_DIR/.env con el token correcto antes de arrancar"
fi

# 4. Crear carpeta de logs
mkdir -p "$TARGET_DIR/logs"

# 5. Agregar al PM2 usando ecosystem temporal (--out/--error no existen como flags en PM2 moderno)
echo ""
echo "🔧 Registrando en PM2..."
cat > "$TARGET_DIR/ecosystem.config.js" << ECOEOF
module.exports = {
  apps: [{
    name:             '${NOMBRE}',
    script:           'src/app.js',
    cwd:              '${TARGET_DIR}',
    watch:            false,
    instances:        1,
    exec_mode:        'fork',
    autorestart:      true,
    max_restarts:     10,
    restart_delay:    10000,
    max_memory_restart: '800M',
    env: {
      NODE_ENV:      'production',
      PORT:          ${PUERTO},
      WSP_INSTANCIA: '${NOMBRE}'
    },
    out_file:        './logs/out.log',
    error_file:      './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs:      true
  }]
};
ECOEOF

pm2 start "$TARGET_DIR/ecosystem.config.js"
pm2 save

echo ""
echo "✅ Instancia '$NOMBRE' creada en puerto $PUERTO"
echo ""
echo "Próximos pasos:"
echo "  1. Editar .env:  nano $TARGET_DIR/.env"
echo "  2. Reiniciar:    pm2 restart $NOMBRE"
echo "  3. Ver logs:     pm2 logs $NOMBRE --lines 20"
echo "  4. Abrir QR:     desde el ERP, módulo correspondiente"
