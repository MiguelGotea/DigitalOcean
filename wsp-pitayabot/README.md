# 🤖 PitayaBot: Manual del Arquitecto y Guía de Desarrollo

PitayaBot es un ecosistema inteligente de asistencia empresarial que extiende las capacidades del ERP de **Batidos Pitaya** hacia WhatsApp. Este documento sirve como el **Blueprint** (plano maestro) para el desarrollo de nuevas herramientas, integraciones de IA y mantenimiento del sistema.

---

## 🏗️ 1. Arquitectura del Sistema (Triangular)

El sistema opera en tres capas aisladas para garantizar estabilidad, seguridad y escalabilidad:

| Capa | Rol | Tecnología | Ubicación |
| :--- | :--- | :--- | :--- |
| **Interface (Cuerpo)** | Gestión de WhatsApp y estados de sesión. | Node.js (wsp-web.js) | VPS DigitalOcean |
| **Lógica (Cerebro)** | Negocio, Conectividad BD, Clasificación IA. | PHP 8.x / PDO | API Hostinger |
| **Control (Panel)** | Monitoreo, Configuración e IA Admin. | HTML/JS/PHP | ERP Panel Admin |

### El Flujo de una Petición
1. **VPS**: Recibe el mensaje → Identifica al operario vía API → Envía a `ia/clasificar.php`.
2. **API**: Clasifica con cascada de LLMs → Extrae "Intent" y "Entidades" (fechas, IDs) → Devuelve JSON.
3. **VPS**: Envía "Frase de Confirmación" al usuario y guarda el **Estado** en BD.
4. **Usuario**: Responde "Sí" o "No".
5. **VPS**: Si es "Sí", ejecuta el handler correspondiente que llama al script PHP final en la API.

---

## 🧠 2. El Estándar de los "Talentos" (Nuevas Funciones)

Para añadir una función nueva (ej. "Resumir mis últimos 5 correos"), se deben seguir estos **3 pasos obligatorios**:

### Paso A: Entrenamiento de Intención (API)
Modificar `api/bot/ia/clasificar.php`.
- Añadir el nuevo intent (ej: `resumen_correos`) al `System Prompt`.
- Definir qué entidades necesita extraer (ej: `destinatario`, `palabras_clave`).

### Paso B: Registro en el Router (VPS)
Modificar `src/bot/messageHandler.js`.
- Añadir el intent al `Set` correspondiente (ej: `INTENTS_CORREOS`).
- Asegurar que el `despacharIntent` envíe la petición al handler correcto.

### Paso C: Lógica de Ejecución (API)
Crear el script en `api/bot/correos/resumir.php`.
- **Patrón de Lectura**: Validar operario → Ejecutar acción (SQL/IMAP) → Retornar JSON.
- **Patrón de IA**: Si necesitas resumir texto, el script PHP debe llamar a un LLM (usando las API Keys de `ia_proveedores_api`) antes de devolver la respuesta al VPS.

---

## 📝 3. Gestión de Interacciones Complejas

PitayaBot maneja dos tipos de flujos de diálogo:

### 1. Confirmación Binaria (Sí/No)
Usado para acciones destructivas o de creación (ej. "Voy a crear la tarea X, ¿Ok?").
- **Backend VPS**: `confirmManager.js`.
- **Base de Datos**: Tabla `ia_confirmaciones_pendientes`.

### 2. Subflujos de Selección (1, 2, 3...)
Usado cuando hay ambigüedad (ej. "Encontré 3 tareas con ese nombre, ¿cuál quieres finalizar?").
- El script PHP devuelve una lista.
- El VPS detecta el `subflow: 'seleccion_lista'` y espera un número.
- El siguiente mensaje del usuario se procesa contra la lista guardada en el estado.

---

## 📧 4. Módulo de Correos e IA (Blueprint para Resúmenes)

Para implementar el talento de **Resumen de Correos**, sigue este patrón:
1. **Fetch**: Usa `imap_search` y `imap_fetchbody` en la API (ver `api/bot/correos/buscar.php`).
2. **Process**: Concatena los `previews` de los correos.
3. **AI Task**: Envía ese texto a un LLM con un prompt como "Resume estos correos en 3 puntos clave".
4. **Respond**: Devuelve el resumen final al usuario.

---

## 📅 5. Gestión de Fechas (Estándar Nicaragua)

El bot está configurado para la zona horaria `America/Managua`.
- **IA**: La IA recibe el día de hoy (ej: "Hoy es Jueves 26...") para poder entender "mañana", "el lunes" o "esta semana".
- **PHP**: Usa siempre `DateTime` con el formato `Y-m-d`.
- **Nicaragua Standard**: Los números telefónicos deben ser formateados con el prefijo `505` mediante el helper `enviarMensajeWsp()`.

---

## 🛠️ 6. Mantenimiento y Despliegue

### Logs de Auditoría
Cada interacción se guarda en la tabla `ia_logs_bot`. Esto permite ver por qué la IA clasificó mal un mensaje o dónde falló un script PHP.

### Seguridad
Todas las peticiones Hostinger ↔ DigitalOcean **DEBEN** incluir:
`X-WSP-Token: c5b155ba8f6877...`

### Script de Empuje Global
Usa `.\gitpush-all.ps1` desde la raíz. Este script entra en cada módulo, añade todos los cambios (`git add .`) y hace el push secuencialmente.

---

> [!IMPORTANT]
> **Nunca** modifiques la lógica de base de datos desde el VPS. El VPS es una interfaz; toda la integridad de datos reside en la API de Hostinger.
