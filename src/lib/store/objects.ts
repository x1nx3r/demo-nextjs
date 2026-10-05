import {
  deleteObject,
  getObjectBytes,
  listKeys,
  putObject,
} from "@/lib/storage/s3";

const decoder = new TextDecoder();

export async function putJson(key: string, value: unknown): Promise<void> {
  await putObject(key, JSON.stringify(value, null, 2), "application/json");
}

export async function getJson<T>(key: string): Promise<T | null> {
  try {
    const bytes = await getObjectBytes(key);
    return JSON.parse(decoder.decode(bytes)) as T;
  } catch {
    return null;
  }
}

export async function putBytes(
  key: string,
  data: Uint8Array,
  contentType: string,
): Promise<void> {
  await putObject(key, data, contentType);
}

export async function getBytes(key: string): Promise<Uint8Array> {
  return getObjectBytes(key);
}

export async function deletePrefix(prefix: string): Promise<void> {
  const keys = await listKeys(prefix);
  await Promise.all(keys.map((key) => deleteObject(key)));
}
