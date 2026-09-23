import * as XLSX from "xlsx";
import { REQUIREMENTS, type CtoStatus, type RequirementStatus, type TtasRecord, type ValidationResult } from "./types";

export const LOCAL_DATA_KEY = "ttas-check-data-v3";
export const LOCAL_META_KEY = "ttas-check-meta-v3";

const LEGACY_LOCAL_DATA_KEYS = ["ttas-check-data-v1", "ttas-check-meta-v1", "ttas-check-data-v2", "ttas-check-meta-v2"];

const DESCRIPTION_HEADER = "Primeiro Description";
const CTO_HEADER = "CTO";
const REQUIRED_HEADERS = [
  "SSOP",
  ...REQUIREMENTS.flatMap((item) => item.isFinal ? [CTO_HEADER, item.source] : [item.source]),
  DESCRIPTION_HEADER,
];

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

export function recordsFromRows(rows: unknown[][], fileName = "dataset"): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!rows.length) return { records: [], errors: ["The file is empty."], warnings, fileName };

  const headers = rows[0].map(cleanHeader);
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) {
    return { records: [], errors: [`Missing required columns: ${missing.join(", ")}.`], warnings, fileName };
  }

  const column = Object.fromEntries(headers.map((header, index) => [header, index]));
  const records: TtasRecord[] = [];
  const seen = new Set<string>();

  rows.slice(1).forEach((row, rowIndex) => {
    const displayRow = rowIndex + 2;
    if (row.every((cell) => String(cell ?? "").trim() === "")) return;

    const ssop = String(row[column.SSOP] ?? "").trim();
    const description = String(row[column[DESCRIPTION_HEADER]] ?? "").trim();
    if (!ssop) {
      errors.push(`Row ${displayRow}: SSOP is required.`);
      return;
    }
    if (!description) errors.push(`Row ${displayRow}: description is required.`);
    if (seen.has(ssop)) errors.push(`Row ${displayRow}: duplicate SSOP ${ssop}.`);
    seen.add(ssop);

    const statuses = {} as Record<(typeof REQUIREMENTS)[number]["key"], RequirementStatus>;
    const cto = normalizeCtoStatus(row[column[CTO_HEADER]]);
    let valid = true;
    if (!cto) {
      errors.push(`Row ${displayRow}, ${CTO_HEADER}: use OK or Check.`);
      valid = false;
    }
    REQUIREMENTS.forEach((requirement) => {
      const status = normalizeStatus(row[column[requirement.source]]);
      if (!status) {
        errors.push(`Row ${displayRow}, ${requirement.source}: use OK or NOK.`);
        valid = false;
      } else {
        statuses[requirement.key] = status;
      }
    });

    if (valid && cto && description && !records.some((record) => record.ssop === ssop)) {
      records.push({ ssop, description, cto, ...statuses });
    }
  });

  if (records.length > 600) warnings.push(`The file contains ${records.length} records. Performance is optimized for up to 600.`);
  if (!records.length && !errors.length) errors.push("No data rows were found.");
  return { records, errors, warnings, fileName };
}

export async function parseSpreadsheet(file: File): Promise<ValidationResult> {
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return { records: [], errors: ["The workbook has no worksheets."], warnings: [], fileName: file.name };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheet], { header: 1, defval: "" });
  return recordsFromRows(rows, file.name);
}

export async function loadPublishedData(): Promise<TtasRecord[]> {
  LEGACY_LOCAL_DATA_KEYS.forEach((key) => localStorage.removeItem(key));
  const stored = localStorage.getItem(LOCAL_DATA_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as unknown;
      const isCurrentDataset = Array.isArray(parsed)
        && parsed.length > 0
        && parsed.every((record) => {
          if (!record || typeof record !== "object") return false;
          const candidate = record as Record<string, unknown>;
          return typeof candidate.ssop === "string"
            && typeof candidate.description === "string"
            && ["OK", "CHECK"].includes(String(candidate.cto))
            && REQUIREMENTS.every((requirement) => ["OK", "NOK"].includes(String(candidate[requirement.key])));
        });
      if (isCurrentDataset) return parsed as TtasRecord[];
      localStorage.removeItem(LOCAL_DATA_KEY);
      localStorage.removeItem(LOCAL_META_KEY);
    } catch {
      localStorage.removeItem(LOCAL_DATA_KEY);
      localStorage.removeItem(LOCAL_META_KEY);
    }
  }

  const response = await fetch(`${import.meta.env.BASE_URL}data/ttas.csv?refresh=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("The published dataset could not be loaded.");
  const csv = await response.text();
  const workbook = XLSX.read(csv, { type: "string" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "" });
  const result = recordsFromRows(rows, "ttas.csv");
  if (result.errors.length) throw new Error(result.errors[0]);
  return result.records;
}

export function saveLocalData(records: TtasRecord[], fileName: string): void {
  localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(records));
  localStorage.setItem(LOCAL_META_KEY, JSON.stringify({ fileName, importedAt: new Date().toISOString() }));
}

export function clearLocalData(): void {
  localStorage.removeItem(LOCAL_DATA_KEY);
  localStorage.removeItem(LOCAL_META_KEY);
  LEGACY_LOCAL_DATA_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function recordsToCsv(records: TtasRecord[]): string {
  const rows = records.map((record) => {
    const output: Record<string, string> = { SSOP: record.ssop };
    REQUIREMENTS.forEach((requirement) => {
      if (requirement.isFinal) output[CTO_HEADER] = record.cto === "CHECK" ? "Check" : "OK";
      output[requirement.source] = record[requirement.key];
    });
    output[DESCRIPTION_HEADER] = record.description;
    return output;
  });
  return XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows, { header: REQUIRED_HEADERS }));
}

export function downloadCsv(records: TtasRecord[]): void {
  const blob = new Blob(["\ufeff", recordsToCsv(records)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "ttas.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
