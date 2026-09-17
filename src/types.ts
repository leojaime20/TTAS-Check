export const REQUIREMENTS = [
  { key: "tap", source: "TAP", label: "TAP", short: "TAP" },
  { key: "ex", source: "EX", label: "EX", short: "EX" },
  { key: "nr13", source: "NR13", label: "NR13", short: "NR13" },
  { key: "pimsPunch", source: "PIMS Punch", label: "PIMS Punch", short: "PIMS" },
  { key: "spie", source: "SPIE", label: "SPIE", short: "SPIE" },
  { key: "sig", source: "SIG", label: "SIG", short: "SIG" },
  { key: "tools", source: "TOOLs", label: "Tools", short: "TOOLS" },
  { key: "training", source: "TRAINING", label: "Training", short: "TRAIN." },
  { key: "finalStatus", source: "F.Status", label: "Final Status", short: "FINAL" },
] as const;

export type RequirementKey = (typeof REQUIREMENTS)[number]["key"];
export type RequirementStatus = "OK" | "NOK";

export type TtasRecord = {
  ssop: string;
  description: string;
} & Record<RequirementKey, RequirementStatus>;

export type ValidationResult = {
  records: TtasRecord[];
  errors: string[];
  warnings: string[];
  fileName: string;
};
