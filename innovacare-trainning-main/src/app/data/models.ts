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
}
export type EnrollmentStatus = 'not-started' | 'in-progress' | 'completed';

export interface Section {
  id: string;                   // stable key (slug/uuid)
  title: string;                // e.g. “Ethics Training”
  lessons: Lesson[];
}

export interface Lesson {
  id: string;                   // stable key
  title: string;                // e.g. “Ethical Concepts”
  estMin?: number;
  blocks: Block[];              // renderable content blocks
}

export type Block =
  | { type: 'heading'; level?: 1|2|3; text: string }
  | { type: 'text'; html: string }                 // sanitized HTML or markdown->HTML
  | { type: 'image'; url: string; alt?: string; caption?: string }
  | { type: 'audio'; url: string; transcript?: string }
  | { type: 'callout'; style?: 'info'|'warn'|'success'; html: string }
  | { type: 'quiz'; mode: 'single'|'multi'; question: string; choices: { id:string; text:string; correct:boolean }[] };


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
  title: string;
  available: boolean;
  pointsPerQuestion: number; // ex: 10
  passPct: number;           // ex: 80
  totalQuestions?: number;   // dérivé (optionnel)
  updatedAt?: any;
  createdAt?: any;
  questions: any;
  
  
}

export type QuestionMode = 'single'|'multi';

export interface ExamOption {
  id: string;           // uid court
  text: string;
  correct: boolean;
  explanation?: string; // affichée après correction
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



