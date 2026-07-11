import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, Observable } from 'rxjs';

type QuestionMode = 'single' | 'multi';

type Question = {
  id: string;
  order: number;
  prompt: string;
  mode: QuestionMode;
  options: Array<{ id: string; text: string }>;
  explanation?: string;
  answer: string[];
};

type CourseOption = {
  id?: string;
  title?: string;
  subtitle?: string;
  active?: boolean;
  kind?: string;
};

type ExamOption = {
  id?: string;
  title?: string;
  available?: boolean;
  pointsPerQuestion?: number;
  passPct?: number;
  questions?: number;
  totalQuestions?: number;
};

type ExamJsonPayload = {
  examId?: string;
  exam?: Partial<ExamOption>;
  questions?: Question[];
};

function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'final-exam';
}

function sortCourses(courses: CourseOption[]): CourseOption[] {
  return [...courses].sort((a, b) =>
    (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
  );
}

@Component({
  selector: 'app-exam-authoring',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './exam-authoring.html',
  styleUrl: './exam-authoring.css',
})
export class ExamAuthoringComponent {
  private readonly db = inject(Firestore);

  private readonly courses$ = (collectionData(collection(this.db, 'courses'), { idField: 'id' }) as Observable<CourseOption[]>).pipe(
    map(courses => sortCourses(courses || []))
  );

  readonly courses = toSignal(this.courses$, { initialValue: [] as CourseOption[] });
  readonly exams = signal<ExamOption[]>([]);
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly noticeKind = signal<'ok' | 'error'>('ok');
  readonly courseQuery = signal('');

  selectedCourseId = '';
  selectedExamId = '';
  examTitle = 'Final Exam';
  passPct = 80;
  pointsPerQuestion = 10;
  available = true;
  jsonText = '';

  readonly filteredCourses = computed(() => {
    const term = this.courseQuery().trim().toLowerCase();
    return this.courses().filter(course => {
      const text = `${course.title || ''} ${course.subtitle || ''} ${course.kind || ''} ${course.id || ''}`.toLowerCase();
      return !term || text.includes(term);
    });
  });

  selectedCourse(): CourseOption | null {
    return this.courses().find(course => course.id === this.selectedCourseId) || null;
  }

  effectiveExamId(): string {
    return this.selectedExamId || slugify(this.examTitle);
  }

  async onCourseChange(courseId: string): Promise<void> {
    this.selectedCourseId = courseId;
    this.selectedExamId = '';
    this.exams.set([]);
    if (!courseId) return;

    try {
      const snap = await getDocs(collection(this.db, `courses/${courseId}/exams`));
      this.exams.set(
        snap.docs
          .map(item => ({ id: item.id, ...item.data() } as ExamOption))
          .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }))
      );
    } catch (error: any) {
      this.fail(error?.message || 'Unable to load exams for this course.');
    }
  }

  onExamChange(examId: string): void {
    this.selectedExamId = examId;
    const exam = this.exams().find(item => item.id === examId);
    if (!exam) return;
    this.examTitle = exam.title || this.examTitle;
    this.passPct = Number(exam.passPct ?? this.passPct);
    this.pointsPerQuestion = Number(exam.pointsPerQuestion ?? this.pointsPerQuestion);
    this.available = exam.available !== false;
  }

  loadExample(): void {
    const example: ExamJsonPayload = {
      exam: {
        title: 'Compliance & Ethics Final Exam',
        available: true,
        pointsPerQuestion: 10,
        passPct: 80,
      },
      questions: [
        {
          id: 'q1',
          order: 1,
          mode: 'single',
          prompt: 'You suspect a coworker is falsifying expense reports. What is the best first step?',
          options: [
            { id: 'a', text: 'Confront them publicly at the next team meeting' },
            { id: 'b', text: 'Report the concern through the approved compliance channel' },
            { id: 'c', text: 'Ignore it because it is not your responsibility' },
            { id: 'd', text: 'Post about it on social media' },
          ],
          explanation: 'Use official reporting channels for compliance concerns.',
          answer: ['b'],
        },
        {
          id: 'q2',
          order: 2,
          mode: 'multi',
          prompt: 'Which of the following are potential conflicts of interest? Select all that apply.',
          options: [
            { id: 'a', text: 'Hiring a close relative for a role you supervise' },
            { id: 'b', text: 'Owning stock in a vendor you select' },
            { id: 'c', text: 'Joining a company-sponsored volunteer day' },
            { id: 'd', text: 'Accepting a consulting fee from a supplier you manage' },
          ],
          explanation: 'Personal relationships or financial interests can bias business decisions.',
          answer: ['a', 'b', 'd'],
        },
      ],
    };

    this.examTitle = example.exam?.title || this.examTitle;
    this.passPct = example.exam?.passPct || this.passPct;
    this.pointsPerQuestion = example.exam?.pointsPerQuestion || this.pointsPerQuestion;
    this.available = example.exam?.available !== false;
    this.jsonText = JSON.stringify(example, null, 2);
  }

  async importQuestions(): Promise<void> {
    this.notice.set('');
    this.noticeKind.set('ok');
    this.busy.set(true);

    try {
      const courseId = this.selectedCourseId.trim();
      if (!courseId) throw new Error('Select a course first.');

      const payload = this.parsePayload();
      const questions = payload.questions;
      const examTitle = (payload.exam?.title || this.examTitle || 'Final Exam').trim();
      const examId = (this.selectedExamId || payload.examId || slugify(examTitle)).trim();

      if (!examTitle) throw new Error('Exam title is required.');
      if (!examId) throw new Error('Unable to create an exam id from the exam title.');

      await setDoc(
        doc(this.db, `courses/${courseId}/exams/${examId}`),
        {
          title: examTitle,
          available: payload.exam?.available ?? this.available,
          pointsPerQuestion: Number(payload.exam?.pointsPerQuestion ?? this.pointsPerQuestion),
          passPct: Number(payload.exam?.passPct ?? this.passPct),
          questions: questions.length,
          totalQuestions: questions.length,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      for (const question of questions) {
        this.validateQuestion(question);
        const { id, answer, ...visibleQuestion } = question;

        await setDoc(
          doc(this.db, `courses/${courseId}/exams/${examId}/questions/${id}`),
          {
            ...visibleQuestion,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );

        await setDoc(
          doc(this.db, `courses/${courseId}/exams/${examId}/answerKey/${id}`),
          {
            correctIds: answer,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      this.ok(`Imported ${questions.length} question${questions.length === 1 ? '' : 's'} into "${examTitle}" for "${this.selectedCourse()?.title || courseId}".`);
      await this.onCourseChange(courseId);
      this.selectedExamId = examId;
    } catch (error: any) {
      this.fail(error?.message || String(error));
    } finally {
      this.busy.set(false);
    }
  }

  private parsePayload(): Required<Pick<ExamJsonPayload, 'questions'>> & ExamJsonPayload {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.jsonText);
    } catch {
      throw new Error('JSON is not valid.');
    }

    if (Array.isArray(parsed)) {
      return { questions: parsed as Question[] };
    }

    const payload = parsed as ExamJsonPayload;
    if (!payload || !Array.isArray(payload.questions)) {
      throw new Error('JSON must be a questions array or an object with a questions array.');
    }

    return {
      ...payload,
      questions: payload.questions,
    };
  }

  private validateQuestion(question: Question): void {
    if (!question?.id) throw new Error('Each question needs an id.');
    if (!question.prompt?.trim()) throw new Error(`Question "${question.id}" needs a prompt.`);
    if (question.mode !== 'single' && question.mode !== 'multi') {
      throw new Error(`Question "${question.id}" mode must be "single" or "multi".`);
    }
    if (!Array.isArray(question.options) || question.options.length < 2) {
      throw new Error(`Question "${question.id}" must have at least 2 options.`);
    }
    if (!Array.isArray(question.answer) || !question.answer.length) {
      throw new Error(`Question "${question.id}" must include answer as an array of correct option ids.`);
    }
  }

  private ok(message: string): void {
    this.noticeKind.set('ok');
    this.notice.set(message);
  }

  private fail(message: string): void {
    this.noticeKind.set('error');
    this.notice.set(message);
  }
}
