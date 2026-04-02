export type CourseLang = 'EN' | 'FR' | 'ES';
export type CourseKind = 'Course' | 'Text' | 'Module';
export type CourseType = 'It' | 'Health' | 'Hr' | 'safety';

export interface Section {
  id?: string;
  title: string;
  description?: string;
  lessons?: Lesson[];
}

export interface Lesson {
  id?: string;
  title: string;
  description?: string;
  durationMin?: number;
  blocks?: LessonBlock[];
}

export interface LessonBlock {
  id?: string;
  type: 'text' | 'video' | 'image' | 'quiz' | 'file' | 'embed';
  title?: string;
  content?: string;
  url?: string;
}

export interface HealthMeta {
  specialty?: string;
  careSetting?: string[];
  clinicalTopics?: string[];
}

export type OrgType =
  | 'HomeCare'
  | 'HomeHealth'
  | 'SNF'
  | 'Hospice'
  | 'Hospital'
  | 'PrivatePractice'
  | 'Other';

export interface Course {
  id?: string;
  title: string;
  subtitle?: string;
  description: string;
  lang: CourseLang;
  durationMin: number;
  ceCredit?: number;
  active: boolean;
  tags?: string[];
  imageUrl?: string;
  createdAt?: any;
  updatedAt?: any;
  kind: CourseKind;
  url: string;
  sections: Section[];

  lecturer: string;
  disclosures: string[];
  targetAudience: string[];
  prerequisites: string[];
  requirements: string[];
  accomodations: string;
  orgId?: string | null;
  orgType?: OrgType;
  healthMeta?: HealthMeta;
  releaseAt?: any;
  publishedAt?: any;
  isPublic?: boolean;
  passingScore: number;
  lockedSequence: boolean;
  exipirationDate?: any;
  confirmAt?: any;
  confirmBy?: string;
  confirmMessage?: string;
  type: CourseType;
}