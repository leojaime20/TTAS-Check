import * as XLSX from "xlsx";
import type {
  CtoStatus,
  ChangeHistory,
  LoadedDataset,
  RequirementDefinition,
  RequirementStatus,
  TtasDataset,
  TtasRecord,
  ValidationResult,
} from "./types";

export const LOCAL_DATA_KEY = "ttas-check-data-v4";
export const LOCAL_META_KEY = "ttas-check-meta-v4";

const LEGACY_LOCAL_DATA_KEYS = [
  "ttas-check-data-v1", "ttas-check-meta-v1",
  "ttas-check-data-v2", "ttas-check-meta-v2",
  "ttas-check-data-v3", "ttas-check-meta-v3",
];

const SSOP_HEADER = "SSOP";
const DESCRIPTION_HEADER = "Primeiro Description";
const CTO_HEADER = "CTO";
const FINAL_STATUS_HEADER = "F.Status";
const REQUIRED_FIXED_HEADERS = [SSOP_HEADER, CTO_HEADER, FINAL_STATUS_HEADER, DESCRIPTION_HEADER];

const KNOWN_REQUIREMENTS: Record<string, Pick<RequirementDefinition, "label" | "short">> = {
  TAP: { label: "TAP", short: "TAP" },
  EX: { label: "EX", short: "EX" },
  "PIMS Punch": { label: "PIMS Punch", short: "PIMS" },
  SPIE: { label: "SPIE", short: "SPIE" },
  NR13: { label: "NR13", short: "NR13" },
  SIG: { label: "SIG", short: "SIG" },
  TagLines: { label: "Tag Lines", short: "TAGS" },
  TOOLs: { label: "Tools", short: "TOOLS" },
  TRAINING: { label: "Training", short: "TRAIN." },
  [FINAL_STATUS_HEADER]: { label: "Final Step", short: "FINISH" },
};

type LocalMeta = { fileName: string; importedAt: string };
type PublishedMeta = { updatedAt?: string };

function cleanHeader(value: unknown): string {
  return String(value ?? "").replace(/^\ufeff/, "").trim();
}

function normalizeStatus(value: unknown): RequirementStatus | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (["OK", "YES", "Y", "TRUE", "COMPLETE", "COMPLETED"].includes(normalized)) return "OK";
  if (["NOK", "NO", "N", "FALSE", "OPEN", "INCOMPLETE", "NOT OK"].includes(normalized)) return "NOK";
  return null;
}

function normalizeCtoStatus(value: unknown): CtoStatus | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "OK") return "OK";
  if (normalized === "CHECK") return "CHECK";
  return null;
}

function requirementDefinition(source: string): RequirementDefinition {
  const known = KNOWN_REQUIREMENTS[source];
  const label = known?.label ?? source.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  const compact = label.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const short = known?.short ?? (compact.length <= 7 ? compact : `${compact.slice(0, 6)}.`);
  return { source, label, short, isFinal: source === FINAL_STATUS_HEADER };
}

function requirementsFromHeaders(headers: string[]): RequirementDefinition[] {
  const ordinaryRequirements = headers
    .filter((header) => !REQUIRED_FIXED_HEADERS.includes(header))
    .map(requirementDefinition);
  return [...ordinaryRequirements, requirementDefinition(FINAL_STATUS_HEADER)];
}

function isStoredDataset(value: unknown): value is TtasDataset {
  if (!value || typeof value !== "object") return false;
  const dataset = value as Partial<TtasDataset>;
  if (!Array.isArray(dataset.requirements) || !dataset.requirements.length || !Array.isArray(dataset.records) || !dataset.records.length) return false;
  const sources = dataset.requirements.map((requirement) => requirement?.source);
  if (sources.some((source) => typeof source !== "string") || new Set(sources).size !== sources.length || !sources.includes(FINAL_STATUS_HEADER)) return false;
  return dataset.records.every((record) => {
    if (!record || typeof record !== "object") return false;
    return typeof record.ssop === "string"
      && typeof record.description === "string"
      && ["OK", "CHECK"].includes(String(record.cto))
      && !!record.statuses
      && sources.every((source) => ["OK", "NOK"].includes(String(record.statuses[source as string])));
  });
}

function readLocalMeta(): LocalMeta | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_META_KEY) ?? "null") as LocalMeta | null;
    return parsed && typeof parsed.fileName === "string" && typeof parsed.importedAt === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function recordsFromRows(rows: unknown[][], fileName = "dataset"): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!rows.length) return { records: [], requirements: [], errors: ["The file is empty."], warnings, fileName };

  const headers = rows[0].map(cleanHeader);
  const blankHeader = headers.findIndex((header) => !header);
  if (blankHeader >= 0) errors.push(`Column ${blankHeader + 1} needs a header.`);
  const duplicates = [...new Set(headers.filter((header, index) => header && headers.indexOf(header) !== index))];
  if (duplicates.length) errors.push(`Duplicate columns: ${duplicates.join(", ")}.`);
  const missing = REQUIRED_FIXED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) errors.push(`Missing required columns: ${missing.join(", ")}.`);
  if (errors.length) return { records: [], requirements: [], errors, warnings, fileName };

  const requirements = requirementsFromHeaders(headers);
  const column = Object.fromEntries(headers.map((header, index) => [header, index]));
  const records: TtasRecord[] = [];
  const seen = new Set<string>();

  rows.slice(1).forEach((row, rowIndex) => {
    const displayRow = rowIndex + 2;
    if (row.every((cell) => String(cell ?? "").trim() === "")) return;

    const ssop = String(row[column[SSOP_HEADER]] ?? "").trim();
    const description = String(row[column[DESCRIPTION_HEADER]] ?? "").trim();
    if (!ssop) {
      errors.push(`Row ${displayRow}: SSOP is required.`);
      return;
    }
    if (!description) errors.push(`Row ${displayRow}: description is required.`);
    if (seen.has(ssop)) errors.push(`Row ${displayRow}: duplicate SSOP ${ssop}.`);
    seen.add(ssop);

    const statuses: Record<string, RequirementStatus> = {};
    const cto = normalizeCtoStatus(row[column[CTO_HEADER]]);
    let valid = true;
    if (!cto) {
      errors.push(`Row ${displayRow}, ${CTO_HEADER}: use OK or Check.`);
      valid = false;
    }
    requirements.forEach((requirement) => {
      const status = normalizeStatus(row[column[requirement.source]]);
      if (!status) {
        errors.push(`Row ${displayRow}, ${requirement.source}: use OK or NOK.`);
        valid = false;
      } else {
        statuses[requirement.source] = status;
      }
    });

    if (valid && cto && description && !records.some((record) => record.ssop === ssop)) {
      records.push({ ssop, description, cto, statuses });
    }
  });

  if (records.length > 600) warnings.push(`The file contains ${records.length} records. Performance is optimized for up to 600.`);
  if (!records.length && !errors.length) errors.push("No data rows were found.");
  return { records, requirements, errors, warnings, fileName };
}

export async function parseSpreadsheet(file: File): Promise<ValidationResult> {
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return { records: [], requirements: [], errors: ["The workbook has no worksheets."], warnings: [], fileName: file.name };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheet], { header: 1, defval: "" });
  return recordsFromRows(rows, file.name);
}

export async function loadPublishedData(): Promise<LoadedDataset> {
  LEGACY_LOCAL_DATA_KEYS.forEach((key) => localStorage.removeItem(key));
  const stored = localStorage.getItem(LOCAL_DATA_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as unknown;
      const meta = readLocalMeta();
      if (isStoredDataset(parsed) && meta) {
        return { ...parsed, sourceLabel: `Local import · ${meta.fileName}`, updatedAt: meta.importedAt };
      }
      localStorage.removeItem(LOCAL_DATA_KEY);
      localStorage.removeItem(LOCAL_META_KEY);
    } catch {
      localStorage.removeItem(LOCAL_DATA_KEY);
      localStorage.removeItem(LOCAL_META_KEY);
    }
  }

  const stamp = Date.now();
  const [response, metaResponse] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}data/ttas.csv?refresh=${stamp}`, { cache: "no-store" }),
    fetch(`${import.meta.env.BASE_URL}data/metadata.json?refresh=${stamp}`, { cache: "no-store" }).catch(() => null),
  ]);
  if (!response.ok) throw new Error("The published dataset could not be loaded.");
  const csv = await response.text();
  const workbook = XLSX.read(csv, { type: "string" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "" });
  const result = recordsFromRows(rows, "ttas.csv");
  if (result.errors.length) throw new Error(result.errors[0]);

  let updatedAt = response.headers.get("last-modified") ?? "";
  if (metaResponse?.ok) {
    try {
      const meta = await metaResponse.json() as PublishedMeta;
      if (typeof meta.updatedAt === "string") updatedAt = meta.updatedAt;
    } catch {
      // The CSV response date remains a safe fallback.
    }
  }
  return { records: result.records, requirements: result.requirements, sourceLabel: "Published dataset", updatedAt };
}

export async function loadChangeHistory(): Promise<ChangeHistory | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/changes.json?refresh=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const history = await response.json() as ChangeHistory;
    return history && typeof history.available === "boolean" && Array.isArray(history.records) && Array.isArray(history.fields) ? history : null;
  } catch {
    return null;
  }
}

export function saveLocalData(dataset: TtasDataset, fileName: string): string {
  const importedAt = new Date().toISOString();
  localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(dataset));
  localStorage.setItem(LOCAL_META_KEY, JSON.stringify({ fileName, importedAt }));
  return importedAt;
}

export function clearLocalData(): void {
  localStorage.removeItem(LOCAL_DATA_KEY);
  localStorage.removeItem(LOCAL_META_KEY);
  LEGACY_LOCAL_DATA_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function recordsToCsv(dataset: TtasDataset): string {
  const headers = [
    SSOP_HEADER,
    ...dataset.requirements.flatMap((requirement) => requirement.isFinal ? [CTO_HEADER, requirement.source] : [requirement.source]),
    DESCRIPTION_HEADER,
  ];
  const rows = dataset.records.map((record) => {
    const output: Record<string, string> = { [SSOP_HEADER]: record.ssop };
    dataset.requirements.forEach((requirement) => {
      if (requirement.isFinal) output[CTO_HEADER] = record.cto === "CHECK" ? "Check" : "OK";
      output[requirement.source] = record.statuses[requirement.source];
    });
    output[DESCRIPTION_HEADER] = record.description;
    return output;
  });
  return XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows, { header: headers }));
}

export function downloadCsv(dataset: TtasDataset): void {
  const blob = new Blob(["\ufeff", recordsToCsv(dataset)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "ttas.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
