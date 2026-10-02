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

export type ChangeImpact = "regression" | "improvement" | "neutral";

export type FieldChange = {
  field: string;
  before: string | null;
  after: string | null;
  impact: ChangeImpact;
};

export type ChangedSsop = {
  ssop: string;
  description: string;
  kind: "changed" | "added" | "removed";
  wasReady: boolean | null;
  isReady: boolean | null;
  changes: FieldChange[];
};

export type ChangeFieldSummary = {
  field: string;
  total: number;
  regressions: number;
  improvements: number;
  neutral: number;
};

export type ChangeHistory = {
  available: boolean;
  currentDate: string;
  previousDate: string;
  currentVersion: string;
  previousVersion: string;
  summary: {
    changedSsops: number;
    regressions: number;
    improvements: number;
    readinessLost: number;
    readinessGained: number;
    added: number;
    removed: number;
  };
  fields: ChangeFieldSummary[];
  records: ChangedSsop[];
};
