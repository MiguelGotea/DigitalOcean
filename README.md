# 🚀 DigitalOcean — Pitaya WhatsApp Service

Servicio de mensajería WhatsApp para Batidos Pitaya.
Arquitectura **multi-instancia**: cada número WhatsApp corre como proceso PM2 independiente en el mismo VPS.

---

## Arquitectura Triangular

```
ERP (erp.batidospitaya.com / Hostinger)
       ↓ escribe datos en BD MySQL
api.batidospitaya.com/api/wsp/   ← puente central (PHP)
       ↑ polling cada 60s
VPS DigitalOcean — múltiples instancias Node.js + whatsapp-web.js
   ├── wsp-clientes  :3001  → Campañas de marketing a clientesclub
   ├── wsp-crmbot    :3003  → Bot CRM automatizado
   └── wsp-planilla  :3005  → Notificaciones de planilla a colaboradores
       ↓ envía mensajes
WhatsApp Web
```

> **¿Por qué triangular?** Hostinger no permite conexiones salientes persistentes ni ejecutar Node.js. La API actúa de puente: el VPS hace polling, nunca el ERP.

---

## Estructura del repositorio

```
.github/workflows/deploy-vps.yml        # CI/CD: push → rsync al VPS → PM2 reload
scripts/
├── setup.sh                            # Instalación VPS Ubuntu (ejecutar UNA VEZ)
└── test_api_connection.js              # Diagnóstico: verifica conectividad VPS → API
wsp-clientes/                           # PM2 :3001 — Campañas marketing (AUTÓNOMA)
├── src/
│   ├── app.js                          # Solo arranca campaign_worker
│   ├── config/api.js
│   ├── whatsapp/  (client.js, sender.js)
│   └── workers/campaign_worker.js
├── .env.example
├── ecosystem.config.js                 # Config PM2 solo de esta instancia
└── package.json
wsp-crmbot/                             # PM2 :3003 — Bot CRM (AUTÓNOMA)
├── src/
│   ├── app.js                          # Solo arranca crm_bot_worker
│   ├── config/api.js
│   ├── nlp/  (TF-IDF, Naive Bayes — exclusivo de este bot)
│   ├── whatsapp/  (client.js, sender.js)
│   └── workers/crm_bot_worker.js
├── .env.example
├── ecosystem.config.js                 # Config PM2 solo de esta instancia
└── package.json
wsp-planilla/                           # PM2 :3005 — Notif. planilla (AUTÓNOMA)
├── src/
│   ├── app.js                          # Solo arranca planilla_worker
│   ├── config/api.js
│   ├── whatsapp/  (client.js, sender.js)
│   └── workers/planilla_worker.js
├── .env.example
├── ecosystem.config.js                 # Config PM2 solo de esta instancia
└── package.json
```

> **Principio de independencia:** Cada `wsp-*/src/` es completamente autónomo. No comparte archivos con ninguna otra instancia. Borrar una no afecta las demás.

### Estructura en el VPS (`/var/www/`)

```
/var/www/
├── wsp-clientes/          # PM2: wsp-clientes :3001
│   ├── src/               # ← sincronizado desde GitHub
│   ├── .env               # NO en GitHub — configurar manualmente una vez
│   ├── .wwebjs_auth_wsp-clientes/  # Sesión WhatsApp — NO en GitHub
│   └── logs/
├── wsp-crmbot/            # PM2: wsp-crmbot :3003
│   ├── src/
│   ├── .env
│   └── logs/
├── wsp-planilla/          # PM2: wsp-planilla :3005
│   ├── src/
│   ├── .env
│   └── logs/
└── whatsapp-service/      # ⚠️ RESIDUAL — puede borrarse: rm -rf /var/www/whatsapp-service
```

---

## Instancias activas

| Nombre PM2 | Puerto | Uso | Estado |
|-----------|--------|-----|--------|
| `wsp-clientes` | 3001 | Campañas de marketing a `clientesclub` | ✅ Activo |
| `wsp-crmbot`   | 3003 | Bot CRM automatizado con NLP | ✅ Activo |
| `wsp-planilla` | 3005 | Notificaciones de planilla a `Operarios` | ✅ Activo |

---

## Cómo agregar una nueva instancia

> **Todo desde GitHub. Cero SSH para código.** Solo se usa SSH una vez al crear la instancia.

### En GitHub (VS Code local)

1. Crear carpeta `DigitalOcean/wsp-nueva/` con su propio código:
   - `src/app.js` — solo importa el worker de esta instancia
   - `src/workers/nuevo_worker.js` — lógica de polling a la API
   - `src/whatsapp/client.js`, `sender.js` — copiados y adaptados
   - `src/config/api.js`
   - `.env.example` — con `PORT=XXXX` y `WSP_INSTANCIA=wsp-nueva`
   - `ecosystem.config.js` — solo el bloque de esta instancia
   - `package.json`

2. En `.github/workflows/deploy-vps.yml`, agregar bloque rsync y PM2 restart:
   ```yaml
   - name: 📤 Deploy wsp-nueva → /var/www/wsp-nueva/
     run: |
       rsync -avz \
         --exclude='node_modules/' --exclude='logs/' --exclude='.env' --exclude='.wwebjs_auth*' \
         -e "ssh -o StrictHostKeyChecking=no" \
         ./wsp-nueva/ ${{ secrets.DO_USER }}@${{ secrets.DO_HOST }}:/var/www/wsp-nueva/
   ```
   ```yaml
   pm2 restart wsp-nueva --update-env || true
   ```

3. Hacer push → GitHub Actions despliega el código automáticamente.

### En el VPS (SSH — solo una vez)

```bash
# Instalar dependencias (primera vez)
cd /var/www/wsp-nueva
npm install --production

# Configurar variables
cp .env.example .env && nano .env
# Llenar: WSP_TOKEN (token único), PORT, WSP_INSTANCIA

# Registrar en PM2
pm2 start ecosystem.config.js
pm2 save
```

**Después de esto: solo push. PM2 lo reinicia automáticamente en cada deploy.**

### Checklist nueva instancia

- [ ] Puerto único no usado (3007, 3009…)
- [ ] Token único en `.env` — la API lo usa para identificar la instancia
- [ ] `clientId` único en `client.js` → `LocalAuth({ clientId: 'wsp-nueva' })`
- [ ] Workers propios — sin importar archivos de otras instancias
- [ ] Endpoints API propios en `api.batidospitaya.com/api/wsp/`
- [ ] Tool ERP registrado en `tools_erp` con permisos
- [ ] Escanear QR para vincular número desde el ERP

---

## GitHub Secrets requeridos

| Secret | Valor |
|--------|-------|
| `DO_SSH_KEY` | Clave privada SSH del Droplet |
| `DO_HOST` | IP del Droplet |
| `DO_USER` | `root` |

---

## Setup inicial VPS (solo una vez para un Droplet nuevo)

```bash
ssh root@<IP_DROPLET>

# Ejecutar el script de setup (instala Node.js 20, PM2, Chrome, configura firewall)
bash /var/www/wsp-clientes/scripts/setup.sh
# ⚠️ Este script asume que el código ya fue desplegado via GitHub Actions
```

---

## Variables de entorno (.env por instancia)

```env
API_BASE_URL=https://api.batidospitaya.com
WSP_TOKEN=<token_unico_de_esta_instancia>
WSP_INSTANCIA=wsp-clientes          # nombre del proceso PM2
PORT=3001                           # puerto único
HORA_INICIO_ENVIO=07:00             # horario de envío (00:00 = sin límite inferior)
HORA_FIN_ENVIO=20:00                # (24:00 = sin límite superior, modo pruebas)
MAX_MENSAJES_DIA=150
MAX_MENSAJES_POR_HORA=50
DELAY_MIN_SEGUNDOS=8
DELAY_MAX_SEGUNDOS=25
```

---

## Anti-ban configurado

| Medida | Valor |
|--------|-------|
| Delay entre mensajes | 8–25s aleatorio |
| Máx. mensajes/día | 150–200 (configurable por `.env`) |
| Máx. mensajes/hora | 50 (configurable por `.env`) |
| Horario de envío | **wsp-clientes** y **wsp-planilla**: sin restricción (`HORA_FIN=24:00`) |
| | **wsp-crmbot**: 07:00–20:00 (el bot responde en horario de atención) |
| Sesión persistente | `LocalAuth` — no re-escanea QR salvo desconexión |
| Variables disponibles | `{{nombre}}`, `{{sucursal}}`, `{{fecha_planilla}}` |

> ⚠️ Usar número **dedicado** al negocio, no personal.

---

## Endpoints de la API Bridge (`api.batidospitaya.com/api/wsp/`)

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `ping.php` | GET | No | Health check |
| `status.php` | GET | No | Estado VPS |
| `pendientes.php` | GET | Token | Campañas marketing pendientes |
| `actualizar.php` | POST | Token | VPS reporta resultado por destinatario |
| `pendientes_planilla.php` | GET | Token | Notificaciones de planilla pendientes |
| `actualizar_planilla.php` | POST | Token | VPS reporta resultado de planilla |
| `registrar_sesion.php` | POST | Token | Heartbeat + estado + QR base64 |

---

## Comandos PM2 de referencia

```bash
pm2 status                                  # Ver todas las instancias activas
pm2 logs wsp-clientes --lines 30            # Logs de una instancia
pm2 restart wsp-clientes --update-env       # Reiniciar recargando .env
pm2 stop wsp-planilla                       # Detener sin afectar otras
pm2 delete wsp-planilla                     # Eliminar instancia de PM2
free -h                                     # Verificar RAM y swap
curl http://localhost:3001/health           # Health check interno
```

```bash
# Si la sesión WhatsApp se corrompió — forzar nuevo QR
pm2 stop wsp-clientes
rm -rf /var/www/wsp-clientes/.wwebjs_auth_wsp-clientes
pm2 restart wsp-clientes --update-env
# Escanear QR desde el ERP (badge → click o modal QR)
```

---

## Cambio de Número WhatsApp

### Flujo

```
ERP → clic "Cambiar Número"
    ↓ AJAX escribe reset_solicitado = 1 en wsp_sesion_vps_
    ↓ badge cambia a 🟠 "Cambiando número..."
    ↓ ~60s
VPS worker → detecta reset_solicitado = 1 en heartbeat
    ↓ client.destroy() → rm -rf .wwebjs_auth → reinicia
    ↓ genera nuevo QR
ERP → modal QR abre automáticamente
    ↓ usuario escanea con nuevo número
badge → 🟢 Conectado
```

### Estados del badge

| Estado | Color | Significado |
|--------|-------|-------------|
| `conectado` | 🟢 Verde | WhatsApp vinculado y listo |
| `qr_pendiente` | 🟡 Amarillo | Esperando escaneo QR |
| `reset_pendiente` | 🟠 Naranja | Cambio en proceso |
| `desconectado` | 🔴 Rojo | VPS caído o sin heartbeat |

---

## 🔴 Problemas encontrados en producción

### 1. Chromium Snap no funciona como root (Ubuntu 24.04)

**Síntoma:** `Command '/usr/bin/chromium-browser' requires the chromium snap to be installed`

**Solución:** Instalar Google Chrome `.deb` oficial:
```bash
wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
apt install -y /tmp/chrome.deb
```

`client.js` detecta automáticamente el navegador en este orden:
```
/usr/bin/google-chrome-stable → /usr/bin/google-chrome → /usr/bin/chromium
```

---

### 2. `--single-process` crashea Chrome moderno

**Causa:** Flag deprecado. Combinado con `--no-zygote` provoca crash inmediato.

**Args correctos para VPS Ubuntu (root):**
```js
args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--disable-accelerated-2d-canvas', '--no-first-run',
    '--disable-extensions', '--disable-background-networking',
    '--metrics-recording-only', '--js-flags=--max-old-space-size=512'
]
```

---

### 3. RAM insuficiente en Droplet 1GB

**Causa:** Chrome headless necesita ~400-500MB en el pico de inicio.

**Solución:** 2GB de swap (persiste entre reinicios):
```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

> Para 2+ instancias simultáneas se recomienda upgrade a Droplet 2GB RAM (~$6/mes).

---

### 4. Badge ERP muestra "Desconectado" aunque el VPS esté activo

**Causa:** `status.php` considera inactivo si `ultimo_ping` tiene >2 minutos.

**Solución ya implementada:** Heartbeat en `app.js` cada 60s via `reportarEstadoVPS()`.

---

### 5. Imágenes fallan — "Invalid URL"

**Causa:** `imagen_url` guardada como ruta relativa en la BD (ej: `/modulos/.../img.jpg`).

**Solución en `pendientes.php`:**
```php
if (!empty($campana['imagen_url']) && str_starts_with($campana['imagen_url'], '/')) {
    $campana['imagen_url'] = 'https://erp.batidospitaya.com' . $campana['imagen_url'];
}
```

---

### 6. Token 401 en test_endpoints.php

**Solución:** Importar `auth.php` en lugar de hardcodear el token:
```php
require_once __DIR__ . '/auth.php';
$TOKEN = WSP_TOKEN_SECRETO;
```

---

### 7. Endpoints con MySQLi en proyecto PDO

| MySQLi | PDO equivalente |
|--------|----------------|
| `bind_param('si', $a, $b)` | `execute([':a' => $a, ':b' => $b])` |
| `get_result()->fetch_all()` | `fetchAll()` |
| `affected_rows` | `rowCount()` |
| `insert_id` | `$conn->lastInsertId()` |
| `begin_transaction()` | `$conn->beginTransaction()` |

> ⚠️ LIMIT con PDO **requiere** `PDO::PARAM_INT` explícito en `bindValue`.

---

### 8. Bloqueo en `initialize()` — WhatsApp Web Protocol

**Causa:** Versión de `whatsapp-web.js` obsoleta.

**Solución:** Actualizar a `whatsapp-web.js@^1.34.6` o superior. Al actualizar, borrar `node_modules` y `package-lock.json` en el VPS antes de `npm install`.

---

### 9. Estabilidad con múltiples instancias en paralelo

1. **RAM**: Obligatorio upgrade a 2GB Droplet para 2+ instancias simultáneas.
2. **Aislamiento de sesión**: Cada instancia usa `LocalAuth({ clientId: 'wsp-NOMBRE' })`.
3. **SingletonLock**: `client.js` limpia automáticamente locks de Chrome al arrancar.

---

### 10. `Target closed` o `Browser closed`

**Causa:** Chrome matado por OOM Killer.

**Diagnóstico:** `dmesg | grep -i oom`

**Fix:** Verificar swap activo (`free -h`), asegurar `--disable-gpu` y `--no-sandbox` presentes.

---

### 11. Mantenimiento de Chrome y whatsapp-web.js

```bash
# Actualizar Chrome si deja de conectar
apt update && apt install --only-upgrade google-chrome-stable

# Actualizar whatsapp-web.js (requiere limpiar node_modules en VPS)
# En package.json: "whatsapp-web.js": "^1.34.6"
# En VPS:
rm -rf node_modules package-lock.json && npm install --production
```

```bash
# Rotar logs si crecen mucho
pm2 install pm2-logrotate
```

---

### 12. `🌙 Fuera del horario de envío` — .env no actualiza con pm2 restart

**Causa:** `pm2 restart` sin `--update-env` no recarga el `.env`. Además, `HORA_INICIO=00:00` → `parseInt('00') || 7 = 7` por falsy.

**Solución:**
```bash
pm2 restart wsp-planilla --update-env
```
**Y en código:** usar `??` en lugar de `||` para los valores de hora:
```js
const hI = parseInt(process.env.HORA_INICIO_ENVIO?.split(':')[0] ?? '7');
```
> `HORA_FIN_ENVIO=24:00` desactiva el límite superior de horario (útil para pruebas).
