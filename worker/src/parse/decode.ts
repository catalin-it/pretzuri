import type { Readable } from "node:stream";
import { TextDecoder } from "node:util";

/** Decodes a byte stream to text chunks (streaming, BOM stripped). Encoding from the source options. */
export async function* decodeText(input: Readable | AsyncIterable<Buffer | string>, encoding = "utf-8"): AsyncGenerator<string> {
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(encoding, { fatal: false, ignoreBOM: false });
  } catch {
    throw new Error(`unsupported encoding ${encoding}`);
  }
  for await (const chunk of input) {
    if (typeof chunk === "string") {
      yield chunk;
      continue;
    }
    const s = decoder.decode(chunk, { stream: true });
    if (s) yield s;
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}
