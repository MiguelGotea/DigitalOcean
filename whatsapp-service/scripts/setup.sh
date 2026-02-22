#!/bin/bash
# ============================================================
# setup.sh — Instalación inicial del VPS DigitalOcean
# Ejecutar: bash setup.sh
# Sistema: Ubuntu 22.04 LTS
# ============================================================

set -e   # Detener en el primer error

echo "============================================"
echo " 🚀 Pitaya WhatsApp Service — Setup VPS"
echo "============================================"

# ── Actualizar sistema ──
echo "📦 Actualizando sistema..."
apt-get update -y && apt-get upgrade -y

# ── Node.js 20 LTS ──
echo "📦 Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
echo "   Node.js: $(node --version)"
echo "   npm:     $(npm --version)"

# ── PM2 (gestor de procesos) ──
echo "📦 Instalando PM2..."
npm install -g pm2
pm2 startup systemd -u root --hp /root
echo "   PM2: $(pm2 --version)"

# ── Dependencias de Chromium para Puppeteer ──
echo "📦 Instalando dependencias Chromium..."
apt-get install -y \
    chromium-browser \
    libglib2.0-0 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2

echo "   Chromium: $(chromium-browser --version 2>/dev/null || echo 'Instalado')"

# ── Zona horaria Nicaragua ──
echo "🕐 Configurando zona horaria (America/Managua)..."
timedatectl set-timezone America/Managua
echo "   Zona: $(timedatectl | grep 'Time zone')"

# ── Directorio del servicio ──
echo "📁 Creando directorio del servicio..."
mkdir -p /var/www/whatsapp-service/logs

# ── Firewall ──
echo "🔒 Configurando firewall (UFW)..."
ufw --force enable
ufw allow 22/tcp   comment 'SSH'
ufw deny  3001/tcp comment 'API interna - solo localhost'
echo "   Firewall activo"

echo "============================================"
echo "✅ Setup completado!"
echo ""
echo "SIGUIENTES PASOS:"
echo "1. Copiar archivos del servicio a /var/www/whatsapp-service/"
echo "2. cp .env.example .env && nano .env  (configurar WSP_TOKEN)"
echo "3. npm install --production"
echo "4. pm2 start ecosystem.config.js"
echo "5. pm2 save"
echo "============================================"
