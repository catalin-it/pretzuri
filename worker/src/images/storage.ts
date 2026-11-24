import { PRODUCT_IMAGES_BUCKET } from "./constants.js";

/** Uploads with the Storage API (`baseUrl` = http://storage:5000 or http://api-gw:8000/storage/v1) (service_role key from the container env). The key is never logged. */
export async function uploadObject(baseUrl: string, key: string, objectPath: string, data: Buffer): Promise<void> {
  const url = `${baseUrl}/object/${PRODUCT_IMAGES_BUCKET}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": "image/webp", "x-upsert": "true", "cache-control": "max-age=31536000" },
    body: new Uint8Array(data),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200).split(key).join("***");
    throw new Error(`storage upload failed: HTTP ${res.status} ${body}`);
  }
}
