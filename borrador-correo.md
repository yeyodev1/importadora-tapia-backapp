**Asunto:** Re: Integración CRM — Cloudflare Tunnel como alternativa a whitelist IP

Estimada María José, estimado Andrés,

Sobre la whitelist de IP fija: lamentablemente no es viable. Nuestro backend corre en **Vercel (serverless)**, lo que significa que las funciones no tienen una IP de salida fija. No podemos garantizar una sola IP, ni siquiera un rango predecible.

La alternativa más simple y segura es **Cloudflare Tunnel (cloudflared)**:

- No abren puertos en su firewall.
- No exponen MySQL a internet.
- No requiere VPN ni IP fija.
- La conexión es outbound desde su servidor hacia Cloudflare, completamente cifrada.

**Lo único que necesito que hagan de su lado:**

1. Instalar `cloudflared` en la máquina que tiene MySQL (o una que tenga acceso a 192.168.1.15:3306).
2. Crear un túnel apuntando a `192.168.1.15:3306`.

**Lo que necesito que me compartan una vez listo:**

- **El hostname o dominio público del túnel** (algo como `xxxxx.trycloudflare.com` o un dominio propio si configuran uno).
- **El puerto** si usan uno distinto al 3306.

Con eso, configuro las variables de entorno del backend y la integración queda operativa de inmediato.

¿Les parece viable?

Saludos,

Diego Reyes
