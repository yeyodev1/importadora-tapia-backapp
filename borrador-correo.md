# Respuesta a Andrés Macio — falta el host público

**Asunto:** Re: Coordinación acceso restringido por IP — pruebas de conexión SSL/TLS

---

Estimado Andrés, buenas tardes:

Gracias por habilitar SSL/TLS y por el `ca.pem`. Ya lo cargamos y nuestro
backend quedó configurado para conectarse cifrado y saliendo por las IPs que
ustedes autorizaron.

Verificamos de nuestro lado que la salida es la correcta: nuestras pruebas
salen por **3.223.196.67**, una de las dos IPs autorizadas
(3.224.144.155 / 3.223.196.67).

**Lo que falta para poder probar: la dirección pública del servidor.**

La única dirección que tenemos registrada es `25.58.189.51:3306`, que es la IP
de Hamachi. Desde internet no responde — la conexión TCP nunca llega, así que
ni siquiera alcanzamos el handshake de MySQL donde se validaría el certificado.

Necesitamos dos datos concretos:

1. **IP pública o dominio** del servidor MySQL (la IP que su ISP les asigna).
2. **Puerto externo** publicado (3306 u otro, si lo mapearon distinto).

**Sobre el reenvío de puerto**

En correos anteriores se indicó que la conectividad/reenvío correspondía al
equipo técnico de BAKANO. Queremos aclarar este punto: el reenvío de puerto se
configura en el router de la red donde vive el servidor MySQL. Nosotros, desde
fuera de esa red, no tenemos forma técnica de configurarlo — sólo puede hacerlo
quien administra ese router (su equipo o el ISP).

Nos llama la atención, además, que ustedes ya restringieron el usuario
`crm_user` a nuestras dos IPs de origen. Esa restricción sólo tiene efecto si el
servidor recibe conexiones desde internet, así que es probable que la
publicación ya exista y sólo falte que nos compartan la IP y el puerto.

Si la publicación aún no está hecha, quedan dos caminos:

- **Opción A —** Publicar el puerto MySQL en el router hacia internet. El riesgo
  ya está acotado: `crm_user` sólo acepta nuestras dos IPs, sólo tiene permiso
  de lectura sobre las cinco vistas, y la sesión va cifrada con TLS.
- **Opción B —** Un túnel saliente (Cloudflare Tunnel o similar) desde una
  máquina de su red. No abre ningún puerto: la conexión la inicia su servidor
  hacia afuera.

Apenas tengamos la IP y el puerto, ejecutamos la validación que indican
(`SELECT USER(), CURRENT_USER();` y `SHOW SESSION STATUS LIKE 'Ssl_cipher';`) y
les enviamos el resultado el mismo día.

Quedamos atentos.

Saludos cordiales,

Diego Reyes
