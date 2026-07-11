export type OrgType = 'health' | 'IT' | 'school';
export interface HealthMeta {
  healthCareType: 'SNF' | 'HomeHealth' | 'Hospice' | 'Hospital' | 'PrivatePractice' | 'PHCP';
}

export interface Organization {
  id: string;
  name: string;
  type: OrgType;

  plan: 'free'|'pro'|'enterprise';

  branding?: {
    logoUrl?: string;
    primaryColor?: string;
  };

  certificationAuthorityEnabled?: boolean;

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
  | { id?: string; type: 'quiz'; mode: 'single'|'multi'| 'caseStudy'; question: string; linkedQuizId?: string; required?: boolean; choices: { id:string; text:string; correct:boolean }[] };


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
  action: 'verified' | 'rejected' | 'unlocked' | 'blocked' | 'monitoring_start' | 'monitoring_stop';
  details?: string;
  timestamp: any;             // Firestore Timestamp
}






