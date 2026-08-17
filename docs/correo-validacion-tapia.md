# Correo para Andrés — copiar y pegar tal cual

**Para:** andres.macio@hotmail.com
**CC:** administracion@importadoratapia.com
**Asunto:** RE: Integración CRM — Conexión validada con éxito + última solicitud técnica

---

Estimados Andrés y María José,

Excelentes noticias: ejecutamos las pruebas acordadas a través del túnel Cloudflare y la conexión quedó plenamente operativa. Compartimos los resultados de la validación solicitada:

1) Identidad del usuario:

SELECT USER(), CURRENT_USER();
→ crm_user@192.168.1.39 (en ambos casos)

Esto confirma que el ajuste del host de origen quedó correctamente aplicado.

2) Cifrado de la sesión:

SHOW SESSION STATUS LIKE 'Ssl_cipher';
→ Ssl_cipher: AES256-SHA

La sesión viaja cifrada de extremo a extremo, cumpliendo el requisito REQUIRE SSL con verificación del certificado de CA (ca.pem) que nos remitió Andrés.

3) Lectura de las cinco vistas:

- vw_crm_clientes: 1.312 registros
- vw_crm_vendedores: 13 registros
- vw_crm_cartera_facturas_2year: 544 registros
- vw_crm_cartera_consolidada: 420 registros
- vw_crm_inventario: 49 registros

Con esto damos por validada la conectividad y el alcance de lectura acordado. Los próximos pasos (integración con nuestro backend, pruebas finales y puesta en producción) quedan a cargo de BAKANO, de forma remota.

Dos puntos finales para dejar la integración en producción con máxima estabilidad:

A) Solicitud operativa: mantener encendido de forma permanente el equipo donde está instalado el agente cloudflared (192.168.1.39). Si ese equipo se apaga o pierde Internet, la integración deja de recibir datos hasta que vuelva a estar en línea.

B) Última solicitud técnica, de bajo esfuerzo: durante las pruebas observamos que el servidor MySQL negocia únicamente TLSv1 (protocolo de 2006, hoy descontinuado). Logramos conectarnos habilitando compatibilidad con protocolos antiguos de nuestro lado, pero los servicios cloud que usaremos en producción exigen TLSv1.2 como mínimo. Solicitamos habilitar TLSv1.2 en el servidor MySQL — es un cambio de configuración, sin costo, que además mejora la seguridad del propio servidor:

- Si el MySQL es 5.7.10 o superior con OpenSSL: agregar en el archivo de configuración (my.cnf / my.ini), en la sección [mysqld], la línea:

  tls_version=TLSv1.2

  y reiniciar el servicio MySQL en una ventana de mantenimiento breve.

- Si el MySQL fue compilado con yaSSL (común en instaladores antiguos de 5.5/5.6), yaSSL no soporta TLSv1.2. En ese caso agradeceríamos nos confirmen la versión exacta del servidor (SELECT VERSION();) para evaluar alternativas sin tocar su instalación.

Con TLSv1.2 habilitado, la sesión seguirá cumpliendo REQUIRE SSL con el mismo certificado ca.pem ya configurado; no se requiere ningún otro cambio de su parte.

Agradecemos la gestión de ambos para llegar a este punto. Quedamos atentos.

Saludos cordiales,

Diego Reyes
BAKANO
