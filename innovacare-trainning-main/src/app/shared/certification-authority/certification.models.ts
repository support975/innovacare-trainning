export type CertificationType =
  | 'regulatory'
  | 'professional'
  | 'academic'
  | 'continuing_education'
  | 'equivalency';

export type CertificationStatus = 'draft' | 'active' | 'archived';

export type CertificationSessionStatus =
  | 'draft'
  | 'applications_open'
  | 'applications_closed'
  | 'eligibility_review'
  | 'exam_scheduled'
  | 'exam_in_progress'
  | 'grading'
  | 'jury_review'
  | 'results_published'
  | 'archived';

export type CertificationExamMode = 'online' | 'onsite' | 'hybrid';

export type CandidateApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'missing_documents'
  | 'eligible'
  | 'rejected'
  | 'approved_for_exam'
  | 'exam_completed'
  | 'jury_review'
  | 'passed'
  | 'failed'
  | 'remediation_required'
  | 'archived';

export type EducationPath =
  | 'MINSANTE'
  | 'MINESUP'
  | 'FORMATION_PROFESSIONNELLE'
  | 'INTERNATIONAL'
  | 'OTHER';

export type ApplicationDocumentType =
  | 'diploma'
  | 'transcript'
  | 'license'
  | 'identity'
  | 'work_experience'
  | 'payment_proof'
  | 'other';

export type ApplicationDocumentStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'needs_replacement';

export type JuryDecision = 'passed' | 'failed' | 'remediation_required' | 'pending';

export type FinalCertificationDecision =
  | 'passed'
  | 'failed'
  | 'remediation_required'
  | 'rejected';

export type CertificationPermission =
  | 'certification.create'
  | 'certification.update'
  | 'certification.view'
  | 'certification.session.create'
  | 'certification.session.update'
  | 'certification.session.publish'
  | 'certification.application.submit'
  | 'certification.application.review'
  | 'certification.application.decide'
  | 'certification.results.publish'
  | 'certification.documents.review'
  | 'certification.jury.review';

export interface CertificationRuleSet {
  requiredDocumentsByPath?: Partial<Record<EducationPath, ApplicationDocumentType[]>>;
  notes?: string;
  minimumScorePct?: number | null;
  requiredExamIds?: string[];
  remediationProgramIds?: string[];
}

export interface Certification {
  id?: string;
  organizationId: string;
  name: string;
  description?: string;
  type: CertificationType;
  status: CertificationStatus;
  linkedProgramIds?: string[];
  linkedCourseIds?: string[];
  linkedExamIds?: string[];
  eligibilityRules?: CertificationRuleSet;
  passingRules?: CertificationRuleSet;
  certificateTemplateId?: string | null;
  createdBy?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

export interface CertificationSession {
  id?: string;
  certificationId: string;
  organizationId: string;
  name: string;
  description?: string;
  applicationStartDate?: string | null;
  applicationEndDate?: string | null;
  examStartDate?: string | null;
  examEndDate?: string | null;
  status: CertificationSessionStatus;
  examMode: CertificationExamMode;
  maxCandidates?: number | null;
  centers?: string[];
  linkedCourseIds?: string[];
  linkedExamIds?: string[];
  createdBy?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

export interface ExamResultSummary {
  blueprintId: string;
  percent: number;
  passed: boolean;
  correct: number;
  total: number;
  completedAt: any;
}

export interface MembershipCard {
  number: string;
  issuedAt: any;
  expiresAt: any;
  status: 'active' | 'expired' | 'revoked';
}

export interface GoodStandingCertificate {
  number: string;
  issuedAt: any;
  expiresAt: any;
}

export type RenewalStatus = 'not_required' | 'in_progress' | 'ready' | 'completed';

export interface CandidateApplication {
  id?: string;
  sessionId: string;
  candidateUserId: string;
  organizationId: string;
  status: CandidateApplicationStatus;
  profileSnapshot?: Record<string, any>;
  educationPath: EducationPath;
  documents?: ApplicationDocument[];
  reviewerNotes?: string;
  eligibilityDecision?: 'eligible' | 'rejected' | 'missing_documents' | null;
  eligibilityReviewedBy?: string | null;
  eligibilityReviewedAt?: any;
  paymentStatus?: 'not_started' | 'pending' | 'paid' | 'waived';
  examResult?: ExamResultSummary;
  examCompletedAt?: any;
  membershipCard?: MembershipCard;
  certificate?: GoodStandingCertificate;
  certificationApprovedBy?: string | null;
  certificationApprovedAt?: any;
  renewalStatus?: RenewalStatus;
  renewalCoursesCompleted?: string[];
  renewalPointsEarned?: number;
  renewalSubmittedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface ApplicationDocument {
  id?: string;
  applicationId: string;
  type: ApplicationDocumentType;
  fileUrl?: string;
  fileId?: string;
  status: ApplicationDocumentStatus;
  reviewNotes?: string;
  uploadedAt?: any;
  reviewedBy?: string | null;
  reviewedAt?: any;
}

export interface JuryReview {
  id?: string;
  applicationId: string;
  sessionId: string;
  juryMemberId: string;
  decision: JuryDecision;
  scoreSummary?: Record<string, any>;
  comments?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface CertificationDecision {
  id?: string;
  applicationId: string;
  sessionId: string;
  finalDecision: FinalCertificationDecision;
  decisionReason?: string;
  remediationProgramId?: string | null;
  authorizedForRegistry: boolean;
  decidedBy: string;
  decidedAt?: any;
  publishedAt?: any;
}

export interface CertificationAuditLog {
  id?: string;
  organizationId: string;
  actorUid?: string | null;
  action: string;
  targetType: string;
  targetId?: string;
  message?: string;
  createdAt?: any;
  meta?: Record<string, any>;
}
