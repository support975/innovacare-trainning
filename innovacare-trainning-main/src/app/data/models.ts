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
  orgType?: OrgType;
  healthMeta?: HealthMeta;
  releaseAt?: any;              // serverTimestamp
  publishedAt?: any;            // serverTimestamp
  isPublic?: boolean;           // B2C vs B2B
  passingScore: number;         // e.g. 80
  lockedSequence: boolean;      // require module order
  exipirationDate?: any;        // serverTimestamp
  confirmAt?:any;
  confirmBy?:string;
  confirmMessage?:string;
  type: 'It' |'Health' | 'Hr' | 'safety'
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  
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
  order: number;                // tri
  createdAt?: any;              // serverTimestamp
  updatedAt?: any;
}

export type Block =
  | { type: 'heading'; level?: 1|2|3; text: string }
  | { type: 'text'; html: string }                 // sanitized HTML or markdown->HTML
  | { type: 'image'; url: string; alt?: string; caption?: string }
  | { type: 'audio'; url: string; transcript?: string }
  | { type: 'video'; url: string; transcript?: string }
  | { type: 'callout'; style?: 'info'|'warn'|'success'; html: string }
  | { type: 'quiz'; mode: 'single'|'multi'| 'caseStudy'; question: string; choices: { id:string; text:string; correct:boolean }[] };


  export interface Enrollment {
    startedAt: any;              // serverTimestamp
    completedAt?: any;
    // gatekeeping: which lessons are done
    doneLessons: string[];       // array of Lesson.id
    // optional: per-lesson timestamps, quiz scores, etc.
    scores?: Record<string, number>;
    id: string;
    mode?: 'guest' | 'organization';
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






