import { sha256Canonical, type IsoTimestamp } from "@jiplabs/core";

/**
 * Sanctions list screening, product independent and I/O free.
 * Callers download the list and pass its text; this module parses and matches.
 * A name match is never treated as a confirmed hit: it is a POTENTIAL_MATCH for human review.
 */

export type SanctionsListId = "OFAC-SDN" | "OFAC-CONS";

export const OFAC_LIST_SOURCES = Object.freeze({
  "OFAC-SDN": Object.freeze({
    primary: "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV",
    aliases: "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ALT.CSV",
  }),
  "OFAC-CONS": Object.freeze({
    primary: "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/CONS_PRIM.CSV",
    aliases: "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/CONS_ALT.CSV",
  }),
});

export type SanctionsEntry = {
  readonly entryId: string;
  readonly names: readonly string[];
  readonly entryType: string;
  readonly programs: readonly string[];
};

export type SanctionsListSnapshot = {
  readonly listId: SanctionsListId;
  readonly sourceUrl: string;
  /** Last-Modified of the source, or the publication date it states. */
  readonly publishedAt: IsoTimestamp;
  readonly fetchedAt: IsoTimestamp;
  readonly contentHash: string;
  readonly entries: readonly SanctionsEntry[];
};

export type SanctionsScreeningResult = "NO_MATCH" | "POTENTIAL_MATCH" | "CONFIRMED_MATCH";

/** What a payout policy receives: references, not the list and not the person's details. */
export type SanctionsScreeningEvidence = {
  readonly listId: SanctionsListId;
  readonly listContentHash: string;
  readonly listPublishedAt: IsoTimestamp;
  readonly screenedAt: IsoTimestamp;
  readonly result: SanctionsScreeningResult;
  readonly matchedEntryIds: readonly string[];
  readonly subjectFingerprint: string;
};

/** Minimal RFC 4180 reader for the OFAC CSV exports (quoted fields, commas inside quotes, "-0-" for empty). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function cell(value: string | undefined): string {
  const text = (value ?? "").trim();
  return text === "-0-" ? "" : text;
}

/** OFAC primary file: ent_num, name, type, program(s), ...; alias file: ent_num, alt_num, alt_type, alt_name, remarks. */
export function parseOfacList(primaryCsv: string, aliasCsv = ""): SanctionsEntry[] {
  const byId = new Map<string, { names: string[]; entryType: string; programs: string[] }>();
  for (const columns of parseCsv(primaryCsv)) {
    const id = cell(columns[0]);
    const name = cell(columns[1]);
    if (!id || !name) continue;
    byId.set(id, {
      names: [name],
      entryType: cell(columns[2]) || "entity",
      programs: cell(columns[3]).split(/[\s\]\[]+/).filter(Boolean),
    });
  }
  for (const columns of parseCsv(aliasCsv)) {
    const id = cell(columns[0]);
    const alias = cell(columns[3]);
    const entry = byId.get(id);
    if (entry && alias && !entry.names.includes(alias)) entry.names.push(alias);
  }
  return [...byId.entries()].map(([entryId, value]) =>
    Object.freeze({
      entryId,
      names: Object.freeze(value.names),
      entryType: value.entryType,
      programs: Object.freeze(value.programs),
    }),
  );
}

export function buildSanctionsSnapshot(input: {
  listId: SanctionsListId;
  sourceUrl: string;
  publishedAt: IsoTimestamp;
  fetchedAt: IsoTimestamp;
  primaryCsv: string;
  aliasCsv?: string;
}): SanctionsListSnapshot {
  const entries = parseOfacList(input.primaryCsv, input.aliasCsv ?? "");
  return Object.freeze({
    listId: input.listId,
    sourceUrl: input.sourceUrl,
    publishedAt: input.publishedAt,
    fetchedAt: input.fetchedAt,
    contentHash: sha256Canonical({ primary: input.primaryCsv, aliases: input.aliasCsv ?? "" }),
    entries: Object.freeze(entries),
  });
}

const STOP_TOKENS = new Set(["MR", "MRS", "MS", "DR", "THE", "AND", "OF", "DE", "DU", "DES", "LA", "LE", "AL", "EL", "BIN", "BEN"]);

export function nameTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_TOKENS.has(token));
}

/**
 * Potential match when every significant token of a listed name appears in the candidate name,
 * or every token of the candidate appears in a listed name (order and case ignored, accents folded).
 * Single-token names need an exact single-token equality.
 */
export function screenName(
  candidateName: string,
  snapshot: SanctionsListSnapshot,
  screenedAt: IsoTimestamp,
): SanctionsScreeningEvidence {
  const candidate = nameTokens(candidateName);
  const candidateSet = new Set(candidate);
  const matched: string[] = [];
  if (candidate.length > 0) {
    for (const entry of snapshot.entries) {
      const hit = entry.names.some((listed) => {
        const tokens = nameTokens(listed);
        if (tokens.length === 0) return false;
        if (tokens.length === 1 || candidate.length === 1) {
          return tokens.length === candidate.length && tokens[0] === candidate[0];
        }
        const listedSet = new Set(tokens);
        return tokens.every((t) => candidateSet.has(t)) || candidate.every((t) => listedSet.has(t));
      });
      if (hit) matched.push(entry.entryId);
    }
  }
  return Object.freeze({
    listId: snapshot.listId,
    listContentHash: snapshot.contentHash,
    listPublishedAt: snapshot.publishedAt,
    screenedAt,
    result: matched.length > 0 ? "POTENTIAL_MATCH" : "NO_MATCH",
    matchedEntryIds: Object.freeze(matched),
    subjectFingerprint: sha256Canonical({ tokens: [...candidate].sort() }),
  });
}
