export type Role = 'super_admin' | 'admin' | 'manager' | 'learner' | 'guest';

export interface CommunicationConsent {
  marketingEmail: boolean;
  sms: boolean;
  whatsapp: boolean;
  consentedAt?: any;
}

export interface UserProfile {
  uid: string;
  role: 'super_admin'|'admin'|'manager'|'learner'|'guest';

  orgId?: string | null;     // 🔥 clé
  orgType?: 'health'|'IT'|'school'|'professional_order'|'nursing_council'|'university'|'hospital'|'ngo'|'private_training_org'|'scientific_society';
  /** Matches core/auth.ts AppProfile.accountType — 'individual' means orgId is null (public self-serve). */
  accountType?: 'organization' | 'individual' | 'guest';

  site?: 'Perry'|'Kathleen'|'WarnerRobins';

  // Identité professionnelle — généralisée au-delà du seul marché US
  profession?: 'nurse' | 'nurse_practitioner' | 'physician' | 'physical_therapist'
    | 'administrator' | 'educator' | 'student' | 'other';
  license?: 'RN'|'LPN'|'CNA'|'BSN'|'MSN'|'DNP'|'Other';
  licenseNumber?: string;
  licenseIssuingBody?: string;      // ex: "Cameroon Nursing Council"
  licenseExpirationDate?: any;
  employerName?: string;            // hôpital/université, même hors org Innovacare

  // Géo / langue — nécessaire pour la stratégie Afrique + Analytics "par pays"
  country?: string;                 // code ISO 3166-1 alpha-2
  timezone?: string;                // pour les rappels de webinaire
  preferredLanguage?: 'EN'|'FR'|'ES';

  // Contact — nécessaire pour Twilio SMS/WhatsApp
  phoneNumber?: string;
  phoneVerified?: boolean;

  // Consentement communication — requis avant tout envoi SMS/WhatsApp/newsletter
  communicationConsent?: CommunicationConsent;

  // Réutilisation Faculty (si ce learner devient aussi intervenant)
  facultyId?: string | null;

  displayName?: string;
  email?: string;
  photoUrl?: string;

  plan?: 'free'|'premium';   // pour B2C

  createdAt?: any;
  updatedAt?: any;
  lastLoginAt?: any;
}

export interface Course {
  id: string;
  title: string;
  slug: string;
  summary: string;
  durationMins: number;
  tags: string[];
  level: 'Beginner'|'Intermediate'|'Advanced';
  orgId?: string | null;   // 🔥
  orgType?: 'health'|'IT'|'school'|'professional_order'|'nursing_council'|'university'|'hospital'|'ngo'|'private_training_org'|'scientific_society';
  isPublic?: boolean;      // 🔥 B2C vs B2B
  passingScore: number;      // e.g. 80
  lockedSequence: boolean;   // require module order
  published: boolean;
  authorUid: string;
  createdAt: number;
  updatedAt: number;
}

export type ModuleType = 'lesson'|'quiz'|'practical';

export interface CourseModule {
  id: string;
  orgId?: string | null;   // 🔥
  orgType?: 'health'|'IT'|'school'|'professional_order'|'nursing_council'|'university'|'hospital'|'ngo'|'private_training_org'|'scientific_society';
  courseId: string;
  title: string;
  order: number;
  type: ModuleType;
  content?: {
    html?: string;
    videoUrl?: string;
    pdfUrl?: string;
  };
  examId?: string; // if type === 'quiz'
}

export interface Exam {
  id: string;
  courseId: string;
  title: string;
  passingScore: number;     // 0-100
  timeLimitMins?: number;
  randomize?: boolean;
}

export type QuestionType = 'mcq'|'truefalse' | 'caseStudy'  ;

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  stem: string;
  options: QuestionOption[];
  points: number; // 1 by default
  tags?: string[];
}

export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  assignedTo: string;
  assignedBy: string;
  orgId?: string | null;   // 🔥
  orgType?: 'health'|'IT'|'school'|'professional_order'|'nursing_council'|'university'|'hospital'|'ngo'|'private_training_org'|'scientific_society';
  targets: { role?: string; site?: string; userIds?: string[] };
  dueDate?: number;
  createdAt: number;
  status: 'active'|'closed';
}

export interface Enrollment {
  id: string;         // uid_courseId
  uid: string;
  courseId: string;
  assignmentId?: string;
  sequence: number;
  unlockedIndex: number;
  orgId?: string | null;   // 🔥
  orgType?: 'health'|'IT'|'school'|'professional_order'|'nursing_council'|'university'|'hospital'|'ngo'|'private_training_org'|'scientific_society';
  progressPct: number;
  status: 'assigned'|'in_progress'|'completed'|'failed';
  score?: number;
  startedAt?: number;
  completedAt?: number;
}

export interface Attempt {
  id: string;
  orgId?: string | null;   // 🔥
  orgType?: 'health'|'IT'|'school'|'professional_order'|'nursing_council'|'university'|'hospital'|'ngo'|'private_training_org'|'scientific_society';
  uid: string;
  examId: string;
  courseId: string;
  startedAt: number;
  submittedAt?: number;
  scorePct?: number;
  passed?: boolean;
  answers: { questionId: string; optionId: string; correct: boolean }[];
}

export interface Certificate {
  id: string;
  orgId?: string | null;   // 🔥
  orgType?: 'health'|'IT'|'school'|'professional_order'|'nursing_council'|'university'|'hospital'|'ngo'|'private_training_org'|'scientific_society';
  uid: string;
  courseId: string;
  examId: string;
  issuedAt: number;
  scorePct: number;
  verifyToken: string;
  fileUrl?: string;
}
