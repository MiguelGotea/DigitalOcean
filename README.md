# 🚀 DigitalOcean — Pitaya WhatsApp Service

Repositorio del servicio de mensajería WhatsApp para Batidos Pitaya.

---

## Arquitectura Triangular

```
ERP (erp.batidospitaya.com / Hostinger)
       ↓ escribe campaña en BD MySQL
api.batidospitaya.com/api/wsp/   ← puente central (PHP)
       ↑ polling cada 60s
VPS DigitalOcean (Node.js + whatsapp-web.js)
       ↓ envía mensajes
WhatsApp Web
```

> **¿Por qué triangular?** Hostinger no permite conexiones salientes persistentes ni ejecutar Node.js. La API actúa de puente: el VPS hace polling, nunca el ERP.

---

## Estructura

```
.github/workflows/deploy-whatsapp.yml   # CI/CD: push → rsync al VPS → PM2 reload
whatsapp-service/
├── src/
│   ├── app.js                          # Entry point (Express :3001 localhost) + heartbeat
│   ├── config/api.js                   # URL base + validación WSP_TOKEN
│   ├── whatsapp/
│   │   ├── client.js                   # Sesión WA (LocalAuth) + eventos + heartbeat exports
│   │   └── sender.js                   # Envío + anti-ban + imágenes
│   └── workers/campaign_worker.js      # Cron cada 60s → polling → envío
├── scripts/
│   ├── setup.sh                        # Instalación en VPS Ubuntu 22/24 desde cero
│   └── test_api_connection.js          # Verifica conectividad VPS → API
├── ecosystem.config.js                 # PM2: modo cluster, logs en ./logs/
└── .env.example                        # Variables requeridas
```

---

## GitHub Secrets requeridos

| Secret | Valor |
|--------|-------|
| `DO_SSH_KEY` | Clave privada SSH del Droplet |
| `DO_HOST` | IP del Droplet |
| `DO_USER` | `root` |
| `DO_PATH` | `/var/www/whatsapp-service` |

---

## Setup inicial VPS

```bash
ssh root@<IP_DROPLET>

# 1. Instalar Chrome (NO usar snap en Ubuntu 24)
wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
apt install -y /tmp/chrome.deb

# 2. Crear swap (obligatorio en Droplet 1GB)
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# 3. Crear .env
cp .env.example .env && nano .env   # llenar WSP_TOKEN

# 4. Instalar deps y arrancar
npm install --production
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

---

## Variables de entorno (.env)

```env
API_BASE_URL=https://api.batidospitaya.com
WSP_TOKEN=<token_secreto_igual_al_de_auth.php>
PORT=3001
HORA_INICIO_ENVIO=08:00
HORA_FIN_ENVIO=20:00
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
| Máx. mensajes/día | 150 |
| Máx. mensajes/hora | 50 |
| Horario de envío | 8am–8pm Nicaragua |
| Sesión persistente | `LocalAuth` — no re-escanea QR salvo desconexión |
| Personalización | Variables `{{nombre}}`, `{{sucursal}}` por destinatario |

> ⚠️ Usar número **dedicado** al negocio, no personal. WhatsApp Business app (Play Store) funciona bien.

---

## Endpoints de la API Bridge

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `ping.php` | GET | No | Health check |
| `status.php` | GET | No | Estado VPS (conectado/qr_pendiente/desconectado) |
| `pendientes.php` | GET | Token | Campañas listas para enviar |
| `actualizar.php` | POST | Token | VPS reporta resultado por destinatario |
| `registrar_sesion.php` | POST | Token | Heartbeat + estado + QR base64 |
| `test_endpoints.php` | GET | — | Página HTML de pruebas |

---

## 🔴 Problemas encontrados en producción

### 1. Chromium Snap no funciona como root (Ubuntu 24.04)

**Síntoma:** `Command '/usr/bin/chromium-browser' requires the chromium snap to be installed`

**Causa:** Ubuntu 24.04 eliminó el paquete `.deb` real de Chromium. `apt install chromium` instala un *stub* que solo invoca snap. Ejecutar snap como root sin sandbox falla internamente aunque se pase `--no-sandbox`.

**Solución:** Instalar Google Chrome desde el `.deb` oficial de Google:
```bash
wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
apt install -y /tmp/chrome.deb
# Ruta: /usr/bin/google-chrome-stable
```

**En `client.js`:** El código detecta automáticamente el navegador disponible en este orden de prioridad:
```js
'/usr/bin/google-chrome-stable',   // preferido
'/usr/bin/google-chrome',
'/usr/bin/chromium',
'/usr/bin/chromium-browser',       // último recurso (puede ser stub)
```

---

### 2. `--single-process` crashea Chrome moderno

**Síntoma:** `TargetCloseError: Protocol error (Page.addScriptToEvaluateOnNewDocument): Session closed`

**Causa:** El flag `--single-process` está deprecado en versiones recientes de Chrome/Chromium. Combinado con `--no-zygote` provoca crash inmediato del proceso del navegador.

**Solución:** Eliminar `--single-process` y `--no-zygote` de los args de puppeteer.

**Args correctos para VPS Ubuntu + root:**
```js
args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--disable-extensions',
    '--disable-background-networking',
    '--metrics-recording-only',
    '--js-flags=--max-old-space-size=512'
]
```

---

### 3. RAM insuficiente en Droplet 1GB

**Síntoma:** Chrome cierra apenas abre (exit code 1 sin mensaje de error claro).

**Causa:** Google Chrome en modo headless necesita ~400-500MB en el pico de inicio. El Droplet de 1GB queda sin memoria.

**Solución:** Crear 2GB de swap (una sola vez, persiste entre reinicios):
```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

> No es necesario upgradar a 2GB RAM. El swap es suficiente para el patrón de uso de campañas (picos cortos, no carga continua).

---

### 4. Badge ERP muestra "Desconectado" aunque el VPS esté activo

**Síntoma:** La página del ERP muestra "servicio desconectado" segundos después de conectar.

**Causa:** `status.php` considera inactivo el VPS si `ultimo_ping` tiene más de 2 minutos de antigüedad. Los eventos de WhatsApp (`ready`, `qr`) solo se disparan al inicio — no hay pings periódicos.

**Solución:** Heartbeat en `app.js` cada 60 segundos:
```js
setInterval(async () => {
    const estado = obtenerEstadoActual();
    await reportarEstadoVPS(estado, null);
}, 60_000);
```

---

### 5. Imágenes no se enviaban — "Invalid URL"

**Síntoma:** Mensajes de texto funcionan. Mensajes con imagen fallan con `Invalid URL` en `wsp_destinatarios_`.

**Causa:** `imagen_url` se guarda en la BD como ruta relativa (`/modulos/marketing/uploads/...`). El VPS recibe esa ruta relativa y `MessageMedia.fromUrl()` falla porque necesita una URL absoluta.

**Solución:** En `pendientes.php`, convertir a URL absoluta antes de enviar al VPS:
```php
if (!empty($campana['imagen_url']) && str_starts_with($campana['imagen_url'], '/')) {
    $campana['imagen_url'] = 'https://erp.batidospitaya.com' . $campana['imagen_url'];
}
```

> **Regla general:** Nunca pasar rutas relativas entre servicios distintos. Siempre URL completa.

---

### 6. Token 401 en test_endpoints.php

**Causa:** El archivo tenía el token hardcodeado con el valor placeholder, no se sincronizaba con `auth.php`.

**Solución:** `test_endpoints.php` ahora importa `auth.php` y lee `WSP_TOKEN_SECRETO` directamente:
```php
require_once __DIR__ . '/auth.php';
$TOKEN = WSP_TOKEN_SECRETO;  // siempre sincronizado
```

---

### 7. Endpoints con MySQLi en proyecto PDO

**Causa:** Los endpoints fueron escritos asumiendo MySQLi (`bind_param`, `get_result`, `fetch_assoc`), pero `conexion.php` en ambos proyectos (ERP y API) usa **PDO**.

**Diferencias clave:**

| MySQLi | PDO equivalente |
|--------|----------------|
| `bind_param('si', $a, $b)` | `execute([':a' => $a, ':b' => $b])` |
| `->get_result()->fetch_all()` | `->fetchAll()` |
| `->affected_rows` | `->rowCount()` |
| `->insert_id` | `$conn->lastInsertId()` |
| `begin_transaction()` | `$conn->beginTransaction()` |
| `rollback()` | `$conn->rollBack()` (camelCase) |
| LIMIT con `bind_param` | `bindValue(':lim', $n, PDO::PARAM_INT)` |

> ⚠️ LIMIT/OFFSET con PDO **requiere** `PDO::PARAM_INT` explícito en `bindValue`. El `execute([])` trata todos los valores como strings y MySQL rechaza LIMIT con strings.

---

## Guía para próximo proyecto: Mensajes a Colaboradores (Operarios)

El próximo módulo enviará mensajes a colaboradores en la tabla `Operarios` en lugar de `clientesclub`. Diferencias a considerar:

### Estructura de datos diferente

```sql
-- clientesclub (actual)
id_clienteclub, nombre, apellido, celular, nombre_sucursal

-- Operarios (próximo)
CodOperario, Nombre, Apellido, Celular, Cargo, CodSucursal
-- Verificar nombre exacto de columnas con: DESCRIBE Operarios;
```

### Adaptaciones necesarias

1. **`campanas_wsp_get_clientes.php`** — cambiar la query para leer de `Operarios` en lugar de `clientesclub`

2. **Variables de mensaje** — agregar `{{cargo}}` además de `{{nombre}}` y `{{sucursal}}`:
   ```js
   // sender.js
   .replace(/\{\{cargo\}\}/gi, datos.cargo || '')
   ```

3. **Nuevos permisos** — crear tool `campanas_wsp_operarios` con sus propias acciones en `tools_erp`

4. **Filtros diferentes** — el filtro por sucursal usará `JOIN` con la tabla de sucursales en lugar de columna directa

5. **Mismo VPS, mismo servicio** — no se necesita un VPS distinto. El mismo `whatsapp-service` sirve para ambos módulos porque la lógica de envío es idéntica. Solo cambia de dónde vienen los destinatarios.

### Reutilizar sin duplicar

- Los endpoints `pendientes.php`, `actualizar.php`, `registrar_sesion.php` **no cambian** — son agnósticos al tipo de destinatario
- Solo cambian los AJAX del ERP que arman la lista de destinatarios
- Considerar agregar un campo `tipo_destinatario` a `wsp_campanas_` si se quiere diferenciar campañas de clientes vs colaboradores en la misma pantalla

---

## Comandos útiles en el VPS

```bash
pm2 status                              # Estado del servicio
pm2 logs whatsapp-service --lines 50    # Ver logs recientes
pm2 restart whatsapp-service            # Reiniciar sin perder sesión WA
pm2 stop whatsapp-service               # Detener (sesión WA se preserva en .wwebjs_auth/)
free -h                                 # Verificar uso de RAM y swap
curl http://localhost:3001/health       # Health check interno
curl http://localhost:3001/status       # Estado de WhatsApp
```

```bash
# Si la sesión WA se corrompió — forzar nuevo QR
pm2 stop whatsapp-service
rm -rf /var/www/whatsapp-service/.wwebjs_auth
pm2 start whatsapp-service
# Escanear QR desde el ERP
```

```bash
# Bajar archivos actualizados desde GitHub (alternativa al CI/CD)
curl -s "https://raw.githubusercontent.com/MiguelGotea/DigitalOcean/main/whatsapp-service/src/app.js" \
     -o /var/www/whatsapp-service/src/app.js
```

---

## Cambio de Número WhatsApp

### ¿Cuándo se necesita?

Cuando se quiere vincular un número diferente al que está actualmente escaneado en el VPS (por ejemplo, pasar del número de prueba al número real del negocio).

### Flujo completo

```
ERP: clic en "🔄 Cambiar Número"
    ↓ (SweetAlert confirma)
ERP AJAX: campanas_wsp_reset_sesion.php
    ↓ escribe reset_solicitado = 1 en wsp_sesion_vps_
ERP Badge: cambia inmediatamente a "🔄 Pendiente de cambio de número..." (naranja girando)
    ↓ espera 65s
VPS Worker: próximo ciclo detecta reset_solicitado = true en pendientes.php
    ↓ llama resetearSesion()
VPS: client.destroy() → rm -rf .wwebjs_auth → setTimeout(iniciarWhatsApp, 3s)
    ↓ genera nuevo QR (~10s después)
ERP: verificarQR() abre el modal QR automáticamente
    ↓ usuario escanea con el nuevo número
ERP Badge: cambia a "✅ WhatsApp Conectado" (verde)
```

### Archivos involucrados

| Archivo | Rol |
|---------|-----|
| `erp/.../campanas_wsp.php` | Botón "Cambiar Número" + `confirmarResetSesion()` JS |
| `erp/.../ajax/campanas_wsp_reset_sesion.php` | Escribe `reset_solicitado = 1` en la BD |
| `api/.../pendientes.php` | Devuelve `reset_solicitado` flag al VPS y lo limpia a 0 |
| `whatsapp-service/workers/campaign_worker.js` | Detecta el flag y llama `resetearSesion()` |
| `whatsapp-service/whatsapp/client.js` | `resetearSesion()`: destruye cliente, borra `.wwebjs_auth`, reinicia |

### SQL requerido (solo la primera vez)

```sql
-- Agregar columna de flag reset en BD
ALTER TABLE wsp_sesion_vps_
    ADD COLUMN reset_solicitado TINYINT(1) NOT NULL DEFAULT 0;

-- Asignar permiso al cargo del usuario autorizado
-- Primero consultar el cargo: SELECT CodOperario, CodNivelesCargos FROM Operarios WHERE Nombre = 'NOMBRE';
INSERT INTO tools_erp (nombre_tool, accion, CodNivelesCargos, permitido)
VALUES ('campanas_wsp', 'resetear_sesion', <<CODIGO_CARGO>>, 1)
ON DUPLICATE KEY UPDATE permitido = 1;
```

### Estados del badge en el ERP

| Estado | Color | Significado |
|--------|-------|-------------|
| `conectado` | 🟢 Verde | WhatsApp vinculado y listo |
| `qr_pendiente` | 🟡 Amarillo | Esperando escaneo de QR |
| `reset_pendiente` | 🟠 Naranja (gira) | Reset solicitado, VPS procesando |
| `desconectado` | 🔴 Rojo | VPS caído o sin heartbeat |

### Troubleshooting

**El badge se queda en "reset_pendiente" más de 2 minutos:**
1. Verificar que el VPS tiene la columna `reset_solicitado` en la BD
2. Verificar que `pendientes.php` está siendo llamado por el worker (revisar logs: `pm2 logs whatsapp-service --lines 30`)
3. Verificar que `campaign_worker.js` importa `resetearSesion` de `client.js`

**No aparece el botón "Cambiar Número":**
- El permiso `resetear_sesion` no está asignado al cargo del usuario
- Correr el SQL de inserción del permiso con el `CodNivelesCargos` correcto

**El QR no aparece después de los 65s:**
- El VPS necesita ~10-15s adicionales para que Chrome cargue y genere el QR
- Hacer clic en el badge (llama `verificarQR()` manualmente) si el modal no abre solo
