export interface ExamBlueprintQuestion {
  id?: string;
  order: number;
  prompt: string;
  mode: 'single' | 'multi';
  options: Array<{
    id: string;
    text: string;
  }>;
  correctAnswers: string[];
  explanation?: string;
  points?: number;
}

export interface ExamBlueprint {
  id?: string;
  certificationSessionId: string;
  courseId: string;
  orgId: string;
  title: string;
  description?: string;
  totalQuestions?: number;
  pointsPerQuestion: number;
  passingScore: number;
  durationMinutes?: number;
  status: 'draft' | 'published' | 'archived';
  questions?: ExamBlueprintQuestion[];
  /** Courses a candidate must complete to renew a membership tied to this session. */
  renewalCourseIds?: string[];
  /** Minimum total CE points/credits earned across renewal courses to qualify for renewal. */
  renewalRequiredPoints?: number;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  updatedBy?: string;
}

export interface ExamBlueprintSession {
  blueprintId: string;
  title: string;
  courseTitle: string;
  totalQuestions: number;
  pointsPerQuestion: number;
  passingScore: number;
  status: 'draft' | 'published' | 'archived';
  updatedAt?: any;
}
