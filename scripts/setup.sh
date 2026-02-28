#!/bin/bash
# ============================================================
# setup.sh — Instalación inicial del VPS DigitalOcean
# Ejecutar UNA SOLA VEZ en un Droplet Ubuntu 22.04 limpio:
#   bash setup.sh
#
# Después de ejecutar este script:
#   1. El código llega automáticamente via GitHub Actions (push)
#   2. Para cada nueva instancia wsp-*:
#      cd /var/www/wsp-nueva && npm install --production
#      cp .env.example .env && nano .env   ← poner WSP_TOKEN y PORT
#      pm2 start ecosystem.config.js && pm2 save
# ============================================================

set -e

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

# ── Google Chrome (para Puppeteer / whatsapp-web.js) ──
echo "📦 Instalando Google Chrome..."
wget -q -O /tmp/google-chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
apt-get install -y /tmp/google-chrome.deb || apt-get install -f -y
rm /tmp/google-chrome.deb
echo "   Chrome: $(google-chrome-stable --version 2>/dev/null || echo 'instalado')"

# ── Dependencias de sistema para Chrome/Puppeteer ──
apt-get install -y \
    libglib2.0-0 libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2

# ── Zona horaria Nicaragua ──
echo "🕐 Configurando zona horaria (America/Managua)..."
timedatectl set-timezone America/Managua
echo "   Zona: $(timedatectl | grep 'Time zone')"

# ── Estructura de directorios ──
echo "📁 Creando estructura /var/www/..."
mkdir -p /var/www/wsp-clientes/logs
mkdir -p /var/www/wsp-crmbot/logs
mkdir -p /var/www/wsp-planilla/logs
echo "   Directorios listos. El código llegará via GitHub Actions."

# ── Firewall: permitir puertos de cada instancia ──
echo "🔒 Configurando firewall (UFW)..."
ufw --force enable
ufw allow 22/tcp    comment 'SSH'
ufw deny  3001/tcp  comment 'wsp-clientes — solo localhost'
ufw deny  3003/tcp  comment 'wsp-crmbot   — solo localhost'
ufw deny  3005/tcp  comment 'wsp-planilla — solo localhost'
echo "   Firewall activo (puertos 3001/3003/3005 solo accesibles localmente)"

echo ""
echo "============================================"
echo "✅ Setup completado!"
echo ""
echo "SIGUIENTES PASOS:"
echo "1. Configurar GitHub Actions secret DO_SSH_KEY con tu clave privada"
echo "2. Hacer push al repositorio → GitHub Actions desplegará el código"
echo "3. Para cada instancia, UNA VEZ por SSH:"
echo "   cd /var/www/wsp-clientes"
echo "   npm install --production"
echo "   cp .env.example .env && nano .env"
echo "   pm2 start ecosystem.config.js && pm2 save"
echo "============================================"
