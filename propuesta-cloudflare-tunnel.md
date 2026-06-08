Estimados,

Gracias por la respuesta y por la disposición a buscar una solución segura. Entendemos completamente las políticas de seguridad y las compartimos.

Queremos proponer una alternativa que no requiere abrir puertos ni exponer el servidor MySQL de ninguna forma: **Cloudflare Tunnel**.

**¿Cómo funciona?**

Cloudflare proporciona un agente liviano llamado `cloudflared` que se instala en una máquina dentro de su red. Este agente crea un túnel saliente (outbound) hacia la red de Cloudflare. La conexión la inicia su servidor hacia afuera, no al revés, por lo que no se abre ningún puerto en su firewall.

Del lado nuestro, consumimos el túnel a través de un hostname seguro, sin necesidad de conocer IP alguna.

**¿Qué necesitaríamos de su parte?**

Concretamente, solo dos pasos:

1. Descargar e instalar `cloudflared` en cualquier máquina de su red que tenga acceso al servidor MySQL (puede ser el mismo servidor o un PC cualquiera).
2. Ejecutar un comando para iniciar el túnel. Una vez activo, nos entregan la URL generada y con eso podemos conectarnos desde nuestra infraestructura.

El proceso toma menos de 5 minutos, no requiere cambios en su infraestructura existente y no representa ningún riesgo de seguridad.

**¿Por qué Cloudflare Tunnel?**

- Cero exposición del puerto 3306
- Cero reglas de firewall que modificar
- Cero IPs de terceros que whitelistear
- Conexión cifrada de extremo a extremo
- No requiere IP fija de nuestra parte

Quedamos atentos para saber si les parece viable o si prefieren explorar alguna de las alternativas que mencionaron anteriormente (whitelist de IP fija o VPN empresarial). En cualquier caso, estamos abiertos a coordinar la solución que mejor se adapte a sus políticas.

Saludos cordiales,
