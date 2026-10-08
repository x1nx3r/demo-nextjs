import {
  deleteObject,
  getObjectBytes,
  isNotFoundError,
  listKeys,
  putObject,
} from "@/lib/storage/s3";

const decoder = new TextDecoder();

export async function putJson(key: string, value: unknown): Promise<void> {
  await putObject(key, JSON.stringify(value, null, 2), "application/json");
}

/**
 * Read and parse an object. Returns null only when the object is genuinely
 * absent. A read failure throws, so a flaky store cannot masquerade as "no
 * data" (which would, for example, reset the append-only cast).
 */
export async function getJson<T>(key: string): Promise<T | null> {
  let bytes: Uint8Array;
  try {
    bytes = await getObjectBytes(key);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }

  try {
    return JSON.parse(decoder.decode(bytes)) as T;
  } catch {
    // Unparseable object: treat as absent rather than failing the whole read.
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

export async function putText(
  key: string,
  value: string,
  contentType = "text/plain",
): Promise<void> {
  await putObject(key, value, contentType);
}

export async function getText(key: string): Promise<string | null> {
  let bytes: Uint8Array;
  try {
    bytes = await getObjectBytes(key);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
  return decoder.decode(bytes);
}

export async function getBytes(key: string): Promise<Uint8Array> {
  return getObjectBytes(key);
}

export async function deletePrefix(prefix: string): Promise<void> {
  const keys = await listKeys(prefix);
  await Promise.all(keys.map((key) => deleteObject(key)));
}
