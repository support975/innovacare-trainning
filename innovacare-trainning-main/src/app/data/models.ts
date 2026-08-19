export type OrgType = 'health' | 'IT' | 'school'
  | 'professional_order' | 'nursing_council' | 'university' | 'hospital'
  | 'ngo' | 'private_training_org' | 'scientific_society';
export interface HealthMeta {
  healthCareType: 'SNF' | 'HomeHealth' | 'Hospice' | 'Hospital' | 'PrivatePractice' | 'PHCP';
}

export interface OrganizationBranding {
  displayName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  senderName?: string;
  senderEmail?: string;
  supportEmail?: string;
  /** Gated by Organization.canWhiteLabel. */
  hidePlatformBranding?: boolean;
  /** Gated by Organization.canWhiteLabel. A request, not a live toggle — see customDomainStatus. */
  customDomain?: string;
  /** Self-serve can only set 'none'/'pending'; only Super Admin sets 'active' once DNS/SSL is provisioned. */
  customDomainStatus?: 'none' | 'pending' | 'active';
}

export interface Organization {
  id: string;
  name: string;
  type: OrgType;

  plan: 'free'|'pro'|'enterprise';

  branding?: OrganizationBranding;
  /** Super-Admin-only, independent of canCreateSubOrgs: gates hidePlatformBranding/customDomain. */
  canWhiteLabel?: boolean;

  certificationAuthorityEnabled?: boolean;

  /** Direct parent org id, e.g. a regional org under a council. Absent/null for top-level orgs. */
  parentOrgId?: string | null;
  /** Materialized path from root ancestor to direct parent (Firestore rules can't do recursive parent lookups). */
  ancestorOrgIds?: string[];
  /** Super-Admin-only: this org may create its own child orgs ("council"). */
  canCreateSubOrgs?: boolean;

  /** Self-serve sandbox org created via the public "Test the demo" flow, seeded with fake data. */
  isDemo?: boolean;
  /** Firestore Timestamp; the scheduled cleanup job deletes the org and its seeded data after this. */
  demoExpiresAt?: any;
  /** uid of the real (anonymous-auth) visitor running the demo as admin. */
  demoAdminUid?: string;
  /** uid of the seeded fake employee used for the "View as Learner" preview. */
  demoLearnerUid?: string;
  /** courses/{id} seeded alongside this demo org, assignable from its Assignment Center. */
  demoCourseId?: string;

  createdAt: any;
}
export interface Course {
  id?: string;
  title: string;
  subtitle?: string;
  description: string;
  lang: 'EN'|'FR'|'ES';
  durationMin: number;          // total runtime estimate
  ceCredit?: number;            // continuing-education credits (optional)
  sortOrder?: number;           // platform catalogue ordering
  active: boolean;
  tags?: string[];
  imageUrl?: string;            // banner/thumbnail
  createdAt?: any;              // serverTimestamp
  updatedAt?: any;
  kind: 'Course' | 'Text' | 'Module';
  url: string;                  // canonical URL (optional)

  // Embedded content: sections -> lessons -> blocks
  sections: Section[];

  lecturer: string;
  disclosures: string[];
  targetAudience: string[];
  prerequisites: string[];
  requirements: string[];
  accomodations: string;             // canonical URL (optional)
  orgId?: string | null;
  assignedOrgIds?: string[];
  orgType?: OrgType;
  healthMeta?: HealthMeta;
  releaseAt?: any;              // serverTimestamp
  publishedAt?: any;            // serverTimestamp
  isPublic?: boolean;           // B2C vs B2B
  allowedEmailDomains?: string[]; // optional learner visibility/access restriction
  passingScore: number;         // e.g. 80
  lockedSequence: boolean;      // require module order
  exipirationDate?: any;        // serverTimestamp
  confirmAt?:any;
  confirmBy?:string;
  confirmMessage?:string;
  type: 'It' |'Health' | 'Hr' | 'safety'
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  certification?: boolean;      // enable exam blueprint creation for this course
  accreditationId?: string;     // FK into accreditations, supersedes the flat ceCredit field going forward

}

/** Reusable speaker profile — attached to webinars/events (and later, faculty-led courses). */
export interface Faculty {
  id?: string;
  ownerOrgId: string;
  name: string;
  title?: string;                 // e.g. "RN, BSN, CWCN"
  photoUrl?: string;
  bio?: string;
  credentials?: string;
  organization?: string;          // employer/affiliation, distinct from ownerOrgId
  cvUrl?: string;
  financialDisclosure?: string;
  conflictOfInterest?: string;
  speakerProfileUrl?: string;
  createdAt?: any;
  updatedAt?: any;
}

/** Reusable sponsor profile — attached to webinars/events for commercial-support disclosure. */
export interface Sponsor {
  id?: string;
  ownerOrgId: string;
  name: string;
  logoUrl?: string;
  website?: string;
  description?: string;
  supportLevel?: 'platinum' | 'gold' | 'silver' | 'grant';
  commercialDisclosure?: string;
  grantInformation?: string;
  createdAt?: any;
  updatedAt?: any;
}

/**
 * A reusable accreditation/CE record — created once, then referenced by
 * accreditationId from multiple Courses/WebinarEvents, so the same
 * accrediting-body disclosures don't get retyped for every webinar.
 */
export interface Accreditation {
  id?: string;
  ownerOrgId: string;
  accreditingOrganization: string;
  providerNumber?: string;
  approvalNumber?: string;
  contactHours: number;
  ceCredits: number;
  expirationDate?: any;
  targetAudience?: string[];
  learningObjectives?: string[];
  awardCriteria?: string;
  conflictOfInterestStatement?: string;
  facultyDisclosureRequired?: boolean;
  commercialSupportStatement?: string;
  disclaimer?: string;
  evaluationRequirements?: string;
  certificateRequirements?: string;
  applicableBoards?: string[];
  applicableCertifications?: string[];
  createdAt?: any;
  updatedAt?: any;
}

/**
 * A live webinar/event, independent of Course. Named WebinarEvent (not
 * Event) to avoid colliding with the DOM's global Event type used throughout
 * Angular event handlers.
 *
 * Distribution mirrors Course exactly: ownerOrgId + assignedOrgIds +
 * assignedOrgReachableIds (kept in sync by onEventAssignedOrgIdsChange, same
 * shape as onCourseAssignedOrgIdsChange) + isPublic. Guest/individual
 * registration reuses the existing accountType:'individual', orgId:null
 * pattern from core/auth.ts's public self-serve signup — no separate
 * "public org" concept.
 */
export interface WebinarEvent {
  id?: string;
  title: string;
  description?: string;
  imageUrl?: string;     // banner/cover photo shown on catalogs and the detail page
  ownerOrgId: string;
  assignedOrgIds?: string[];
  assignedOrgReachableIds?: string[];
  isPublic?: boolean;

  facultyIds?: string[];
  sponsorIds?: string[];
  accreditationId?: string;

  schedule: {
    date: any;            // Firestore Timestamp, event date
    startTime: string;    // e.g. "13:00"
    endTime: string;
    timezone: string;     // IANA tz, e.g. "America/New_York"
  };

  zoom?: {
    meetingType?: 'meeting' | 'webinar';
    /** Phase 1: a static shared link. Never the host URL — that must stay server-side. */
    joinUrl?: string;
  };

  pricing: {
    memberPrice: number | null;  // null = free for members
    guestPrice: number;          // individuals/guests always pay this
  };
  capacity?: number;
  /** Maintained server-side by onEventRegistrationCountChange — never written from the client. */
  registeredCount?: number;
  waitlistEnabled?: boolean;

  recordingUrl?: string;
  autoConvertToCourse?: boolean;

  status: 'draft' | 'published' | 'live' | 'completed' | 'cancelled';
  active: boolean;

  createdAt?: any;
  updatedAt?: any;
}

export interface EventRegistration {
  id?: string;
  eventId: string;
  uid: string;
  /** null for individual/guest registrants — matches Course enrollment's orgId:null pattern. */
  orgId?: string | null;
  tier: 'member' | 'guest';

  paymentStatus: 'free' | 'pending' | 'paid';
  stripeSessionId?: string;
  stripePaymentIntentId?: string;

  attended?: boolean | null;   // set later by the Zoom attendance webhook (phase 2)
  evaluationSubmitted?: boolean;
  certificateId?: string | null;

  createdAt?: any;
  updatedAt?: any;
}

export interface Section {
  [x: string]: any;
  id: string;                   // stable key (slug/uuid)
  title: string;                // e.g. “Ethics Training”
  lessons: Lesson[];
}

export interface Lesson {
  id: string;                   // stable key
  title: string;                // e.g. “Ethical Concepts”
  estMin?: number;
  blocks: Block[];             // renderable content blocks
}


  export interface Enrollment {
    startedAt: any;              // serverTimestamp
    completedAt?: any;
    // gatekeeping: which lessons are done
    doneLessons: string[];       // array of Lesson.id
    // optional: per-lesson timestamps, quiz scores, etc.
    scores?: Record<string, number>;
    id: string;
    courseId: string;
    status: EnrollmentStatus;
    progressPct: number;    // 0..100
    unlockedIndex: number;  // highest unlocked section inde
  }
  // src/app/data/exams.models.ts
export interface Exam {
  id?: string;
  title: string;
  available: boolean;
  pointsPerQuestion: number; // ex: 10
  passPct: number;           // ex: 80
  totalQuestions?: number;   // dérivé (optionnel)
  updatedAt?: any;
  createdAt?: any;
  questions: any;
  
  
}

export interface ExamOption {
  id: string;           // uid court
  text: string;
  correct: boolean;
  explanation?: string; // affichée après correction
}

export interface HealthMeta {
  specialty?: string;
  careSetting?: string[];
  clinicalTopics?: string[];
}

export interface ExamQuestion {
  id?: string;
  prompt: string;       // énoncé
  mode: QuestionMode;   // single/multi
  options: ExamOption[]; // 2..n réponses
  order: number;        // tri
  points?: number;      // par défaut = exam.pointsPerQuestion
  updatedAt?: any;
  createdAt?: any;

}

export interface LicenseDoc {
  id?: string;
  state: string;                 // "GA"
  type: string;                  // "Registered Nurse (RN)"
  number: string;                // "RN331501"
  renewalDate?: any;             // Timestamp | ISO string
  renewalPeriodMonths?: number;  // 12
  hours?: number;                // optional
  reminderWeeks?: number;        // 8
  createdAt?: any;
  updatedAt?: any;
}

export type HonorLabel = 'Pass' | 'Merit' | 'Honors' | 'High Honors';

export type RewardType =
  | 'certificate'
  | 'badge'
  | 'points'
  | 'credit_hours';

export interface RewardDoc {
  id?: string;

  type: RewardType;

  // Link
  uid: string;
  courseId: string;
  examId?: string;

  // Display
  title: string;
  description?: string;

  // Value
  points?: number;
  hours?: number;
  creditUnit?: string;

  // Exam outcome
  score?: number;
  honor?: HonorLabel;

  // Certificate
  certificateId?: string;
  certificateNo?: string;

  // Meta
  issuedAt: any; // Firestore Timestamp
  issuedBy: 'system' | 'admin';
  status: 'active' | 'revoked' | 'expired';
}

export interface CertificateDoc {
  id?: string;

  uid: string;
  userName: string;
  userEmail: string;

  courseId: string;
  courseTitle: string;

  score: number;
  honor: HonorLabel;

  hours: number;
  creditUnit?: string;

  certificateNo: string;
  issuedAt: any;

  organization: 'Innovacare Training';

  pdfUrl?: string;       // (si plus tard tu génères un PDF serveur)
  verifyHash: string;    // pour vérification publique
}

export interface RewardWalletDoc {
  uid: string;
  totalPoints: number;
  updatedAt: any;
}

export interface Certificate {
  id?: string;

  uid: string;
  userName: string;
  userEmail: string;

  courseId: string;
  courseTitle: string;

  score: number;
  honor: 'Pass'|'Merit'|'Honors'|'High Honors';

  hours: number;
  creditUnit?: string;

  certificateNo: string;        // ICT-2025-XXXX
  issuedAt: any;

  organization: 'Innovacare Training';

  pdfUrl?: string;
  verifyHash: string;           // public verification
}
export interface Badge {
  id: string;
  name: string;               // "Wound Care Expert"
  iconUrl: string;
  description: string;
  level?: 'bronze'|'silver'|'gold';
}

export interface TranscriptRow {
  courseId: string;
  title: string;
  completedAt: any;
  hours: number;
  score?: number;
  honor?: string;
  certificateId?: string;   // 🔗
}

export type EnrollmentStatus = 'not-started' | 'in-progress' | 'completed';

export interface Section {
  id: string;                   // stable key (slug/uuid)
  title: string;                // e.g. “Ethics Training”
  lessons: Lesson[];
  order: number;                // tri
  estMin?: number;              // total runtime estimate
  estMax?: number;              // total runtime estimate
  estAvg?: number;              // total runtime estimate
  estTotal?: number;            // total runtime estimate
  estTotalHours?: number;       // total runtime estimate
  estTotalCreditUnits?: number; // total runtime estimate
  estTotalCreditHours?: number; // total runtime estimate
  estTotalHoursPerCreditUnit?: number; // total runtime estimate
  estTotalCreditUnitsPerHour?: number; // total runtime estimate
  estTotalHoursPerCreditHour?: number; // total runtime estimate
}

export interface Lesson {
  id: string;                   // stable key
  title: string;                // e.g. “Ethical Concepts”
  estMin?: number;
  blocks: Block[];              // renderable content blocks
  continueMode?: 'guided' | 'free';
  order: number;                // tri
  createdAt?: any;              // serverTimestamp
  updatedAt?: any;
}

export type Block =
  | { id?: string; type: 'heading'; level?: 1|2|3; text: string; required?: boolean }
  | { id?: string; type: 'text'; html: string; required?: boolean }                 // sanitized HTML or markdown->HTML
  | { id?: string; type: 'image'; url: string; alt?: string; caption?: string; required?: boolean }
  | { id?: string; type: 'audio'; title?: string; url: string; transcript?: string; required?: boolean }
  | { id?: string; type: 'video'; url: string; transcript?: string; required?: boolean }
  | { id?: string; type: 'hero'; title?: string; bodyHtml?: string; imageUrl?: string; buttonLabel?: string; required?: boolean }
  | {
      id?: string;
      type: 'accordion';
      title?: string;
      introHtml?: string;
      linkedQuizId?: string;
      required?: boolean;
      items: {
        id: string;
        title: string;
        bodyHtml: string;
        required?: boolean;
      }[];
    }
  | {
      id?: string;
      type: 'cardStack';
      title?: string;
      introHtml?: string;
      variant?: 'flip' | 'gated';
      linkedQuizId?: string;
      required?: boolean;
      cards: {
        id: string;
        title: string;
        teaser?: string;
        bodyHtml: string;
        imageUrl?: string;
        required?: boolean;
      }[];
    }
  | { id?: string; type: 'quizIntro'; title?: string; bodyHtml?: string; buttonLabel?: string; passPct?: number; linkedQuizId?: string; required?: boolean }
  | {
      id?: string;
      type: 'tabs';
      title?: string;
      introHtml?: string;
      linkedQuizId?: string;
      required?: boolean;
      tabs: {
        id: string;
        label: string;
        title?: string;
        bodyHtml: string;
        imageUrl?: string;
        imageAlt?: string;
        required?: boolean;
      }[];
    }
  | {
      id?: string;
      type: 'slideDeck';
      theme?: 'default' | 'focus';
      linkedQuizId?: string;
      required?: boolean;
      slides: {
        id: string;
        title?: string;
        imageUrl: string;
        audioUrl?: string;
        transcript?: string;
        notesHtml?: string;
        interactiveCards?: {
          id: string;
          title: string;
          teaser?: string;
          bodyHtml: string;
          imageUrl?: string;
          variant?: 'default' | 'flip' | 'hotspot' | 'sequence';
          hotspotX?: number;
          hotspotY?: number;
        }[];
      }[];
    }
  | { id?: string; type: 'callout'; style?: 'info'|'warn'|'success'; html: string; required?: boolean }
  | { id?: string; type: 'quiz'; mode: 'single'|'multi'| 'caseStudy'; question: string; linkedQuizId?: string; required?: boolean; choices: { id:string; text:string; correct:boolean }[] }
  | {
      id?: string;
      type: 'carousel';
      title?: string;
      required?: boolean;
      slides: {
        id: string;
        imageUrl?: string;
        heading?: string;
        bodyHtml?: string;
        buttonLabel?: string;
        buttonAction?: 'url' | 'nextLesson' | 'markComplete';
        buttonUrl?: string;
      }[];
    };


  export interface Enrollment {
    startedAt: any;              // serverTimestamp
    completedAt?: any;
    // gatekeeping: which lessons are done
    doneLessons: string[];       // array of Lesson.id
    // optional: per-lesson timestamps, quiz scores, etc.
    scores?: Record<string, number>;
    id: string;
    mode?: 'guest' | 'organization' | 'individual';
    accessMode?: 'individual' | 'organization' | 'approved_individual';
    paymentStatus?: 'not_started' | 'pending' | 'paid' | 'waived';
    accessRequestId?: string;
    courseId: string;
    uid: string;
    orgId?: string | null;
    orgType?: OrgType;
healthMeta?: HealthMeta;
    status: EnrollmentStatus;
    progressPct: number;    // 0..100
    unlockedIndex: number;  // highest unlocked section inde
  }

  const enrollmentConv = {
    toFirestore(e: Enrollment) { return e; },
    fromFirestore: (snap: any) => ({ id: snap.id, ...snap.data() } as Enrollment),
  };
  const courseConv = {
    toFirestore(c: Course) { return c; },
    fromFirestore: (snap: any) => ({ id: snap.id, ...snap.data() } as Course),
  };
  // src/app/data/exams.models.ts
export interface Exam {
  id?: string;
  orgId?: string | null;
  orgType?: OrgType;
  courseId: string;
  title: string;
  available: boolean;
  pointsPerQuestion: number; // ex: 10
  passPct: number;           // ex: 80
  totalQuestions?: number;   // dérivé (optionnel)
  updatedAt?: any;
  createdAt?: any;
  questions: any;
  
  
}

export type QuestionMode = 'single'|'multi'| 'caseStudy';

export interface ExamOption {
  id: string;           // uid court
  text: string;
  correct: boolean;
  explanation?: string; // affichée après correction
}

export interface ExamQuestion {
  id?: string;
  examId: string;
  type: 'mcq'|'truefalse';
  stem: string;         // question
  prompt: string;       // énoncé
  mode: QuestionMode;   // single/multi
  options: ExamOption[]; // 2..n réponses
  order: number;        // tri
  points?: number;      // par défaut = exam.pointsPerQuestion
  updatedAt?: any;
  createdAt?: any;

}

export interface LicenseDoc {
  id?: string;
  state: string;                 // "GA"
  type: string;                  // "Registered Nurse (RN)"
  number: string;                // "RN331501"
  renewalDate?: any;             // Timestamp | ISO string
  renewalPeriodMonths?: number;  // 12
  hours?: number;                // optional
  reminderWeeks?: number;        // 8
  createdAt?: any;
  updatedAt?: any;
}

export interface RewardDoc {
  id?: string;

  type: RewardType;

  // Link
  uid: string;
  courseId: string;
  examId?: string;

  // Display
  title: string;
  description?: string;

  // Value
  points?: number;
  hours?: number;
  creditUnit?: string;

  // Exam outcome
  score?: number;
  honor?: HonorLabel;

  // Certificate
  certificateId?: string;
  certificateNo?: string;

  // Meta
  issuedAt: any; // Firestore Timestamp
  issuedBy: 'system' | 'admin';
  status: 'active' | 'revoked' | 'expired';
}

export interface CertificateDoc {
  id?: string;
  organizationId?: string;
organizationName?: string;

  uid: string;
  userName: string;
  userEmail: string;

  courseId: string;
  courseTitle: string;

  score: number;
  honor: HonorLabel;

  hours: number;
  creditUnit?: string;

  certificateNo: string;
  issuedAt: any;

  organization: 'Innovacare Training';

  pdfUrl?: string;       // (si plus tard tu génères un PDF serveur)
  verifyHash: string;    // pour vérification publique
}

export interface RewardWalletDoc {
  uid: string;
  totalPoints: number;
  updatedAt: any;
}

export interface Certificate {
  id?: string;

  uid: string;
  userName: string;
  userEmail: string;

  courseId: string;
  courseTitle: string;

  score: number;
  honor: 'Pass'|'Merit'|'Honors'|'High Honors';

  hours: number;
  creditUnit?: string;

  certificateNo: string;        // ICT-2025-XXXX
  issuedAt: any;

  organization: 'Innovacare Training';

  pdfUrl?: string;
  verifyHash: string;           // public verification
}
export interface Badge {
  id: string;
  name: string;               // "Wound Care Expert"
  iconUrl: string;
  description: string;
  level?: 'bronze'|'silver'|'gold';
}

export interface TranscriptRow {
  courseId: string;
  title: string;
  completedAt: any;
  hours: number;
  score?: number;
  honor?: string;
  certificateId?: string;   // 🔗
}
export type NotificationSeverity = 'info' | 'warning' | 'critical';
export type NotificationType = 'COURSE_ASSIGNED' | 'SYSTEM' | 'REMINDER';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  severity: NotificationSeverity;
  createdAt: any;          // Firestore Timestamp
  isRead: boolean;
  readAt?: any | null;
  archivedAt?: any | null;
  data?: { courseId?: string; link?: string; [k: string]: any };
  actor?: { uid?: string; name?: string };
}

// Exam Proctoring / Onsite Verification
export interface ExamCenter {
  id?: string;
  name: string;
  address: string;
  city: string;
  state?: string;
  country: string;
  timezone: string;
  orgId: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface ExamSession {
  id?: string;
  examId: string;
  courseId?: string;          // optional - exams don't require courses
  centerId: string;           // link to ExamCenter
  orgId: string;

  // Session details
  sessionDate: any;           // Firestore Timestamp (date of exam)
  startTime?: string;         // "09:00" (HH:mm format, optional)
  endTime?: string;           // "17:00"
  durationMinutes?: number;   // override exam duration

  // Enrollment
  enrolledCandidateIds: string[];  // UIDs of registered candidates
  capacity?: number;

  // Proctoring setup
  proctorIds?: string[];      // UIDs of assigned proctors
  requireIdentityVerification: boolean;
  // Remote/vendor-proctored sessions (diaspora candidates): 'none' = the
  // existing self-verify onsite/token-login flow; 'talview' = candidates are
  // routed through the remote-precheck flow (see RemoteProctoringRecord).
  proctoringVendor?: 'none' | 'talview';

  // Onsite Access Control
  accessPassword?: string;    // hashed password for onsite login
  accessTokens?: Array<{      // active session tokens
    candidateUid: string;
    token: string;            // JWT or random string
    issuedAt: any;            // Firestore Timestamp
    expiresAt: any;           // expires after exam ends
  }>;
  isLockedMode?: boolean;     // true = exam-only mode, no admin access

  // Metadata
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  createdAt?: any;
  updatedAt?: any;
}

export interface ProctorVerification {
  id?: string;
  sessionId: string;
  candidateUid: string;
  proctorUid: string;

  // Verification details
  verified: boolean;          // true = ID matched, false = rejected/not verified
  reason?: string;            // "ID mismatch", "Not present", etc.

  // Evidence (optional links to ID photos, etc.)
  idPhotoUrl?: string;
  candidatePhotoUrl?: string;

  // Audit
  verifiedAt: any;            // Firestore Timestamp
  createdAt?: any;
  updatedAt?: any;
}

export interface ProctorAuditLog {
  id?: string;
  sessionId: string;
  proctorUid: string;
  candidateUid: string;
  action: 'verified' | 'rejected' | 'unlocked' | 'blocked' | 'monitoring_start' | 'monitoring_stop'
        | 'proctoring_flagged' | 'proctoring_reviewed';
  details?: string;
  severity?: 'low' | 'medium' | 'high';
  timestamp: any;             // Firestore Timestamp
}

/**
 * Vendor-backed remote proctoring for a single candidate's session, stored at
 * examSessions/{sessionId}/remoteProctoring/{candidateUid}. Vendor-state
 * fields (status, identityVerified, flags[*] up to reviewedBy) are written
 * exclusively by the Cloud Functions webhook handler, never the client.
 */
export interface RemoteProctoringRecord {
  id?: string;                // = candidateUid
  vendorId: 'talview';
  vendorSessionId: string;

  status: 'pending' | 'identity_pending' | 'identity_verified' | 'identity_rejected'
        | 'in_progress' | 'flagged' | 'completed' | 'terminated' | 'expired';
  identityVerified: boolean | null;

  flags: Array<{
    id: string;
    severity: 'low' | 'medium' | 'high';
    type: string;              // vendor-normalized violation type, e.g. 'multiple_faces', 'no_face', 'focus_loss'
    detectedAt: any;           // Firestore Timestamp
    details?: string;
    evidenceUrl?: string;
    reviewedBy?: string;
    reviewDecision?: 'dismissed' | 'escalated' | 'confirmed_violation';
    reviewedAt?: any;
  }>;

  // Human decision after the session completes, gating result release when flags exist.
  finalDecision?: 'cleared' | 'flagged_pass' | 'invalidated';
  reviewedBy?: string;
  reviewedAt?: any;
  reviewNotes?: string;

  lastHeartbeatAt?: any;       // Firestore Timestamp - last widget/webhook activity
  createdAt?: any;
  updatedAt?: any;
}

/**
 * Admin-facing notification (intake events, security alerts), written
 * exclusively by Cloud Functions. A shared inbox, not per-user copies:
 * multiple managers/superAdmins can see and mark the same doc read.
 */
export interface AdminNotification {
  id?: string;
  type: 'demo_request' | 'course_access_request' | 'login_failure_alert';
  severity: 'info' | 'warning' | 'critical';
  scope: 'global' | 'org';
  orgId?: string;             // required when scope === 'org'
  // title/message are LanguageService.t() translation keys (literal-English
  // convention, e.g. 'New demo request'), not pre-rendered text - a shared
  // inbox can be read by admins in either language. messageParams feeds the
  // key's {param} interpolation (e.g. {name}, {org}).
  title: string;
  message: string;
  messageParams?: Record<string, string>;
  targetUrl: string;          // in-app deep link, e.g. /superAdmin/demo-requests
  relatedId?: string;         // id of the source doc (demoRequests/{id}, etc.)
  readBy: string[];           // uids that have marked this notification read
  createdAt?: any;
}






