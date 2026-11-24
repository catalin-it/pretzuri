import type { Readable } from "node:stream";
import { SaxesParser } from "saxes";
import { normKey } from "../adapters/map.js";
import type { FlatRecord } from "../adapters/types.js";
import { decodeText } from "./decode.js";

const MAX_FIELD_CHARS = 20_000;
const MAX_FIELDS = 200;

/**
 * Streams `<itemTag>` elements as flat records: every descendant element's text under its normalized local
 * name (first occurrence wins), `<spec name="X">v</spec>` into `specs`. saxes processes no DTD and knows only
 * the predefined entities, so external/internal entity tricks (XXE, billion laughs) fail as parse errors.
 * A DOCTYPE is rejected outright. Malformed XML aborts the run (thrown error).
 */
export async function* parseXmlRecords(
  input: Readable | AsyncIterable<Buffer | string>,
  opts: { itemTag: string; encoding?: string },
): AsyncGenerator<FlatRecord> {
  const itemTag = opts.itemTag.toLowerCase();
  const parser = new SaxesParser({ xmlns: false, position: false });
  const ready: FlatRecord[] = [];
  let current: FlatRecord | null = null;
  let depth = 0; // depth inside the current item
  let fieldCount = 0;
  const stack: Array<{ key: string; specName?: string; text: string }> = [];

  parser.on("doctype", () => {
    throw new Error("XML DOCTYPE is not allowed in feeds");
  });
  parser.on("opentag", (node) => {
    const local = (node.name.includes(":") ? node.name.split(":").pop()! : node.name).toLowerCase();
    if (!current) {
      if (local === itemTag) {
        current = { fields: {} };
        depth = 0;
        fieldCount = 0;
      }
      return;
    }
    depth++;
    const nameAttr = node.attributes["name"];
    stack.push({
      key: normKey(local),
      specName: local === "spec" && typeof nameAttr === "string" ? nameAttr : undefined,
      text: "",
    });
  });
  const onText = (t: string) => {
    const top = stack[stack.length - 1];
    if (current && top && top.text.length < MAX_FIELD_CHARS) top.text += t;
  };
  parser.on("text", onText);
  parser.on("cdata", onText);
  parser.on("closetag", (node) => {
    if (!current) return;
    if (depth === 0) {
      const local = (node.name.includes(":") ? node.name.split(":").pop()! : node.name).toLowerCase();
      if (local === itemTag) {
        ready.push(current);
        current = null;
      }
      return;
    }
    depth--;
    const el = stack.pop();
    if (!el) return;
    const text = el.text.trim().slice(0, MAX_FIELD_CHARS);
    if (!text) return;
    if (el.specName !== undefined) {
      current.specs ??= {};
      if (Object.keys(current.specs).length < 50) current.specs[el.specName.trim().slice(0, 100)] = text.slice(0, 300);
    } else if (!(el.key in current.fields) && fieldCount < MAX_FIELDS) {
      current.fields[el.key] = text;
      fieldCount++;
    }
  });

  for await (const chunk of decodeText(input, opts.encoding)) {
    parser.write(chunk);
    while (ready.length) yield ready.shift()!;
  }
  parser.close();
  while (ready.length) yield ready.shift()!;
}
