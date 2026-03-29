export type Role = 'admin'|'manager'|'learner';

export interface UserProfile {
  uid: string;
  role: Role;
  site?: 'Perry'|'Kathleen'|'WarnerRobins';
  license?: 'RN'|'LPN'|'CNA';
  displayName?: string;
  email?: string;
}

export interface Course {
  id: string;
  title: string;
  slug: string;
  summary: string;
  durationMins: number;
  tags: string[];
  level: 'Beginner'|'Intermediate'|'Advanced';
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

export type QuestionType = 'mcq'|'truefalse';

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
  assignedBy: string;
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
  progressPct: number;
  status: 'assigned'|'in_progress'|'completed'|'failed';
  score?: number;
  startedAt?: number;
  completedAt?: number;
}

export interface Attempt {
  id: string;
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
  uid: string;
  courseId: string;
  examId: string;
  issuedAt: number;
  scorePct: number;
  verifyToken: string;
  fileUrl?: string;
}
