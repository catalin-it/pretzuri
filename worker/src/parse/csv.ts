import { Readable, pipeline } from "node:stream";
import { parse } from "csv-parse";
import { normKey } from "../adapters/map.js";
import type { FlatRecord } from "../adapters/types.js";
import { decodeText } from "./decode.js";

/** Picks the delimiter that occurs most often (outside quotes) in the header line. */
export function sniffDelimiter(headerLine: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  let inQuotes = false;
  for (const ch of headerLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] = (counts[ch] ?? 0) + 1;
  }
  let best = ",";
  for (const [d, n] of Object.entries(counts)) if (n > (counts[best] ?? 0)) best = d;
  return best;
}

export type CsvEvent = FlatRecord | { error: string };

/**
 * Streams CSV rows as flat records keyed by normalized header names. BOM-safe, quoted fields, tolerant of
 * ragged rows; a row csv-parse cannot read is reported as `{error}` and skipped (the run continues).
 */
export async function* parseCsvRecords(
  input: Readable | AsyncIterable<Buffer | string>,
  opts: { delimiter?: string; encoding?: string } = {},
): AsyncGenerator<CsvEvent> {
  const text = decodeText(input, opts.encoding);
  // Peek until the first line break to sniff the delimiter, then replay.
  let head = "";
  let first = await text.next();
  while (!first.done) {
    head += first.value;
    if (head.includes("\n") || head.length > 65_536) break;
    first = await text.next();
  }
  if (!head.trim()) return;
  const headerLine = head.replace(/^﻿/, "").split(/\r?\n/)[0] ?? "";
  const delimiter = opts.delimiter || sniffDelimiter(headerLine);
  async function* replay(): AsyncGenerator<string> {
    yield head;
    if (first.done) return;
    for await (const s of text) yield s;
  }

  const skipped: string[] = [];
  const parser = parse({
    columns: (header: string[]) => header.map((h) => normKey(h)),
    bom: true,
    delimiter,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    skip_records_with_error: true,
    trim: true,
    max_record_size: 1_000_000,
  });
  parser.on("skip", (err: Error) => {
    if (skipped.length < 10_000) skipped.push(err.message.slice(0, 300));
  });
  const src = Readable.from(replay(), { objectMode: false });
  pipeline(src, parser, (err) => {
    if (err) parser.destroy(err);
  });
  for await (const rec of parser as AsyncIterable<Record<string, string | undefined>>) {
    while (skipped.length) yield { error: `unreadable CSV row: ${skipped.shift()}` };
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(rec)) if (k && typeof v === "string") fields[k] = v;
    yield { fields };
  }
  while (skipped.length) yield { error: `unreadable CSV row: ${skipped.shift()}` };
}
