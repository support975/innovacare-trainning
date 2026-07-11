import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/auth';
import { CertificationSessionService } from '../../../shared/certification-authority/certification-session.service';
import { ExamBlueprintService } from '../../../data/exam-blueprint.service';
import { ExamBlueprint, ExamBlueprintQuestion } from '../../../data/exam-blueprint.model';
import { CertificationSession } from '../../../shared/certification-authority/certification.models';
import { Course } from '../../../data/models';
import { CoursesRepo } from '../../../data/courses.repo';
import { QuestionImportDialogComponent } from './question-import-dialog';
import { ImportedQuestion } from '../../../data/question-importer.service';

import { ToDatePipe } from '../../../shared/pipes/to-date.pipe';
@Component({
  selector: 'app-exam-blueprint-center',
  standalone: true,
  imports: [CommonModule, FormsModule, QuestionImportDialogComponent, ToDatePipe],
  templateUrl: './exam-blueprint-center.html',
  styleUrl: './exam-blueprint-center.css',
})
export class ExamBlueprintCenterComponent implements OnInit {
  private authService = inject(AuthService);
  private sessionService = inject(CertificationSessionService);
  private blueprintService = inject(ExamBlueprintService);
  private coursesRepo = inject(CoursesRepo);

  allCourses = signal<Course[]>([]);
  showRenewalForm = signal(false);
  renewalForm = {
    courseIds: [] as string[],
    requiredPoints: 0,
  };

  loading = signal(true);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  busy = signal(false);

  sessions = signal<CertificationSession[]>([]);
  blueprints = signal<ExamBlueprint[]>([]);
  selectedSession = signal<CertificationSession | null>(null);
  selectedBlueprint = signal<ExamBlueprint | null>(null);

  // Form states
  showBlueprintForm = signal(false);
  showQuestionForm = signal(false);
  showImportDialog = signal(false);
  editingQuestion = signal<ExamBlueprintQuestion | null>(null);

  blueprintForm = {
    title: '',
    description: '',
    pointsPerQuestion: 10,
    passingScore: 80,
    durationMinutes: 60,
  };

  questionForm = {
    prompt: '',
    mode: 'single' as 'single' | 'multi',
    options: [
      { id: '', text: '' },
      { id: '', text: '' },
    ],
    correctAnswers: [] as string[],
    explanation: '',
    points: 10,
  };

  currentUser = this.authService.profile$;
  orgId = '';
  displayName = '';

  ngOnInit() {
    this.currentUser.subscribe((profile) => {
      this.orgId = profile?.orgId || '';
      this.displayName = profile?.displayName || '';
      // Load org-accessible courses for renewal form
      if (profile) {
        this.loadOrgCourses(profile);
      }
    });
    this.loadSessions();
  }

  private loadOrgCourses(profile: any) {
    // Load courses visible to the current user's organization
    this.coursesRepo.visibleForProfile(profile).subscribe({
      next: (courses) => {
        this.allCourses.set(courses);
      },
      error: (err) => {
        console.error('Failed to load org courses:', err);
      },
    });
  }

  private loadSessions() {
    this.sessionService.listForCurrentOrganization().subscribe({
      next: (sessions) => {
        this.sessions.set(sessions);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message || 'Failed to load sessions');
        this.loading.set(false);
      },
    });
  }

  selectSession(session: CertificationSession) {
    this.selectedSession.set(session);
    this.selectedBlueprint.set(null);
    this.showBlueprintForm.set(false);

    this.blueprintService.getBlueprints(session.id || '', this.orgId).subscribe({
      next: (blueprints) => {
        this.blueprints.set(blueprints);
      },
      error: (err) => {
        this.error.set('Failed to load blueprints');
      },
    });
  }

  selectBlueprint(blueprint: ExamBlueprint) {
    this.selectedBlueprint.set(blueprint);
    this.showBlueprintForm.set(false);
    this.showQuestionForm.set(false);
    this.showRenewalForm.set(false);
    this.renewalForm = {
      courseIds: [...(blueprint.renewalCourseIds || [])],
      requiredPoints: blueprint.renewalRequiredPoints || 0,
    };
  }

  toggleRenewalCourse(courseId: string) {
    const idx = this.renewalForm.courseIds.indexOf(courseId);
    if (idx > -1) this.renewalForm.courseIds.splice(idx, 1);
    else this.renewalForm.courseIds.push(courseId);
  }

  isRenewalCourseSelected(courseId: string): boolean {
    return this.renewalForm.courseIds.includes(courseId);
  }

  async saveRenewalRequirements() {
    const blueprint = this.selectedBlueprint();
    if (!blueprint?.id) return;

    try {
      this.busy.set(true);
      this.error.set(null);
      await this.blueprintService.updateBlueprint(blueprint.id, {
        renewalCourseIds: this.renewalForm.courseIds,
        renewalRequiredPoints: this.renewalForm.requiredPoints,
      });
      const updated = await this.blueprintService.getBlueprint(blueprint.id);
      if (updated) this.selectedBlueprint.set(updated);
      this.success.set('Renewal requirements saved');
      setTimeout(() => this.success.set(null), 3000);
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to save renewal requirements');
    } finally {
      this.busy.set(false);
    }
  }

  courseTitle(courseId: string): string {
    return this.allCourses().find((c) => c.id === courseId)?.title || courseId;
  }

  openBlueprintForm() {
    this.blueprintForm = {
      title: '',
      description: '',
      pointsPerQuestion: 10,
      passingScore: 80,
      durationMinutes: 60,
    };
    this.showBlueprintForm.set(true);
  }

  async saveBlueprintForm() {
    if (!this.blueprintForm.title || !this.selectedSession()) {
      this.error.set('Title and session are required');
      return;
    }

    if (!this.orgId) {
      this.error.set('Organization not found');
      return;
    }

    try {
      this.busy.set(true);
      this.error.set(null);

      const blueprint: ExamBlueprint = {
        certificationSessionId: this.selectedSession()?.id || '',
        courseId: this.selectedSession()?.linkedCourseIds?.[0] || '',
        orgId: this.orgId,
        title: this.blueprintForm.title,
        description: this.blueprintForm.description,
        pointsPerQuestion: this.blueprintForm.pointsPerQuestion,
        passingScore: this.blueprintForm.passingScore,
        durationMinutes: this.blueprintForm.durationMinutes,
        status: 'draft',
        questions: [],
        createdBy: this.displayName,
      };

      const id = await this.blueprintService.createBlueprint(blueprint);
      this.blueprints.update(bps => [
        ...bps,
        { ...blueprint, id },
      ]);
      this.success.set('Blueprint created successfully');
      this.showBlueprintForm.set(false);

      setTimeout(() => this.success.set(null), 3000);
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to create blueprint');
    } finally {
      this.busy.set(false);
    }
  }

  private optionIdCounter = 0;

  private nextOptionId(): string {
    this.optionIdCounter += 1;
    return `opt-${Date.now()}-${this.optionIdCounter}`;
  }

  openQuestionForm() {
    this.questionForm = {
      prompt: '',
      mode: 'single',
      options: [
        { id: this.nextOptionId(), text: '' },
        { id: this.nextOptionId(), text: '' },
      ],
      correctAnswers: [],
      explanation: '',
      points: 10,
    };
    this.editingQuestion.set(null);
    this.showQuestionForm.set(true);
  }

  editQuestion(question: ExamBlueprintQuestion) {
    this.questionForm = {
      prompt: question.prompt,
      mode: question.mode,
      options: question.options.map(opt => ({ id: opt.id || this.nextOptionId(), text: opt.text })),
      correctAnswers: [...question.correctAnswers],
      explanation: question.explanation || '',
      points: question.points || 10,
    };
    this.editingQuestion.set(question);
    this.showQuestionForm.set(true);
  }

  addOptionField() {
    this.questionForm.options.push({ id: this.nextOptionId(), text: '' });
  }

  removeOptionField(index: number) {
    this.questionForm.options.splice(index, 1);
  }

  toggleCorrectAnswer(optionId: string) {
    const index = this.questionForm.correctAnswers.indexOf(optionId);
    if (index > -1) {
      this.questionForm.correctAnswers.splice(index, 1);
    } else {
      if (this.questionForm.mode === 'single') {
        this.questionForm.correctAnswers = [optionId];
      } else {
        this.questionForm.correctAnswers.push(optionId);
      }
    }
  }

  async saveQuestionForm() {
    if (!this.questionForm.prompt || this.questionForm.options.length < 2) {
      this.error.set('Question and at least 2 options are required');
      return;
    }

    if (this.questionForm.correctAnswers.length === 0) {
      this.error.set('Select at least one correct answer');
      return;
    }

    try {
      this.busy.set(true);
      this.error.set(null);

      // Assign IDs to options
      const options = this.questionForm.options.map((opt, idx) => ({
        id: opt.id || `option-${idx}`,
        text: opt.text,
      }));

      const question: ExamBlueprintQuestion = {
        id: this.editingQuestion()?.id || `q-${Date.now()}`,
        order: this.editingQuestion()?.order ||
          (this.selectedBlueprint()?.questions?.length || 0) + 1,
        prompt: this.questionForm.prompt,
        mode: this.questionForm.mode,
        options,
        correctAnswers: this.questionForm.correctAnswers,
        explanation: this.questionForm.explanation,
        points: this.questionForm.points,
      };

      if (this.editingQuestion()) {
        await this.blueprintService.updateQuestion(
          this.selectedBlueprint()?.id || '',
          question
        );
      } else {
        await this.blueprintService.addQuestion(
          this.selectedBlueprint()?.id || '',
          question
        );
      }

      this.success.set('Question saved successfully');
      this.showQuestionForm.set(false);
      this.editingQuestion.set(null);

      // Reload blueprint
      const blueprint = await this.blueprintService.getBlueprint(
        this.selectedBlueprint()?.id || ''
      );
      if (blueprint) {
        this.selectedBlueprint.set(blueprint);
      }

      setTimeout(() => this.success.set(null), 3000);
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to save question');
    } finally {
      this.busy.set(false);
    }
  }

  async deleteQuestion(questionId: string) {
    if (!confirm('Are you sure you want to delete this question?')) return;

    try {
      this.busy.set(true);
      this.error.set(null);
      await this.blueprintService.deleteQuestion(
        this.selectedBlueprint()?.id || '',
        questionId
      );

      const blueprint = await this.blueprintService.getBlueprint(
        this.selectedBlueprint()?.id || ''
      );
      if (blueprint) {
        this.selectedBlueprint.set(blueprint);
      }
      this.success.set('Question deleted successfully');
      setTimeout(() => this.success.set(null), 3000);
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to delete question');
    } finally {
      this.busy.set(false);
    }
  }

  async publishBlueprint() {
    if (!confirm('Publish this blueprint? It cannot be edited after publishing.')) return;

    try {
      this.busy.set(true);
      this.error.set(null);
      await this.blueprintService.publishBlueprint(
        this.selectedBlueprint()?.id || ''
      );

      const blueprint = await this.blueprintService.getBlueprint(
        this.selectedBlueprint()?.id || ''
      );
      if (blueprint) {
        this.selectedBlueprint.set(blueprint);
      }
      this.success.set('Blueprint published successfully');
      setTimeout(() => this.success.set(null), 3000);
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to publish blueprint');
    } finally {
      this.busy.set(false);
    }
  }

  async deleteBlueprint(id: string) {
    if (!confirm('Delete this blueprint? This action cannot be undone.')) return;

    try {
      this.busy.set(true);
      this.error.set(null);
      await this.blueprintService.deleteBlueprint(id);
      this.blueprints.update(bps => bps.filter(b => b.id !== id));
      this.selectedBlueprint.set(null);
      this.success.set('Blueprint deleted successfully');
      setTimeout(() => this.success.set(null), 3000);
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to delete blueprint');
    } finally {
      this.busy.set(false);
    }
  }

  openImportDialog() {
    if (!this.selectedBlueprint()) {
      this.error.set('Select a blueprint first');
      return;
    }
    this.showImportDialog.set(true);
  }

  async onQuestionsImported(questions: ImportedQuestion[]) {
    try {
      this.busy.set(true);
      this.error.set(null);

      const blueprint = this.selectedBlueprint();
      if (!blueprint) throw new Error('Blueprint not found');

      // Add each question
      for (const q of questions) {
        const question: ExamBlueprintQuestion = {
          id: `q-${Date.now()}-${Math.random()}`,
          order: (blueprint.questions?.length || 0) + questions.indexOf(q) + 1,
          prompt: q.prompt,
          mode: q.mode,
          options: q.options,
          correctAnswers: q.correctAnswers,
          explanation: q.explanation,
          points: q.points,
        };

        await this.blueprintService.addQuestion(blueprint.id || '', question);
      }

      // Reload blueprint
      const updated = await this.blueprintService.getBlueprint(blueprint.id || '');
      if (updated) {
        this.selectedBlueprint.set(updated);
      }

      this.success.set(`${questions.length} question(s) imported successfully`);
      this.showImportDialog.set(false);
      setTimeout(() => this.success.set(null), 3000);
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to import questions');
    } finally {
      this.busy.set(false);
    }
  }
}
