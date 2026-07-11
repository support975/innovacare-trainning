export type PolicyLanguage = 'en' | 'fr';
export type PolicyStatus = 'active' | 'archived';

export interface Policy {
  id?: string;
  orgId?: string | null;
  scope?: 'platform' | 'organization';
  sourcePolicyId?: string | null;
  createdByUid?: string;

  status: PolicyStatus;
  title: string;
  category: string;
  language: PolicyLanguage;

  // Versioning / dates
  version: string;
  effectiveDate: string;     // yyyy-mm-dd
  lastRevised?: string;      // yyyy-mm-dd
  nextReview?: string;       // yyyy-mm-dd

  // Optional meta
  area?: string;
  owner?: string;

  // Access / compliance (tu peux garder mais on ne bloque pas la lecture)
  requiresAcknowledgement: boolean;
  blocking?: boolean;

  // Content
  contentHtml: string;
  referencesHtml?: string;

  // Audit
  createdAt?: any;
  updatedAt?: any;
  updatedBy?: string;
}

export interface PolicyAcknowledgement {
  id?: string;
  orgId: string;
  policyId: string;
  policyVersion: string;
  userId: string;
  acknowledgedAt: any;
}

export interface PolicyAssignment {
  id?: string;
  orgId: string;
  policyId: string;
  userId: string;
  assignedByUid: string;
  assignedAt: any;
  active: boolean;
}
