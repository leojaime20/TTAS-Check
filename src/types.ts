export const REQUIREMENTS = [
  { key: "tap", source: "TAP", label: "TAP", short: "TAP", isFinal: false },
  { key: "ex", source: "EX", label: "EX", short: "EX", isFinal: false },
  { key: "pimsPunch", source: "PIMS Punch", label: "PIMS Punch", short: "PIMS", isFinal: false },
  { key: "spie", source: "SPIE", label: "SPIE", short: "SPIE", isFinal: false },
  { key: "nr13", source: "NR13", label: "NR13", short: "NR13", isFinal: false },
  { key: "sig", source: "SIG", label: "SIG", short: "SIG", isFinal: false },
  { key: "tagLines", source: "TagLines", label: "Tag Lines", short: "TAGS", isFinal: false },
  { key: "tools", source: "TOOLs", label: "Tools", short: "TOOLS", isFinal: false },
  { key: "training", source: "TRAINING", label: "Training", short: "TRAIN.", isFinal: false },
  { key: "finalStatus", source: "F.Status", label: "Final Step", short: "FINISH", isFinal: true },
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
