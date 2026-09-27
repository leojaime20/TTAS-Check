export type RequirementStatus = "OK" | "NOK";
export type CtoStatus = "OK" | "CHECK";

export type RequirementDefinition = {
  source: string;
  label: string;
  short: string;
  isFinal: boolean;
};

export type TtasRecord = {
  ssop: string;
  description: string;
  cto: CtoStatus;
  statuses: Record<string, RequirementStatus>;
};

export type TtasDataset = {
  records: TtasRecord[];
  requirements: RequirementDefinition[];
};

export type LoadedDataset = TtasDataset & {
  sourceLabel: string;
  updatedAt: string;
};

export type ValidationResult = TtasDataset & {
  errors: string[];
  warnings: string[];
  fileName: string;
};
