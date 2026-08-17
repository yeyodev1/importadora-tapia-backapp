# Correo a Importadora Tapia — confirmación técnica Opción B

**Para:** andres.macio@hotmail.com
**CC:** Administración Importadora Tapia
**Asunto:** Integración CRM — Confirmación técnica Opción B y requerimientos de implementación

---

Estimados María José y Andrés,

Buenas tardes.

Agradecemos la autorización para avanzar con la Opción B. A continuación confirmamos por escrito, punto por punto, lo solicitado en su correo, y detallamos al final los datos que debemos recibir de su parte para dejar la integración operativa.

---

## Alcance y distribución de responsabilidades

Precisamos el esquema de trabajo antes del detalle técnico:

**La instalación y configuración del túnel corresponde íntegramente a Importadora Tapia**, ya que debe ejecutarse sobre un equipo de su red interna. BAKANO no interviene en su infraestructura, no accede a sus equipos y no requiere ingreso a sus instalaciones.

**BAKANO no provee ni entrega equipos, computadores, servidores, dispositivos ni hardware de ningún tipo.** El equipo donde se instale el agente debe ser uno ya existente dentro de su red.

El rol de BAKANO es **recibir los datos de conexión** una vez el túnel esté operativo, y a partir de ahí realizar toda la integración, las pruebas y la puesta en producción de forma remota desde nuestras oficinas.

Esto es consistente con lo planteado por Andrés a lo largo del proceso: las intervenciones sobre equipos y servicios de la red de Importadora Tapia son ejecutadas por su equipo técnico.

---

## 1. Solución específica

**Cloudflare Tunnel**, mediante el agente oficial `cloudflared`.

Es software gratuito, desarrollado y mantenido por Cloudflare, que se descarga directamente desde su sitio oficial: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/

Descartamos Tailscale para este caso porque requiere mantener un cliente VPN corriendo de forma permanente en el lado consumidor, lo cual no es compatible con una arquitectura serverless como la nuestra.

Complementariamente utilizaremos **Cloudflare Hyperdrive**, el servicio de Cloudflare que permite consultar bases de datos MySQL alojadas en redes privadas a través de ese túnel. BAKANO realizará esa configuración dentro de la cuenta de Cloudflare de Importadora Tapia, mediante el acceso que ustedes nos otorguen. No requiere ninguna acción técnica de su parte.

## 2. Equipo donde se instala

**Cualquier equipo de su red que tenga conectividad TCP hacia el servidor MySQL.**

Queremos subrayarlo: **no es necesario instalarlo en el servidor de base de datos.** Puede ser un PC de escritorio, un equipo administrativo o cualquier máquina de esa misma red. Esto atiende la observación que Andrés planteó oportunamente sobre no intervenir el servidor productivo.

La selección del equipo queda a criterio de Importadora Tapia.

## 3. Requisitos técnicos del equipo

| Requisito | Detalle |
|---|---|
| Sistema operativo | Windows 10/11, Windows Server, Linux o macOS |
| Disponibilidad | Encendido de forma permanente (24/7) |
| Conectividad | Salida a Internet por HTTPS (puerto 443 **saliente**) |
| Acceso a red interna | Debe alcanzar el servidor MySQL por TCP en la red local |
| Espacio en disco | Aproximadamente 50 MB |
| Permisos | Ejecutar la instalación como administrador (una sola vez) |
| IP fija | **No requerida** |
| Puertos entrantes | **Ninguno** |
| Cambios en firewall o router | **Ninguno** |

Observación de transparencia: si ese equipo se apaga o pierde conexión a Internet, el túnel se interrumpe y la integración deja de recibir datos hasta que vuelva a encenderse. Por ello sugerimos seleccionar un equipo que permanezca encendido de forma habitual.

## 4. Distribución de tareas

**A cargo de Importadora Tapia:**

1. Selección del equipo donde se instalará el agente.
2. Instalación y configuración de `cloudflared` en dicho equipo.
3. Creación del túnel y publicación del servicio MySQL como recurso privado dentro de ese túnel.
4. Verificación de que el túnel figura como activo o conectado.
5. Actualización del host de origen del usuario `crm_user` en MySQL (detalle en el punto siguiente).
6. Entrega a BAKANO de los datos de conexión listados al final de este correo.

**A cargo de BAKANO, de forma remota:**

1. Configuración de Hyperdrive y de las políticas de acceso en nuestro lado.
2. Configuración del certificado `ca.pem` remitido por Andrés, en modo de verificación `VERIFY_CA`.
3. Integración con nuestro backend y desarrollo de los cinco endpoints.
4. Ejecución de las pruebas finales y entrega de resultados.
5. Puesta en producción de la integración.

**Sobre el ajuste en MySQL (tarea 5 de su lista):**

Actualmente `crm_user` está restringido a las IPs `3.224.144.155` y `3.223.196.67`. Al operar mediante el túnel, la conexión llegará al servidor MySQL desde la **IP local del equipo donde se instale `cloudflared`**, no desde esas IPs públicas. Por lo tanto es necesario actualizar el host de origen del usuario a esa IP interna.

Es un cambio a nivel de base de datos, equivalente al mapeo de IPs que Andrés ya realizó previamente, y no implica intervención sobre el servicio ni reinicio del motor.

## 5. Compatibilidad con nuestro backend en Vercel

**Confirmado.** La arquitectura queda así:

```
Backend en Vercel  →  (HTTPS)  →  Cloudflare  →  Túnel saliente
                                                      ↓
                                          Equipo en su red (cloudflared)
                                                      ↓
                                             Servidor MySQL (red interna)
```

Nuestro backend nunca intenta alcanzar directamente su red: consume el servicio de Cloudflare por HTTPS, que es exactamente lo que una plataforma serverless puede hacer de forma estable. Adicionalmente, Hyperdrive mantiene un pool de conexiones persistente hacia su base de datos, lo que hace la conexión más estable y eficiente que una conexión directa.

## 6. No se abrirá ni publicará el puerto 3306

**Confirmado y garantizado por el diseño de la solución.**

El túnel opera mediante una conexión **saliente** iniciada desde el equipo de su red hacia Cloudflare. En ningún momento se abre un puerto entrante, no se publica el servicio MySQL hacia Internet, no se modifica la configuración del router y no se requiere gestión alguna con su proveedor de Internet.

Su servidor MySQL permanecerá invisible desde Internet. El acceso queda además restringido mediante un token de servicio de Cloudflare Access, de modo que únicamente nuestra integración puede utilizar ese túnel.

## 7. Costos

**Cero costos para Importadora Tapia**, ni iniciales ni mensuales.

- `cloudflared` y Cloudflare Tunnel: software y servicio gratuitos.
- Cloudflare Hyperdrive: incluido en el plan gratuito, con un límite de 100.000 consultas diarias, muy por encima de lo que requiere esta integración.
- No se requiere contratar servidores, servicios, licencias ni suscripciones.
- No se solicita ningún medio de pago de su parte.

## 8. Pruebas finales e integración operativa

**Confirmado.** Una vez recibidos los datos de conexión, BAKANO ejecutará de forma remota:

1. La validación solicitada por Andrés: `SELECT USER(), CURRENT_USER();` y `SHOW SESSION STATUS LIKE 'Ssl_cipher';`, remitiendo el resultado por este medio.
2. La verificación de lectura sobre las cinco vistas: `vw_crm_clientes`, `vw_crm_vendedores`, `vw_crm_cartera_facturas_2year`, `vw_crm_cartera_consolidada` y `vw_crm_inventario`.
3. La habilitación de la integración en producción.

Aclaramos que la conexión mantendrá el cifrado SSL/TLS que Andrés configuró: utilizaremos el certificado `ca.pem` en modo de verificación de autoridad certificadora, de modo que la exigencia de `REQUIRE SSL` sobre `crm_user` se mantiene intacta.

---

# Titularidad de la cuenta de Cloudflare

La cuenta de Cloudflare donde se registre el túnel será **de Importadora Tapia**, creada y administrada por ustedes.

El procedimiento es el siguiente:

1. Importadora Tapia crea una cuenta gratuita en Cloudflare (https://dash.cloudflare.com/sign-up).
2. Instala el agente `cloudflared` en el equipo seleccionado y crea el túnel dentro de esa cuenta.
3. Otorga a BAKANO un acceso de miembro a esa cuenta, únicamente para configurar la integración.

Consideramos que este esquema es el más conveniente para ustedes, por las siguientes razones:

- **La titularidad del túnel, del equipo y de la cuenta permanece en Importadora Tapia.** BAKANO no adquiere control sobre ningún componente de su infraestructura.
- **Pueden revocar nuestro acceso en cualquier momento**, desde su propio panel, sin depender de nosotros ni solicitarnos nada.
- **Pueden auditar en todo momento** qué configuraciones existen y qué conexiones se realizan.
- Si en el futuro deciden trabajar con otro proveedor, la infraestructura ya está bajo su control y no requiere migración alguna.

La creación de la cuenta no tiene costo y no solicita medio de pago. Requiere únicamente un correo electrónico institucional y toma alrededor de dos minutos.

---

# Validación previa que solicitamos antes de la entrega

Con el ánimo de no perder más tiempo en ciclos de ida y vuelta, solicitamos que **Importadora Tapia valide que la conexión funciona antes de remitirnos los datos**. Esto permite detectar cualquier inconveniente de configuración mientras su equipo técnico aún está trabajando sobre el tema, en lugar de descubrirlo días después.

Son tres verificaciones. Las dos primeras son inmediatas; la tercera es la determinante.

### Verificación 1 — Estado del túnel

En el panel de Cloudflare, en la sección **Networking → Tunnels**, el túnel debe figurar con estado **Healthy** o **Activo**.

### Verificación 2 — Acceso a MySQL desde el equipo del túnel

Desde el mismo equipo donde se instaló `cloudflared`, conectarse al servidor MySQL y ejecutar:

```
SELECT USER(), CURRENT_USER();
SHOW SESSION STATUS LIKE 'Ssl_cipher';
```

Esto confirma tres cosas a la vez: que el equipo alcanza el servidor MySQL, que el ajuste del host de `crm_user` quedó correctamente aplicado, y que la sesión viaja cifrada. El campo `Ssl_cipher` debe retornar un valor.

### Verificación 3 — Acceso desde fuera de su red *(la más importante)*

Esta es la prueba que realmente confirma que el túnel es utilizable por un tercero desde Internet. Solicitamos realizarla **desde un equipo que no esté conectado a la red de Importadora Tapia** — por ejemplo un portátil usando datos móviles, o desde un domicilio particular.

Pasos:

1. Instalar `cloudflared` en ese equipo externo.
2. Abrir el túnel local hacia el recurso publicado:

```
cloudflared access tcp --hostname <hostname-del-tunel> --url 127.0.0.1:13306
```

3. Dejando el comando anterior en ejecución, desde otra terminal conectarse a MySQL:

```
mysql -h 127.0.0.1 -P 13306 -u crm_user -p --ssl-ca=ca.pem -e "SELECT USER(), CURRENT_USER(); SHOW SESSION STATUS LIKE 'Ssl_cipher';"
```

Si esta consulta devuelve resultados y el campo `Ssl_cipher` muestra un valor, el túnel está correctamente publicado y nuestra integración podrá conectarse sin inconvenientes.

Alternativamente, esta misma verificación puede realizarse instalando el cliente **Cloudflare One (WARP)** en el equipo externo, si les resulta más cómodo que el uso de línea de comandos.

**Les solicitamos remitirnos la captura de pantalla del resultado de esta tercera verificación** junto con los datos del siguiente apartado. Con esa evidencia podemos avanzar directamente a la integración, sin rondas adicionales de diagnóstico.

---

# Datos que debemos recibir de Importadora Tapia

Una vez el túnel esté instalado y operativo, requerimos que nos remitan la siguiente información. **Sin estos datos no es posible completar la configuración de nuestro lado.**

| # | Dato requerido | Ejemplo / detalle |
|---|---|---|
| 1 | **IP interna y puerto del servidor MySQL** dentro de su red | Ej. `192.168.1.15:3306` |
| 2 | **IP interna del equipo donde se instaló `cloudflared`** | Ej. `192.168.1.42` — necesaria para el ajuste del punto 4 |
| 3 | **Nombre o identificador del túnel** creado | Ej. `imcatabe-mysql` |
| 4 | **Confirmación de que el túnel figura como activo** | Captura de pantalla del panel de Cloudflare o del estado del servicio |
| 5 | **Confirmación del ajuste de `crm_user`**, indicando el nuevo host configurado | Confirmación por escrito de Andrés |
| 6 | **Confirmación de que el equipo permanece encendido 24/7** | Sí / No |
| 7 | **Acceso de miembro a su cuenta de Cloudflare**, enviado a `dreyes@bakano.ec` | Invitación desde su panel de Cloudflare |
| 8 | **Captura del resultado de la Verificación 3** (acceso desde fuera de su red) | Ver sección anterior |
| 9 | **Hostname del túnel** utilizado en esa verificación | Ej. `mysql-imcatabe.sudominio.com` |

**Al recibir estos datos, BAKANO ejecuta la integración y las pruebas dentro de las 48 horas siguientes**, y les remite los resultados de la validación por este medio.

Quedamos atentos y agradecemos la gestión.

Saludos cordiales,

Diego Reyes
BAKANO
