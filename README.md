# 🚀 DigitalOcean — Pitaya WhatsApp Service

Repositorio del servicio de mensajería WhatsApp para Batidos Pitaya.

## Arquitectura

```
ERP (erp.batidospitaya.com)
       ↓ escribe campañas en BD
api.batidospitaya.com/api/wsp/   ← puente central
       ↑ polling cada 60s
VPS DigitalOcean (whatsapp-service)
       ↓ envía mensajes
WhatsApp Web (whatsapp-web.js)
```

## Estructura

```
.github/workflows/deploy-whatsapp.yml   # CI/CD automático
whatsapp-service/
├── src/
│   ├── app.js                          # Entry point (Express :3001)
│   ├── config/api.js                   # URL + token de la API
│   ├── whatsapp/
│   │   ├── client.js                   # WhatsApp Web session (LocalAuth)
│   │   └── sender.js                   # Envío + anti-ban
│   └── workers/campaign_worker.js      # Cron job (cada 60s)
├── scripts/
│   ├── setup.sh                        # Instalar en VPS desde cero
│   └── test_api_connection.js          # Test de conectividad
├── ecosystem.config.js                 # PM2 config
└── .env.example                        # Variables de entorno
```

## GitHub Secrets requeridos

| Secret | Descripción |
|--------|-------------|
| `DO_SSH_KEY` | Clave privada SSH del Droplet |
| `DO_HOST` | IP del Droplet |
| `DO_USER` | Usuario SSH (root) |
| `DO_PATH` | Ruta en VPS (ej: `/var/www/whatsapp-service`) |

## Setup inicial del VPS

```bash
# 1. Conectarse al VPS
ssh root@<IP_DROPLET>

# 2. Ejecutar script de instalación
bash setup.sh

# 3. Copiar archivos (o esperar primer deploy de GitHub Actions)
# 4. Configurar .env
cp .env.example .env
nano .env  # completar WSP_TOKEN

# 5. Instalar dependencias y arrancar
npm install --production
pm2 start ecosystem.config.js
pm2 save

# 6. Verificar
curl http://localhost:3001/health
```

## Tests de conectividad

```bash
# Desde el VPS, verificar conexión con la API puente
node scripts/test_api_connection.js

# Desde el navegador, verificar endpoints de la API
https://api.batidospitaya.com/api/wsp/test_endpoints.php
```

## Anti-ban configurado

- ⏱️ Delay entre mensajes: 8–25s aleatorio
- 📊 Máximo 150 mensajes/día
- 🕐 Horario de envío: 8am–8pm (Nicaragua)
- 🔐 Sesión persistente con LocalAuth
