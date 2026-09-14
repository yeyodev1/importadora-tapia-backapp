import crypto from "crypto";

/**
 * Sube una imagen a Cloudinary usando el REST API con firma (sin SDK).
 * Recibe un data URI base64 (data:image/...;base64,....) o una URL pública.
 * Devuelve la secure_url del recurso subido.
 */
export async function uploadComprobante(
  dataUri: string,
  folder = "tapia-cobros"
): Promise<string> {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !apiKey || !apiSecret) {
    throw new Error("Cloudinary no está configurado (CLOUDINARY_*)");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  // La firma se calcula sobre los params (excepto file, api_key) ordenados
  // alfabéticamente, concatenados con el api_secret al final.
  const toSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash("sha1").update(toSign).digest("hex");

  const form = new URLSearchParams();
  form.append("file", dataUri);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cloudinary ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { secure_url?: string };
  if (!data.secure_url) throw new Error("Cloudinary no devolvió secure_url");
  return data.secure_url;
}

/**
 * Firma para que el navegador suba un archivo DIRECTO a Cloudinary (imágenes o
 * PDF). Así los documentos pesados no pasan por la función de Vercel (4.5 MB).
 * Devuelve null si Cloudinary no está configurado.
 */
export function firmaSubidaDirecta(folder: string) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !apiKey || !apiSecret) return null;

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash("sha1")
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");
  return { cloudName: cloud, apiKey, timestamp, signature, folder };
}

/** Solo se aceptan documentos alojados en nuestra cuenta de Cloudinary. */
export function esUrlCloudinaryPropia(url: string): boolean {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  return Boolean(cloud) && url.startsWith(`https://res.cloudinary.com/${cloud}/`);
}
