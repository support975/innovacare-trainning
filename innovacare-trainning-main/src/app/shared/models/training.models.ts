export type Role = 'super_admin' | 'admin' | 'manager' | 'learner' | 'guest';

export interface UserProfile {
  uid: string;
  role: 'super_admin'|'admin'|'manager'|'learner'|'guest';

  orgId?: string | null;     // 🔥 clé
  orgType?: 'health'|'IT'|'school';
  

  site?: 'Perry'|'Kathleen'|'WarnerRobins';
  license?: 'RN'|'LPN'|'CNA';

  displayName?: string;
  email?: string;

  plan?: 'free'|'premium';   // pour B2C
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
  orgType?: 'health'|'IT'|'school';
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
  orgType?: 'health'|'IT'|'school';
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
  orgType?: 'health'|'IT'|'school';
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
  orgType?: 'health'|'IT'|'school';
  progressPct: number;
  status: 'assigned'|'in_progress'|'completed'|'failed';
  score?: number;
  startedAt?: number;
  completedAt?: number;
}

export interface Attempt {
  id: string;
  orgId?: string | null;   // 🔥
  orgType?: 'health'|'IT'|'school';
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
  orgType?: 'health'|'IT'|'school';
  uid: string;
  courseId: string;
  examId: string;
  issuedAt: number;
  scorePct: number;
  verifyToken: string;
  fileUrl?: string;
}
