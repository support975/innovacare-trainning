// src/app/manager/wound.model.ts
export interface Treatment {
  title: string;
  description?: string;
  steps?: string[];                 // step-by-step guidance
  recommendedFrequency?: string;
  products?: string[];
  evidenceLevel?: string;
  notes?: string;
}

export interface Dressing {
  type: string;
  description?: string;
  indications?: string[];
  absorptionCapacity?: string;
  recommendedChangeFrequency?: string;
  advantages?: string[];
  disadvantages?: string[];
  notes?: string;
}

export interface ProgressEntry {
  date?: any;
  note?: string;
  images?: string[];
  status?: string;                    // e.g. "improving" | "stable" | "worse"
  clinicianId?: string;
}

export interface EvaluationEntry {
  date?: any;
  clinicianId?: string;
  woundSize?: { length?: number; width?: number; depth?: number; unit?: string };
  exudate?: string;
  infectionSigns?: string;
  painScore?: number;
  comments?: string;
  photos?: string[];
  score?: number;
}

export interface PatientEducation {
  shortHandout?: string;              // brief text for patients
  printableUrl?: string;              // optional PDF URL
  languages?: { [lang: string]: string }; // localized handouts
}

export interface Reference {
  title: string;
  authors?: string;
  year?: number;
  url?: string;
  source?: string;                    // e.g. NICE, Journal name
  note?: string;
}

export interface WoundType {
  woundId?: string;
  orgId?: string | null;
  resourceKind?: 'quick_sheet' | 'wound_reference';
  name: string;
  synonyms?: string[];            // alternate names
  category?: string;              // e.g. "Pressure Ulcer"
  shortDescription?: string;
  fullDescription?: string;
  characteristics?: string[];     // key features
  pathophysiology?: string;
  riskFactors?: string[];         // comma separated in UI
  tags?: string[];                // for searching/filtering
  treatmentOptions?: Treatment[];
  dressingOptions?: Dressing[];
  progress?: ProgressEntry[];
  evaluations?: EvaluationEntry[];
  images?: string[];              // storage or external URLs (optional)
  videos?: string[];
  patientEducation?: PatientEducation;
  references?: Reference[];
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  isActive?: boolean;
}
