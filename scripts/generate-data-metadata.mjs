import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const csvRelativePath = "public/data/ttas.csv";
const csvPath = resolve(projectRoot, csvRelativePath);
const metadataPath = resolve(projectRoot, "public/data/metadata.json");
const changesPath = resolve(projectRoot, "public/data/changes.json");

const SSOP_HEADER = "SSOP";
const DESCRIPTION_HEADER = "Primeiro Description";
const CTO_HEADER = "CTO";
const STATUS_ALIASES = new Map([
  ["YES", "OK"], ["Y", "OK"], ["TRUE", "OK"], ["COMPLETE", "OK"], ["COMPLETED", "OK"],
  ["NO", "NOK"], ["N", "NOK"], ["FALSE", "NOK"], ["OPEN", "NOK"], ["INCOMPLETE", "NOK"], ["NOT OK", "NOK"],
]);

function cleanHeader(value) {
  return String(value ?? "").replace(/^\ufeff/, "").trim();
}

function normalizeValue(field, value) {
  const cleaned = String(value ?? "").trim();
  if (field === DESCRIPTION_HEADER) return cleaned;
  const upper = cleaned.toUpperCase();
  if (field === CTO_HEADER) return upper === "CHECK" ? "CHECK" : upper;
  return STATUS_ALIASES.get(upper) ?? upper;
}

function datasetFromCsv(csvText) {
  const workbook = XLSX.read(csvText, { type: "string" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("The TTAS CSV has no readable sheet.");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, defval: "" });
  const headers = (rows[0] ?? []).map(cleanHeader);
  const ssopIndex = headers.indexOf(SSOP_HEADER);
  if (ssopIndex < 0) throw new Error("The TTAS CSV is missing the SSOP column.");

  const records = new Map();
  for (const row of rows.slice(1)) {
    const ssop = String(row[ssopIndex] ?? "").trim();
    if (!ssop) continue;
    const values = Object.fromEntries(headers.map((header, index) => [header, normalizeValue(header, row[index])]));
    records.set(ssop, values);
  }
  return { headers, records };
}

function readiness(record, requirementFields) {
  return requirementFields.length > 0 && requirementFields.every((field) => record?.[field] === "OK");
}

function impactFor(field, before, after) {
  if (field === DESCRIPTION_HEADER || after === undefined) return "neutral";
  if (field === CTO_HEADER) {
    if (after === "CHECK" && before !== "CHECK") return "regression";
    if (before === "CHECK" && after === "OK") return "improvement";
    return "neutral";
  }
  if (after === "NOK" && before !== "NOK") return "regression";
  if (before === "NOK" && after === "OK") return "improvement";
  return "neutral";
}

export function compareCsvTexts(currentCsv, previousCsv, version = {}) {
  const current = datasetFromCsv(currentCsv);
  const previous = datasetFromCsv(previousCsv);
  const currentRequirements = current.headers.filter((field) => ![SSOP_HEADER, CTO_HEADER, DESCRIPTION_HEADER].includes(field));
  const previousRequirements = previous.headers.filter((field) => ![SSOP_HEADER, CTO_HEADER, DESCRIPTION_HEADER].includes(field));
  const fields = [...new Set([...current.headers, ...previous.headers])].filter((field) => field !== SSOP_HEADER);
  const ssops = [...new Set([...current.records.keys(), ...previous.records.keys()])];
  const fieldSummary = new Map();
  const records = [];
  let regressions = 0;
  let improvements = 0;
  let readinessLost = 0;
  let readinessGained = 0;
  let added = 0;
  let removed = 0;

  for (const ssop of ssops) {
    const currentRecord = current.records.get(ssop);
    const previousRecord = previous.records.get(ssop);
    if (!previousRecord && currentRecord) {
      added += 1;
      records.push({ ssop, description: currentRecord[DESCRIPTION_HEADER], kind: "added", wasReady: null, isReady: readiness(currentRecord, currentRequirements), changes: [] });
      continue;
    }
    if (previousRecord && !currentRecord) {
      removed += 1;
      records.push({ ssop, description: previousRecord[DESCRIPTION_HEADER], kind: "removed", wasReady: readiness(previousRecord, previousRequirements), isReady: null, changes: [] });
      continue;
    }
    if (!currentRecord || !previousRecord) continue;

    const changes = [];
    for (const field of fields) {
      const before = previous.headers.includes(field) ? previousRecord[field] : undefined;
      const after = current.headers.includes(field) ? currentRecord[field] : undefined;
      if (before === after) continue;
      const impact = impactFor(field, before, after);
      changes.push({ field, before: before ?? null, after: after ?? null, impact });
      const summary = fieldSummary.get(field) ?? { field, total: 0, regressions: 0, improvements: 0, neutral: 0 };
      summary.total += 1;
      summary[impact === "regression" ? "regressions" : impact === "improvement" ? "improvements" : "neutral"] += 1;
      fieldSummary.set(field, summary);
      if (impact === "regression") regressions += 1;
      if (impact === "improvement") improvements += 1;
    }
    if (!changes.length) continue;

    const wasReady = readiness(previousRecord, previousRequirements);
    const isReady = readiness(currentRecord, currentRequirements);
    if (wasReady && !isReady) readinessLost += 1;
    if (!wasReady && isReady) readinessGained += 1;
    changes.sort((a, b) => ({ regression: 0, improvement: 1, neutral: 2 })[a.impact] - ({ regression: 0, improvement: 1, neutral: 2 })[b.impact]);
    records.push({ ssop, description: currentRecord[DESCRIPTION_HEADER], kind: "changed", wasReady, isReady, changes });
  }

  records.sort((a, b) => {
    const priority = (record) => record.kind === "changed" && record.changes.some((change) => change.impact === "regression") ? 0 : record.kind === "changed" ? 1 : 2;
    return priority(a) - priority(b) || a.ssop.localeCompare(b.ssop, undefined, { numeric: true });
  });

  return {
    available: true,
    currentDate: version.currentDate ?? "",
    previousDate: version.previousDate ?? "",
    currentVersion: version.currentVersion ?? "",
    previousVersion: version.previousVersion ?? "",
    summary: {
      changedSsops: records.length,
      regressions,
      improvements,
      readinessLost,
      readinessGained,
      added,
      removed,
    },
    fields: [...fieldSummary.values()].sort((a, b) => b.regressions - a.regressions || b.total - a.total || a.field.localeCompare(b.field)),
    records,
  };
}

function gitFileVersions() {
  try {
    const output = execFileSync("git", ["log", "--format=%H%x09%cs", "--", csvRelativePath], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
    return output.split("\n").filter(Boolean).map((line) => {
      const [hash, date] = line.split("\t");
      return { hash, date };
    });
  } catch {
    return [];
  }
}

function csvAtCommit(hash) {
  try {
    return execFileSync("git", ["show", `${hash}:${csvRelativePath}`], {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

async function generateDataArtifacts() {
  const currentCsv = await readFile(csvPath, "utf8");
  const versions = gitFileVersions();
  const latestCommittedCsv = versions[0] ? csvAtCommit(versions[0].hash) : null;
  const matchesLatestCommit = latestCommittedCsv === currentCsv;
  const currentVersion = matchesLatestCommit && versions[0]
    ? versions[0]
    : { hash: "working-tree", date: (await stat(csvPath)).mtime.toISOString().slice(0, 10) };
  const previousCandidates = matchesLatestCommit ? versions.slice(1) : versions;
  const previousVersion = previousCandidates.find((candidate) => csvAtCommit(candidate.hash) !== null);
  const previousCsv = previousVersion ? csvAtCommit(previousVersion.hash) : null;

  const history = previousVersion && previousCsv
    ? compareCsvTexts(currentCsv, previousCsv, {
        currentDate: currentVersion.date,
        previousDate: previousVersion.date,
        currentVersion: currentVersion.hash.slice(0, 7),
        previousVersion: previousVersion.hash.slice(0, 7),
      })
    : {
        available: false,
        currentDate: currentVersion.date,
        previousDate: "",
        currentVersion: currentVersion.hash.slice(0, 7),
        previousVersion: "",
        summary: { changedSsops: 0, regressions: 0, improvements: 0, readinessLost: 0, readinessGained: 0, added: 0, removed: 0 },
        fields: [],
        records: [],
      };

  await mkdir(dirname(metadataPath), { recursive: true });
  await Promise.all([
    writeFile(metadataPath, `${JSON.stringify({ updatedAt: currentVersion.date }, null, 2)}\n`, "utf8"),
    writeFile(changesPath, `${JSON.stringify(history, null, 2)}\n`, "utf8"),
  ]);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) await generateDataArtifacts();
