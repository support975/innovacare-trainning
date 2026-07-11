import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  FormArray,
  FormControl,
  FormGroup,
} from '@angular/forms';

import { CoursesRepo } from '../../../data/courses.repo';
import { Course, Section, Lesson, Block } from '../../../data/models';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/auth';

import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  DEFAULT_TTS_LANGUAGE,
  DEFAULT_TTS_SPEAKING_RATE,
  DEFAULT_TTS_VOICE,
  TtsGenerationService,
} from './tts-generation.service';
import { buildLessonTranscript } from './tts-transcript';
import { switchMap } from 'rxjs';

/* ---------------------------
   Typed form helpers
---------------------------- */

type ChoiceForm = FormGroup<{
  id: FormControl<string>;
  text: FormControl<string>;
  correct: FormControl<boolean>;
}>;

type InteractiveCardForm = FormGroup<{
  id: FormControl<string>;
  title: FormControl<string>;
  teaser: FormControl<string>;
  bodyHtml: FormControl<string>;
  imageUrl: FormControl<string>;
  variant: FormControl<'default' | 'flip' | 'hotspot' | 'sequence'>;
  hotspotX: FormControl<number>;
  hotspotY: FormControl<number>;
}>;

type AccordionItemForm = FormGroup<{
  id: FormControl<string>;
  title: FormControl<string>;
  bodyText: FormControl<string>;
  bulletsText: FormControl<string>;
  bodyHtml: FormControl<string>;
  required: FormControl<boolean>;
}>;

type TabItemForm = FormGroup<{
  id: FormControl<string>;
  label: FormControl<string>;
  title: FormControl<string>;
  bodyHtml: FormControl<string>;
  imageUrl: FormControl<string>;
  imageAlt: FormControl<string>;
  required: FormControl<boolean>;
}>;

type SlideForm = FormGroup<{
  id: FormControl<string>;
  title: FormControl<string>;
  imageUrl: FormControl<string>;
  audioUrl: FormControl<string>;
  transcript: FormControl<string>;
  notesHtml: FormControl<string>;
  interactiveCards: FormArray<InteractiveCardForm>;
}>;

type BlockForm = FormGroup<{
  id: FormControl<string>;
  type: FormControl<Block['type']>;
  title: FormControl<string>;
  level: FormControl<1 | 2 | 3>;
  text: FormControl<string>;
  html: FormControl<string>;
  bodyText: FormControl<string>;
  bulletsText: FormControl<string>;
  bodyHtml: FormControl<string>;
  introHtml: FormControl<string>;
  url: FormControl<string>;
  imageUrl: FormControl<string>;
  alt: FormControl<string>;
  caption: FormControl<string>;
  transcript: FormControl<string>;
  buttonLabel: FormControl<string>;
  passPct: FormControl<number>;
  required: FormControl<boolean>;
  linkedQuizId: FormControl<string>;
  theme: FormControl<'default' | 'focus'>;
  variant: FormControl<'flip' | 'gated'>;
  style: FormControl<'info' | 'warn' | 'success'>;
  mode: FormControl<'single' | 'multi' | 'caseStudy'>;
  question: FormControl<string>;
  choices: FormArray<ChoiceForm>;
  items: FormArray<AccordionItemForm>;
  tabs: FormArray<TabItemForm>;
  cards: FormArray<InteractiveCardForm>;
  slides: FormArray<SlideForm>;
}>;

type LessonForm = FormGroup<{
  id: FormControl<string>;
  title: FormControl<string>;
  estMin: FormControl<number>;
  continueMode: FormControl<'guided' | 'free'>;
  blocks: FormArray<BlockForm>;
}>;

type SectionForm = FormGroup<{
  id: FormControl<string>;
  title: FormControl<string>;
  lessons: FormArray<LessonForm>;
  url: FormControl<string>;
}>;

type TtsGenerationStatus = {
  loading: boolean;
  success?: string;
  error?: string;
  url?: string;
};

type CourseStatusFilter = 'all' | 'active' | 'inactive';
type CourseLangFilter = 'all' | 'EN' | 'FR' | 'ES';
type CourseTypeFilter = 'all' | Course['type'];

@Component({
  selector: 'app-courses',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DragDropModule],
  templateUrl: './courses.html',
  styleUrl: './courses.css',
})
export class Courses {
  private fb = inject(FormBuilder).nonNullable;
  private repo = inject(CoursesRepo);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);
  private tts = inject(TtsGenerationService);
  private authSvc = inject(AuthService);

  editId: string | null = null;
  loadingEdit = false;
  duplicatingId: string | null = null;
  importError = '';
  importSuccess = '';
  saveError = '';
  pendingImport: Omit<Course, 'id' | 'createdAt' | 'updatedAt'> | null = null;
  pendingImportName = '';
  jsonAppliedNotice = '';
  currentJsonPreview = '';
  savingCourse = false;
  importingCourse = false;
  ttsIncludeQuizChoices = false;
  courseSearch = signal('');
  courseStatusFilter = signal<CourseStatusFilter>('all');
  courseLangFilter = signal<CourseLangFilter>('all');
  courseTypeFilter = signal<CourseTypeFilter>('all');
  readonly ttsLanguage = DEFAULT_TTS_LANGUAGE;
  readonly ttsVoice = DEFAULT_TTS_VOICE;
  readonly ttsSpeakingRate = DEFAULT_TTS_SPEAKING_RATE;
  private readonly ttsStatusByLesson = new Map<string, TtsGenerationStatus>();
  private readonly ttsStatusVersion = signal(0);

  readonly isSuperAdmin = this.router.url.startsWith('/super-admin');
  readonly canManageCourses = this.isSuperAdmin;

  form = this.fb.group({
    title: this.fb.control<string>('', {
      validators: [Validators.required, Validators.minLength(3)],
    }),
    subtitle: this.fb.control<string>(''),
    description: this.fb.control<string>(''),
    lang: this.fb.control<'EN' | 'FR' | 'ES'>('EN', {
      validators: [Validators.required],
    }),
    durationMin: this.fb.control<number>(60, {
      validators: [Validators.required, Validators.min(1)],
    }),
    ceCredit: this.fb.control<number>(0, {
      validators: [Validators.min(0)],
    }),
    sortOrder: this.fb.control<number>(0, {
      validators: [Validators.min(0)],
    }),
    active: this.fb.control<boolean>(true),
    kind: this.fb.control<Course['kind']>('Course', {
      validators: [Validators.required],
    }),
    type: this.fb.control<Course['type']>('Health', {
      validators: [Validators.required],
    }),

    imageUrl: this.fb.control<string>(''),
    url: this.fb.control<string>(''),
    lecturer: this.fb.control<string>(''),
    accomodations: this.fb.control<string>(''),
    passingScore: this.fb.control<number>(80, {
      validators: [Validators.min(0), Validators.max(100)],
    }),
    lockedSequence: this.fb.control<boolean>(false),
    isPublic: this.fb.control<boolean>(false),
    level: this.fb.control<'Beginner' | 'Intermediate' | 'Advanced'>('Beginner'),

    tagsText: this.fb.control<string>(''),
    disclosuresText: this.fb.control<string>(''),
    targetAudienceText: this.fb.control<string>(''),
    prerequisitesText: this.fb.control<string>(''),
    requirementsText: this.fb.control<string>(''),

    sections: this.fb.array<SectionForm>([]),
  });

  get sectionsFA() {
    return this.form.controls.sections;
  }

  courses = toSignal(
    this.authSvc.profile$.pipe(
      switchMap((profile) => this.repo.visibleForProfile(profile))
    ),
    { initialValue: [] as Course[] }
  );

  filteredCourses = computed(() => {
    const search = this.courseSearch().trim().toLowerCase();
    const status = this.courseStatusFilter();
    const lang = this.courseLangFilter();
    const type = this.courseTypeFilter();

    return this.courses().filter((course) => {
      if (status === 'active' && !course.active) return false;
      if (status === 'inactive' && course.active) return false;
      if (lang !== 'all' && course.lang !== lang) return false;
      if (type !== 'all' && course.type !== type) return false;

      if (!search) return true;

      const blob = [
        course.title,
        course.subtitle,
        course.description,
        course.lecturer,
        course.kind,
        course.type,
        course.lang,
        ...(course.tags ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return blob.includes(search);
    });
  });

  hasCourseFilters = computed(
    () =>
      !!this.courseSearch().trim()
      || this.courseStatusFilter() !== 'all'
      || this.courseLangFilter() !== 'all'
      || this.courseTypeFilter() !== 'all'
  );

  previewBlockCount(course: Pick<Course, 'sections'> | null | undefined): number {
    return (course?.sections ?? []).reduce(
      (sum, section) =>
        sum + (section.lessons ?? []).reduce((lessonSum, lesson) => lessonSum + (lesson.blocks?.length ?? 0), 0),
      0
    );
  }

  previewLessonCount(course: Pick<Course, 'sections'> | null | undefined): number {
    return (course?.sections ?? []).reduce(
      (sum, section) => sum + (section.lessons?.length ?? 0),
      0
    );
  }

  private safeSortOrder(value: unknown, fallback: number): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  }

  private nextSortOrder(): number {
    const max = this.courses().reduce((highest, course) => {
      const value = Number(course.sortOrder);
      return Number.isFinite(value) ? Math.max(highest, value) : highest;
    }, 0);

    return max + 10;
  }

  courseOrderLabel(course: Course, index: number): string {
    const value = Number(course.sortOrder);
    return Number.isFinite(value) ? String(value) : String((index + 1) * 10);
  }

  clearCourseFilters(): void {
    this.courseSearch.set('');
    this.courseStatusFilter.set('all');
    this.courseLangFilter.set('all');
    this.courseTypeFilter.set('all');
  }

  private applyCourseToForm(data: Partial<Course>): void {
    this.form.patchValue({
      title: data.title ?? '',
      subtitle: data.subtitle ?? '',
      description: data.description ?? '',
      lang: data.lang ?? 'EN',
      durationMin: Number(data.durationMin ?? 60),
      ceCredit: Number(data.ceCredit ?? 0),
      sortOrder: Number(data.sortOrder ?? this.nextSortOrder()),
      active: !!data.active,
      kind: data.kind ?? 'Course',
      type: data.type ?? 'Health',
      imageUrl: data.imageUrl ?? '',
      url: data.url ?? '',
      lecturer: data.lecturer ?? '',
      accomodations: data.accomodations ?? '',
      passingScore: Number(data.passingScore ?? 80),
      lockedSequence: !!data.lockedSequence,
      isPublic: !!data.isPublic,
      level: data.level ?? 'Beginner',
      tagsText: this.arrayToCsv(data.tags),
      disclosuresText: this.arrayToCsv(data.disclosures),
      targetAudienceText: this.arrayToCsv(data.targetAudience),
      prerequisitesText: this.arrayToCsv(data.prerequisites),
      requirementsText: this.arrayToCsv(data.requirements),
    });

    this.sectionsFA.clear();

    const secs = Array.isArray(data.sections) ? data.sections : [];
    if (!secs.length) {
      this.addSection();
      return;
    }

    secs.forEach((s) => {
      const sfg = this.newSection();
      sfg.patchValue({
        id: s.id,
        title: s.title ?? '',
        url: '',
      });

      sfg.controls.lessons.clear();

      const lessons = Array.isArray(s.lessons) ? s.lessons : [];
      if (!lessons.length) {
        sfg.controls.lessons.push(this.newLesson());
      } else {
        lessons.forEach((l) => {
          const lfg = this.newLesson();
          lfg.patchValue({
            id: l.id,
            title: l.title ?? 'Lesson',
            estMin: Number(l.estMin ?? 0),
            continueMode: (l.continueMode ?? 'guided') as 'guided' | 'free',
          });

          lfg.controls.blocks.clear();

          const blocks = Array.isArray(l.blocks) ? l.blocks : [];
          if (!blocks.length) {
            lfg.controls.blocks.push(this.newBlock('heading'));
            lfg.controls.blocks.push(this.newBlock('text'));
          } else {
            blocks.forEach((b) => {
              const bfg = this.newBlock(b.type);

              if (b.type === 'heading') {
                bfg.patchValue({
                  id: b.id ?? crypto.randomUUID(),
                  required: b.required !== false,
                  level: (b.level ?? 2) as 1 | 2 | 3,
                  text: b.text ?? '',
                });
              } else if (b.type === 'text') {
                bfg.patchValue({ id: b.id ?? crypto.randomUUID(), required: b.required !== false, html: b.html ?? '' });
              } else if (b.type === 'image') {
                bfg.patchValue({
                  id: b.id ?? crypto.randomUUID(),
                  required: b.required !== false,
                  url: b.url ?? '',
                  alt: b.alt ?? '',
                  caption: b.caption ?? '',
                });
              } else if (b.type === 'audio') {
                bfg.patchValue({
                  id: b.id ?? crypto.randomUUID(),
                  required: b.required !== false,
                  title: b.title ?? '',
                  url: b.url ?? '',
                  transcript: b.transcript ?? '',
                });
              } else if (b.type === 'video') {
                bfg.patchValue({
                  id: b.id ?? crypto.randomUUID(),
                  required: b.required !== false,
                  url: b.url ?? '',
                  transcript: b.transcript ?? '',
                });
              } else if (b.type === 'hero') {
                bfg.patchValue({
                  id: b.id ?? crypto.randomUUID(),
                  required: b.required !== false,
                  title: b.title ?? '',
                  bodyHtml: b.bodyHtml ?? '',
                  bodyText: '',
                  bulletsText: '',
                  imageUrl: b.imageUrl ?? '',
                  buttonLabel: b.buttonLabel ?? 'Continue',
                });
              } else if (b.type === 'accordion') {
                bfg.patchValue({
                  id: b.id ?? crypto.randomUUID(),
                  required: b.required !== false,
                  title: b.title ?? '',
                  introHtml: b.introHtml ?? '',
                  linkedQuizId: b.linkedQuizId ?? '',
                });

                bfg.controls.items.clear();
                (b.items ?? []).forEach((item) => {
                  bfg.controls.items.push(
                    this.newAccordionItem({
                      title: item.title ?? '',
                      bodyText: '',
                      bulletsText: '',
                      bodyHtml: item.bodyHtml ?? '',
                      required: item.required !== false,
                    })
                  );
                });

                if (bfg.controls.items.length === 0) {
                  bfg.controls.items.push(this.newAccordionItem({ title: 'First item' }));
                }
              } else if (b.type === 'cardStack') {
                bfg.patchValue({
                  id: b.id ?? crypto.randomUUID(),
                  required: b.required !== false,
                  title: b.title ?? '',
                  introHtml: b.introHtml ?? '',
                  variant: (b.variant ?? 'flip') as 'flip' | 'gated',
                  linkedQuizId: b.linkedQuizId ?? '',
                });

                bfg.controls.cards.clear();
                (b.cards ?? []).forEach((card) => {
                  bfg.controls.cards.push(
                    this.newInteractiveCard({
                      title: card.title ?? '',
                      teaser: card.teaser ?? '',
                      bodyHtml: card.bodyHtml ?? '',
                      imageUrl: card.imageUrl ?? '',
                      variant: 'default',
                    })
                  );
                });

                if (bfg.controls.cards.length === 0) {
                  bfg.controls.cards.push(this.newInteractiveCard({ title: 'Card 1', variant: 'default' }));
                }
              } else if (b.type === 'quizIntro') {
                bfg.patchValue({
                  id: b.id ?? crypto.randomUUID(),
                  required: b.required !== false,
                  title: b.title ?? '',
                  bodyHtml: b.bodyHtml ?? '',
                  bodyText: '',
                  bulletsText: '',
                  buttonLabel: b.buttonLabel ?? 'Start quiz',
                  passPct: Number(b.passPct ?? 80),
                  linkedQuizId: b.linkedQuizId ?? '',
                });
              } else if (b.type === 'tabs') {
                bfg.patchValue({
                  id: b.id ?? crypto.randomUUID(),
                  required: b.required !== false,
                  title: b.title ?? '',
                  introHtml: b.introHtml ?? '',
                  linkedQuizId: b.linkedQuizId ?? '',
                });

                bfg.controls.tabs.clear();
                (b.tabs ?? []).forEach((tab) => {
                  bfg.controls.tabs.push(
                    this.newTabItem({
                      label: tab.label ?? '',
                      title: tab.title ?? '',
                      bodyHtml: tab.bodyHtml ?? '',
                      imageUrl: tab.imageUrl ?? '',
                      imageAlt: tab.imageAlt ?? '',
                      required: tab.required !== false,
                    })
                  );
                });

                if (bfg.controls.tabs.length === 0) {
                  bfg.controls.tabs.push(this.newTabItem({ label: 'Cleaning', title: 'Cleaning' }));
                  bfg.controls.tabs.push(this.newTabItem({ label: 'Disinfection', title: 'Disinfection' }));
                }
              } else if (b.type === 'slideDeck') {
                bfg.patchValue({
                  id: b.id ?? crypto.randomUUID(),
                  required: b.required !== false,
                  theme: (b.theme ?? 'default') as 'default' | 'focus',
                  linkedQuizId: b.linkedQuizId ?? '',
                });

                bfg.controls.slides.clear();
                (b.slides ?? []).forEach((slide) => {
                  const slideGroup = this.newSlide();
                  slideGroup.patchValue({
                    id: slide.id ?? crypto.randomUUID(),
                    title: slide.title ?? '',
                    imageUrl: slide.imageUrl ?? '',
                    audioUrl: slide.audioUrl ?? '',
                    transcript: slide.transcript ?? '',
                    notesHtml: slide.notesHtml ?? '',
                  });

                  slideGroup.controls.interactiveCards.clear();
                  (slide.interactiveCards ?? []).forEach((card) => {
                    slideGroup.controls.interactiveCards.push(
                      this.newInteractiveCard({
                        title: card.title ?? '',
                        teaser: card.teaser ?? '',
                        bodyHtml: card.bodyHtml ?? '',
                        imageUrl: card.imageUrl ?? '',
                        variant: card.variant ?? 'default',
                        hotspotX: Number(card.hotspotX ?? 50),
                        hotspotY: Number(card.hotspotY ?? 50),
                      })
                    );
                  });

                  bfg.controls.slides.push(slideGroup);
                });

                if (bfg.controls.slides.length === 0) {
                  bfg.controls.slides.push(this.newSlide());
                }
              } else if (b.type === 'callout') {
                bfg.patchValue({
                  id: b.id ?? crypto.randomUUID(),
                  required: b.required !== false,
                  style: (b.style ?? 'info') as 'info' | 'warn' | 'success',
                  html: b.html ?? '',
                });
              } else if (b.type === 'quiz') {
                bfg.patchValue({
                  id: b.id ?? crypto.randomUUID(),
                  required: b.required !== false,
                  mode: (b.mode ?? 'single') as 'single' | 'multi' | 'caseStudy',
                  question: b.question ?? '',
                  linkedQuizId: b.linkedQuizId ?? '',
                });

                bfg.controls.choices.clear();
                (b.choices ?? []).forEach((ch) => {
                  bfg.controls.choices.push(
                    this.fb.group({
                      id: this.fb.control<string>(ch.id ?? crypto.randomUUID()),
                      text: this.fb.control<string>(ch.text ?? ''),
                      correct: this.fb.control<boolean>(!!ch.correct),
                    })
                  );
                });

                if (bfg.controls.choices.length === 0) {
                  bfg.controls.choices.push(this.newChoice('Option A'));
                  bfg.controls.choices.push(this.newChoice('Option B'));
                }
              }

              lfg.controls.blocks.push(bfg);
            });
          }

          sfg.controls.lessons.push(lfg);
        });
      }

      this.sectionsFA.push(sfg);
    });
  }

  private normalizeImportedCourse(raw: unknown): Omit<Course, 'id' | 'createdAt' | 'updatedAt'> {
    const source =
      raw && typeof raw === 'object' && 'docData' in (raw as Record<string, unknown>)
        ? (raw as { docData?: unknown }).docData
        : raw;

    if (!source || typeof source !== 'object') {
      throw new Error('Le fichier JSON doit contenir un objet cours valide.');
    }

    const course = source as Partial<Course>;
    if (!course.title?.trim()) {
      throw new Error('Le champ title est obligatoire.');
    }

    if (!Array.isArray(course.sections)) {
      throw new Error('Le champ sections est obligatoire et doit etre un tableau.');
    }

    const normalized: Omit<Course, 'id' | 'createdAt' | 'updatedAt'> = {
      title: course.title.trim(),
      subtitle: course.subtitle ?? '',
      description: course.description ?? '',
      lang: course.lang ?? 'EN',
      durationMin: Number(course.durationMin ?? 0),
      ceCredit: Number(course.ceCredit ?? 0),
      sortOrder: Number(course.sortOrder ?? this.nextSortOrder()),
      active: course.active ?? true,
      tags: Array.isArray(course.tags) ? course.tags.filter(Boolean) : [],
      imageUrl: course.imageUrl ?? '',
      kind: course.kind ?? 'Course',
      url: course.url ?? '',
      sections: course.sections,
      lecturer: course.lecturer ?? '',
      disclosures: Array.isArray(course.disclosures) ? course.disclosures.filter(Boolean) : [],
      targetAudience: Array.isArray(course.targetAudience) ? course.targetAudience.filter(Boolean) : [],
      prerequisites: Array.isArray(course.prerequisites) ? course.prerequisites.filter(Boolean) : [],
      requirements: Array.isArray(course.requirements) ? course.requirements.filter(Boolean) : [],
      accomodations: course.accomodations ?? '',
      orgId: course.orgId ?? null,
      orgType: course.orgType,
      healthMeta: course.healthMeta,
      releaseAt: course.releaseAt,
      publishedAt: course.publishedAt,
      isPublic: course.isPublic ?? false,
      passingScore: Number(course.passingScore ?? 80),
      lockedSequence: course.lockedSequence ?? false,
      exipirationDate: course.exipirationDate,
      confirmAt: course.confirmAt,
      confirmBy: course.confirmBy,
      confirmMessage: course.confirmMessage,
      type: course.type ?? 'Health',
      level: course.level ?? 'Beginner',
    };

    const quizErrors = this.quizValidationErrors(normalized.sections);
    if (quizErrors.length) {
      throw new Error(`Invalid quiz: ${quizErrors[0]}`);
    }

    return normalized;
  }

  async importCourseJson(event: Event): Promise<void> {
    this.importError = '';
    this.importSuccess = '';
    this.jsonAppliedNotice = '';
    this.pendingImport = null;
    this.pendingImportName = '';

    if (!this.canManageCourses) {
      this.importError = 'Seul le super admin peut importer des cours.';
      return;
    }

    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const course = this.normalizeImportedCourse(parsed);
      this.pendingImport = course;
      this.pendingImportName = file.name;
      this.importSuccess = `JSON valide: ${course.title}`;
      input.value = '';
    } catch (error) {
      this.importError = error instanceof Error ? error.message : 'Import JSON impossible.';
      if (input) input.value = '';
    }
  }

  cancelImportPreview(): void {
    this.pendingImport = null;
    this.pendingImportName = '';
    this.importError = '';
    this.importSuccess = '';
  }

  applyPendingImportToForm(): void {
    if (!this.pendingImport || !this.canManageCourses) return;

    this.applyCourseToForm(this.pendingImport);
    this.jsonAppliedNotice = this.editId
      ? `JSON applique au formulaire du cours en edition: ${this.pendingImport.title}`
      : `JSON applique au formulaire: ${this.pendingImport.title}`;
    this.importSuccess = 'JSON charge dans le formulaire. Verifiez puis enregistrez.';

    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {}
  }

  async confirmImportCourse(): Promise<void> {
    if (!this.pendingImport || !this.canManageCourses || this.importingCourse) return;

    this.importingCourse = true;
    try {
      await this.repo.add(this.pendingImport);
      this.importSuccess = `Cours importe: ${this.pendingImport.title}`;
      this.pendingImport = null;
      this.pendingImportName = '';
    } finally {
      this.importingCourse = false;
    }
  }

  exportCourseJson(c: Course): void {
    if (!this.canManageCourses) return;

    const payload = {
      docData: {
        ...c,
        id: c.id,
      },
    };

    const slug = (c.title || 'course')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'course';

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /* ============================
     Helpers
  ============================ */

  private csvToArray(value: string | null | undefined): string[] {
    return (value ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }

  private arrayToCsv(value: string[] | null | undefined): string {
    return Array.isArray(value) ? value.join(', ') : '';
  }

  private newChoice(text = '', correct = false): ChoiceForm {
    return this.fb.group({
      id: this.fb.control<string>(crypto.randomUUID()),
      text: this.fb.control<string>(text),
      correct: this.fb.control<boolean>(correct),
    });
  }

  private newInteractiveCard(seed?: {
    title?: string;
    teaser?: string;
    bodyHtml?: string;
    imageUrl?: string;
    variant?: 'default' | 'flip' | 'hotspot' | 'sequence';
    hotspotX?: number;
    hotspotY?: number;
  }): InteractiveCardForm {
    return this.fb.group({
      id: this.fb.control<string>(crypto.randomUUID()),
      title: this.fb.control<string>(seed?.title ?? 'New card'),
      teaser: this.fb.control<string>(seed?.teaser ?? ''),
      bodyHtml: this.fb.control<string>(seed?.bodyHtml ?? ''),
      imageUrl: this.fb.control<string>(seed?.imageUrl ?? ''),
      variant: this.fb.control<'default' | 'flip' | 'hotspot' | 'sequence'>(seed?.variant ?? 'default'),
      hotspotX: this.fb.control<number>(seed?.hotspotX ?? 50),
      hotspotY: this.fb.control<number>(seed?.hotspotY ?? 50),
    });
  }

  importedJsonPreview(course: Omit<Course, 'id' | 'createdAt' | 'updatedAt'>): string {
    return JSON.stringify({ docData: course }, null, 2);
  }

  previewCurrentFormJson(): void {
    const title = this.form.controls.title.value.trim() || 'new-course';
    const slug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'new-course';

    const docId = this.editId || `course-${slug}`;
    const payload: Course = {
      title: this.form.controls.title.value,
      subtitle: this.form.controls.subtitle.value || '',
      description: this.form.controls.description.value || '',
      lang: this.form.controls.lang.value,
      durationMin: Number(this.form.controls.durationMin.value ?? 0),
      ceCredit: Number(this.form.controls.ceCredit.value ?? 0),
      sortOrder: this.safeSortOrder(this.form.controls.sortOrder.value, this.nextSortOrder()),
      active: !!this.form.controls.active.value,
      tags: this.csvToArray(this.form.controls.tagsText.value),
      imageUrl: this.form.controls.imageUrl.value || '',
      kind: this.form.controls.kind.value,
      url: this.form.controls.url.value || '',
      level: this.form.controls.level.value || 'Beginner',
      type: this.form.controls.type.value,
      lecturer: this.form.controls.lecturer.value || '',
      disclosures: this.csvToArray(this.form.controls.disclosuresText.value),
      targetAudience: this.csvToArray(this.form.controls.targetAudienceText.value),
      prerequisites: this.csvToArray(this.form.controls.prerequisitesText.value),
      requirements: this.csvToArray(this.form.controls.requirementsText.value),
      accomodations: this.form.controls.accomodations.value || '',
      passingScore: Number(this.form.controls.passingScore.value ?? 80),
      lockedSequence: !!this.form.controls.lockedSequence.value,
      isPublic: !!this.form.controls.isPublic.value,
      sections: this.buildSectionsPayload(),
    };

    this.currentJsonPreview = JSON.stringify(
      {
        docPath: `courses/${docId}`,
        docId,
        docData: payload,
      },
      null,
      2
    );
  }

  closeCurrentJsonPreview(): void {
    this.currentJsonPreview = '';
  }

  private newAccordionItem(seed?: {
    title?: string;
    bodyText?: string;
    bulletsText?: string;
    bodyHtml?: string;
    required?: boolean;
  }): AccordionItemForm {
    return this.fb.group({
      id: this.fb.control<string>(crypto.randomUUID()),
      title: this.fb.control<string>(seed?.title ?? 'Accordion item'),
      bodyText: this.fb.control<string>(seed?.bodyText ?? ''),
      bulletsText: this.fb.control<string>(seed?.bulletsText ?? ''),
      bodyHtml: this.fb.control<string>(seed?.bodyHtml ?? ''),
      required: this.fb.control<boolean>(seed?.required ?? true),
    });
  }

  private newTabItem(seed?: {
    label?: string;
    title?: string;
    bodyHtml?: string;
    imageUrl?: string;
    imageAlt?: string;
    required?: boolean;
  }): TabItemForm {
    return this.fb.group({
      id: this.fb.control<string>(crypto.randomUUID()),
      label: this.fb.control<string>(seed?.label ?? 'Tab'),
      title: this.fb.control<string>(seed?.title ?? ''),
      bodyHtml: this.fb.control<string>(seed?.bodyHtml ?? ''),
      imageUrl: this.fb.control<string>(seed?.imageUrl ?? ''),
      imageAlt: this.fb.control<string>(seed?.imageAlt ?? ''),
      required: this.fb.control<boolean>(seed?.required ?? true),
    });
  }

  private newSlide(): SlideForm {
    return this.fb.group({
      id: this.fb.control<string>(crypto.randomUUID()),
      title: this.fb.control<string>('New slide'),
      imageUrl: this.fb.control<string>(''),
      audioUrl: this.fb.control<string>(''),
      transcript: this.fb.control<string>(''),
      notesHtml: this.fb.control<string>(''),
      interactiveCards: this.fb.array<InteractiveCardForm>([]),
    });
  }

  private newBlock(kind: Block['type'] = 'text'): BlockForm {
    return this.fb.group({
      id: this.fb.control<string>(crypto.randomUUID()),
      type: this.fb.control<Block['type']>(kind),
      title: this.fb.control<string>(''),
      level: this.fb.control<1 | 2 | 3>(2),
      text: this.fb.control<string>(''),
      html: this.fb.control<string>(''),
      bodyText: this.fb.control<string>(''),
      bulletsText: this.fb.control<string>(''),
      bodyHtml: this.fb.control<string>(''),
      introHtml: this.fb.control<string>(''),
      url: this.fb.control<string>(''),
      imageUrl: this.fb.control<string>(''),
      alt: this.fb.control<string>(''),
      caption: this.fb.control<string>(''),
      transcript: this.fb.control<string>(''),
      buttonLabel: this.fb.control<string>('Continue'),
      passPct: this.fb.control<number>(80),
      required: this.fb.control<boolean>(true),
      linkedQuizId: this.fb.control<string>(''),
      theme: this.fb.control<'default' | 'focus'>('default'),
      variant: this.fb.control<'flip' | 'gated'>('flip'),
      style: this.fb.control<'info' | 'warn' | 'success'>('info'),
      mode: this.fb.control<'single' | 'multi' | 'caseStudy'>('single'),
      question: this.fb.control<string>(''),
      choices: this.fb.array<ChoiceForm>([
        this.newChoice('Option A'),
        this.newChoice('Option B'),
        this.newChoice('Option C'),
      ]),
      items: this.fb.array<AccordionItemForm>([
        this.newAccordionItem({ title: 'First item' }),
        this.newAccordionItem({ title: 'Second item' }),
      ]),
      tabs: this.fb.array<TabItemForm>([
        this.newTabItem({
          label: 'Cleaning',
          title: 'Cleaning',
          bodyHtml: '<p>Describe the cleaning process and why visible soil must be removed before disinfection.</p>',
        }),
        this.newTabItem({
          label: 'Disinfection',
          title: 'Disinfection',
          bodyHtml: '<p>Describe the disinfection process and the expected level of disinfectant for the item.</p>',
        }),
      ]),
      cards: this.fb.array<InteractiveCardForm>([
        this.newInteractiveCard({ title: 'Card 1', variant: 'default' }),
        this.newInteractiveCard({ title: 'Card 2', variant: 'default' }),
      ]),
      slides: this.fb.array<SlideForm>([this.newSlide()]),
    });
  }

  private newLesson(): LessonForm {
    return this.fb.group({
      id: this.fb.control<string>(crypto.randomUUID()),
      title: this.fb.control<string>('New lesson', {
        validators: [Validators.required],
      }),
      estMin: this.fb.control<number>(5, {
        validators: [Validators.min(0)],
      }),
      continueMode: this.fb.control<'guided' | 'free'>('guided'),
      blocks: this.fb.array<BlockForm>([
        this.newBlock('heading'),
        this.newBlock('text'),
      ]),
    });
  }

  private newSection(): SectionForm {
    return this.fb.group({
      id: this.fb.control<string>(crypto.randomUUID()),
      title: this.fb.control<string>('New section', {
        validators: [Validators.required],
      }),
      lessons: this.fb.array<LessonForm>([this.newLesson()]),
      url: this.fb.control<string>(''),
    });
  }

  private formatStructuredHtml(bodyText = '', bulletsText = ''): string {
    const trimmedBody = bodyText
      .split(/\r?\n\r?\n/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => `<p>${this.escapeHtml(chunk).replace(/\r?\n/g, '<br>')}</p>`)
      .join('');

    const bulletItems = bulletsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<li>${this.escapeHtml(line)}</li>`)
      .join('');

    return `${trimmedBody}${bulletItems ? `<ul>${bulletItems}</ul>` : ''}`;
  }

  private applyStructuredContentToBlock(block: BlockForm): void {
    block.patchValue({
      bodyHtml: this.formatStructuredHtml(
        block.controls.bodyText.value ?? '',
        block.controls.bulletsText.value ?? ''
      ),
    });
  }

  private applyStructuredContentToAccordionItem(item: AccordionItemForm): void {
    item.patchValue({
      bodyHtml: this.formatStructuredHtml(
        item.controls.bodyText.value ?? '',
        item.controls.bulletsText.value ?? ''
      ),
    });
  }

  /* ============================
     Section ops
  ============================ */

  addSection() {
    this.sectionsFA.push(this.newSection());
  }

  removeSection(i: number) {
    this.sectionsFA.removeAt(i);
  }

  sectionAt(i: number) {
    return this.sectionsFA.at(i);
  }

  lessonsFA(i: number) {
    return this.sectionAt(i).controls.lessons;
  }

  addLesson(si: number) {
    this.lessonsFA(si).push(this.newLesson());
  }

  addLessonTemplate(si: number, template: 'select-interactive' | 'quiz-module' | 'orientation' | 'hotspot-diagram' | 'tabbed-compare') {
    const lesson = this.newLesson();
    const blocks = lesson.controls.blocks;
    blocks.clear();

    if (template === 'select-interactive') {
      lesson.patchValue({ title: 'Interactive Learning Module', estMin: 12, continueMode: 'guided' });
      const hero = this.newBlock('hero');
      hero.patchValue({
        title: 'Start this module',
        bodyText: 'Review the overview, explore each accordion section, then complete the interactive cards and quiz.',
        buttonLabel: 'Start lesson',
      });
      this.applyStructuredContentToBlock(hero);

      const accordion = this.newBlock('accordion');
      accordion.patchValue({ title: 'Module Overview' });
      accordion.controls.items.clear();
      accordion.controls.items.push(this.newAccordionItem({
        title: 'Learning objectives',
        bodyText: 'Understand what this module covers and what success looks like.',
        bulletsText: 'Review the scope\nUnderstand the expected outcomes\nPrepare for the quiz',
      }));
      accordion.controls.items.push(this.newAccordionItem({
        title: 'Key concepts',
        bodyText: 'Open each panel to review the main concepts in sequence.',
        bulletsText: 'Concept 1\nConcept 2\nConcept 3',
      }));
      accordion.controls.items.controls.forEach((item) => this.applyStructuredContentToAccordionItem(item));

      const cardStack = this.newBlock('cardStack');
      cardStack.patchValue({ title: 'Interactive review cards', variant: 'gated', introHtml: '<p>Open each card in order.</p>' });
      cardStack.controls.cards.clear();
      cardStack.controls.cards.push(this.newInteractiveCard({ title: 'Step 1', teaser: 'Understand the first principle', bodyHtml: '<p>Explain the first principle here.</p>' }));
      cardStack.controls.cards.push(this.newInteractiveCard({ title: 'Step 2', teaser: 'Apply the concept', bodyHtml: '<p>Describe how to apply it in practice.</p>' }));
      cardStack.controls.cards.push(this.newInteractiveCard({ title: 'Step 3', teaser: 'Validate understanding', bodyHtml: '<p>Summarize the expected learner behaviour.</p>' }));

      const quiz = this.newBlock('quiz');
      const quizLinkId = quiz.controls.id.value;
      const quizIntro = this.newBlock('quizIntro');
      quizIntro.patchValue({
        title: 'Knowledge check',
        buttonLabel: 'Start quiz',
        passPct: 80,
        linkedQuizId: quizLinkId,
        bodyText: 'You must pass this quiz before continuing.',
      });
      this.applyStructuredContentToBlock(quizIntro);
      quiz.patchValue({
        linkedQuizId: quizLinkId,
        question: 'Which statement best reflects the module objective?',
        mode: 'single',
      });

      blocks.push(hero);
      blocks.push(accordion);
      blocks.push(cardStack);
      blocks.push(quizIntro);
      blocks.push(quiz);
    } else if (template === 'hotspot-diagram') {
      lesson.patchValue({ title: 'Interactive Hotspot Diagram', estMin: 8, continueMode: 'guided' });
      const slideDeck = this.newBlock('slideDeck');
      slideDeck.patchValue({ theme: 'focus' });
      const slide = slideDeck.controls.slides.at(0);
      slide.patchValue({
        title: 'Click each + icon to learn more',
        imageUrl: '',
        notesHtml: '<p>Use a diagram image as the slide visual, then place hotspot cards over the key areas.</p>',
      });
      slide.controls.interactiveCards.clear();
      slide.controls.interactiveCards.push(this.newInteractiveCard({
        title: 'Infectious Agent',
        teaser: 'What starts the chain',
        bodyHtml: '<p>This is a microorganism that can cause harmful infections and make you ill.</p>',
        variant: 'hotspot',
        hotspotX: 34,
        hotspotY: 22,
      }));
      slide.controls.interactiveCards.push(this.newInteractiveCard({
        title: 'Susceptible Host',
        teaser: 'Who can become infected',
        bodyHtml: '<p>A susceptible host is a person who can become ill when exposed to the infectious agent.</p>',
        variant: 'hotspot',
        hotspotX: 22,
        hotspotY: 45,
      }));
      slide.controls.interactiveCards.push(this.newInteractiveCard({
        title: 'Means of Transmission',
        teaser: 'How it spreads',
        bodyHtml: '<p>Transmission can occur through contact, droplets, contaminated equipment, or other routes depending on the organism.</p>',
        variant: 'hotspot',
        hotspotX: 50,
        hotspotY: 74,
      }));
      blocks.push(slideDeck);
    } else if (template === 'tabbed-compare') {
      lesson.patchValue({ title: 'Tabbed Comparison', estMin: 6, continueMode: 'guided' });
      const tabs = this.newBlock('tabs');
      tabs.patchValue({
        title: 'Compare the key concepts',
        introHtml: '<p>Select each tab to review the difference between the concepts.</p>',
      });
      tabs.controls.tabs.clear();
      tabs.controls.tabs.push(this.newTabItem({
        label: 'Cleaning',
        title: 'Cleaning',
        bodyHtml: '<p>Cleaning removes visible soil and organic material from equipment before disinfection or sterilization.</p>',
      }));
      tabs.controls.tabs.push(this.newTabItem({
        label: 'Disinfection',
        title: 'Three Levels of Disinfection',
        bodyHtml: '<ol><li><strong>Low-level disinfection</strong> kills most bacteria, some viruses, and some fungi.</li><li><strong>Intermediate-level disinfection</strong> kills mycobacterium and most viruses.</li><li><strong>High-level disinfection</strong> kills all organisms except bacterial spores.</li></ol>',
      }));
      blocks.push(tabs);
    } else if (template === 'quiz-module') {
      lesson.patchValue({ title: 'Quiz Review Module', estMin: 8, continueMode: 'guided' });
      const quiz = this.newBlock('quiz');
      const quizLinkId = quiz.controls.id.value;
      const quizIntro = this.newBlock('quizIntro');
      quizIntro.patchValue({
        title: 'Assessment instructions',
        buttonLabel: 'Begin assessment',
        passPct: 80,
        linkedQuizId: quizLinkId,
        bodyText: 'Read the instructions and start the assessment when ready.',
        bulletsText: 'Passing score is required\nYou can retry if needed',
      });
      this.applyStructuredContentToBlock(quizIntro);
      quiz.patchValue({ linkedQuizId: quizLinkId, question: 'Sample question', mode: 'single' });
      blocks.push(quizIntro);
      blocks.push(quiz);
    } else {
      lesson.patchValue({ title: 'Orientation Module', estMin: 6, continueMode: 'guided' });
      const hero = this.newBlock('hero');
      hero.patchValue({
        title: 'Welcome to the course',
        bodyText: 'Use this orientation to understand the course structure before starting.',
        bulletsText: 'Review the course purpose\nOpen each orientation section\nProceed when complete',
        buttonLabel: 'Continue',
      });
      this.applyStructuredContentToBlock(hero);
      const accordion = this.newBlock('accordion');
      accordion.patchValue({ title: 'Orientation checklist' });
      accordion.controls.items.clear();
      accordion.controls.items.push(this.newAccordionItem({ title: 'Navigation', bodyText: 'Explain where lessons, progress and actions are located.' }));
      accordion.controls.items.push(this.newAccordionItem({ title: 'Completion rules', bodyText: 'Explain when the Continue button unlocks.' }));
      accordion.controls.items.controls.forEach((item) => this.applyStructuredContentToAccordionItem(item));
      blocks.push(hero);
      blocks.push(accordion);
    }

    this.lessonsFA(si).push(lesson);
  }

  removeLesson(si: number, li: number) {
    this.lessonsFA(si).removeAt(li);
  }

  lessonAt(si: number, li: number) {
    return this.lessonsFA(si).at(li);
  }

  blocksFA(si: number, li: number) {
    return this.lessonAt(si, li).controls.blocks;
  }

  addBlock(si: number, li: number, type: Block['type'] = 'text') {
    this.blocksFA(si, li).push(this.newBlock(type));
  }

  removeBlock(si: number, li: number, bi: number) {
    this.blocksFA(si, li).removeAt(bi);
  }

  addChoice(si: number, li: number, bi: number) {
    const blk = this.blocksFA(si, li).at(bi);
    blk.controls.choices.push(this.newChoice());
  }

  slidesFA(si: number, li: number, bi: number) {
    return this.blocksFA(si, li).at(bi).controls.slides;
  }

  interactiveCardsFA(si: number, li: number, bi: number, slideIndex: number) {
    return this.slidesFA(si, li, bi).at(slideIndex).controls.interactiveCards;
  }

  accordionItemsFA(si: number, li: number, bi: number) {
    return this.blocksFA(si, li).at(bi).controls.items;
  }

  tabItemsFA(si: number, li: number, bi: number) {
    return this.blocksFA(si, li).at(bi).controls.tabs;
  }

  blockCardsFA(si: number, li: number, bi: number) {
    return this.blocksFA(si, li).at(bi).controls.cards;
  }

  addSlide(si: number, li: number, bi: number) {
    this.slidesFA(si, li, bi).push(this.newSlide());
  }

  removeSlide(si: number, li: number, bi: number, slideIndex: number) {
    const slides = this.slidesFA(si, li, bi);
    if (slides.length <= 1) return;
    slides.removeAt(slideIndex);
  }

  addInteractiveCard(si: number, li: number, bi: number, slideIndex: number) {
    this.interactiveCardsFA(si, li, bi, slideIndex).push(this.newInteractiveCard());
  }

  addAccordionItem(si: number, li: number, bi: number) {
    this.accordionItemsFA(si, li, bi).push(this.newAccordionItem());
  }

  removeAccordionItem(si: number, li: number, bi: number, itemIndex: number) {
    this.accordionItemsFA(si, li, bi).removeAt(itemIndex);
  }

  addTabItem(si: number, li: number, bi: number) {
    this.tabItemsFA(si, li, bi).push(this.newTabItem({ label: 'New tab' }));
  }

  removeTabItem(si: number, li: number, bi: number, tabIndex: number) {
    const tabs = this.tabItemsFA(si, li, bi);
    if (tabs.length <= 1) return;
    tabs.removeAt(tabIndex);
  }

  addBlockCard(si: number, li: number, bi: number) {
    this.blockCardsFA(si, li, bi).push(this.newInteractiveCard({ variant: 'default' }));
  }

  removeBlockCard(si: number, li: number, bi: number, cardIndex: number) {
    this.blockCardsFA(si, li, bi).removeAt(cardIndex);
  }

  removeInteractiveCard(si: number, li: number, bi: number, slideIndex: number, cardIndex: number) {
    this.interactiveCardsFA(si, li, bi, slideIndex).removeAt(cardIndex);
  }

  removeChoice(si: number, li: number, bi: number, ci: number) {
    const blk = this.blocksFA(si, li).at(bi);
    blk.controls.choices.removeAt(ci);
  }

  quizLinkOptions(si: number, li: number, currentBi: number) {
    return this.blocksFA(si, li).controls
      .map((block, index) => ({ block, index }))
      .filter(({ block, index }) => index !== currentBi && block.controls.type.value === 'quiz')
      .map(({ block, index }) => ({
        id: block.controls.id.value,
        label: block.controls.question.value?.trim() || `Quiz block ${index + 1}`,
      }));
  }

  onBlockTypeChange(b: BlockForm) {
    if (b.controls.type.value === 'quiz' && b.controls.choices.length === 0) {
      b.controls.choices.push(this.newChoice('Option A'));
      b.controls.choices.push(this.newChoice('Option B'));
    }

    if (b.controls.type.value === 'slideDeck' && b.controls.slides.length === 0) {
      b.controls.slides.push(this.newSlide());
    }

    if (b.controls.type.value === 'accordion' && b.controls.items.length === 0) {
      b.controls.items.push(this.newAccordionItem({ title: 'First item' }));
      b.controls.items.push(this.newAccordionItem({ title: 'Second item' }));
    }

    if (b.controls.type.value === 'tabs' && b.controls.tabs.length === 0) {
      b.controls.tabs.push(this.newTabItem({ label: 'Cleaning', title: 'Cleaning' }));
      b.controls.tabs.push(this.newTabItem({ label: 'Disinfection', title: 'Disinfection' }));
    }

    if (b.controls.type.value === 'cardStack' && b.controls.cards.length === 0) {
      b.controls.cards.push(this.newInteractiveCard({ title: 'Card 1', variant: 'default' }));
      b.controls.cards.push(this.newInteractiveCard({ title: 'Card 2', variant: 'default' }));
    }
  }

  ttsStatus(si: number, li: number): TtsGenerationStatus | null {
    this.ttsStatusVersion();
    return this.ttsStatusByLesson.get(this.ttsKey(si, li)) ?? null;
  }

  ttsButtonLabel(si: number, li: number): string {
    const status = this.ttsStatus(si, li);
    if (status?.loading) return 'Generating audio...';
    if (status?.error) return 'Retry Audio';
    if (status?.success) return 'Regenerate Audio';
    return 'Generate Audio';
  }

  setTtsIncludeQuizChoices(checked: boolean): void {
    this.ttsIncludeQuizChoices = checked;
  }

  async generateAudio(si: number, li: number): Promise<void> {
    const courseId = this.editId;
    const lesson = this.lessonAt(si, li);
    const lessonTitle = (lesson.value.title || 'Lesson').trim();
    const key = this.ttsKey(si, li);

    if (!courseId) {
      this.setTtsStatus(key, {
        loading: false,
        error: 'Save the course before generating lesson audio.',
      });
      return;
    }

    const transcript = buildLessonTranscript(lesson.getRawValue(), {
      includeQuizChoices: this.ttsIncludeQuizChoices,
    });

    if (!transcript) {
      this.setTtsStatus(key, {
        loading: false,
        error: 'No transcript text found for this lesson.',
      });
      return;
    }

    const title = `Audio Recap: ${lessonTitle}`;
    this.setTtsStatus(key, { loading: true });

    try {
      const result = await this.tts.generateLessonAudio({
        courseId,
        lessonId: lesson.value.id!,
        title,
        transcript,
        language: this.ttsLanguage,
        voice: this.ttsVoice,
        speakingRate: this.ttsSpeakingRate,
      });

      this.upsertGeneratedAudioBlock(si, li, {
        title,
        url: result.url,
        transcript,
      });

      await this.repo.update(courseId, { sections: this.buildSectionsPayload() });

      this.setTtsStatus(key, {
        loading: false,
        success: 'Audio generated and attached to the lesson.',
        url: result.url,
      });
    } catch (error: any) {
      this.setTtsStatus(key, {
        loading: false,
        error: error?.message || 'Audio generation failed.',
      });
    }
  }

  private upsertGeneratedAudioBlock(
    si: number,
    li: number,
    audio: { title: string; url: string; transcript: string }
  ): void {
    const blocks = this.blocksFA(si, li);
    const existingIndex = blocks.controls.findIndex((block) => {
      return block.value.type === 'audio' && (block.value.title ?? '').startsWith('Audio Recap:');
    });
    const audioBlock = existingIndex >= 0 ? blocks.at(existingIndex) : this.newBlock('audio');

    audioBlock.patchValue({
      type: 'audio',
      title: audio.title,
      url: audio.url,
      transcript: audio.transcript,
    });

    if (existingIndex < 0) {
      blocks.push(audioBlock);
    }
  }

  private ttsKey(si: number, li: number): string {
    const lessonId = this.lessonsFA(si).at(li)?.value.id ?? `${si}:${li}`;
    return `${si}:${li}:${lessonId}`;
  }

  private setTtsStatus(key: string, status: TtsGenerationStatus): void {
    this.ttsStatusByLesson.set(key, status);
    this.ttsStatusVersion.update(value => value + 1);
  }

  /* ============================
     Preview
  ============================ */

  previewFor(b: BlockForm): SafeHtml {
    const t = b.value.type;

    if (t === 'text' || t === 'callout') {
      const html = b.value.html ?? '';
      return this.sanitizer.bypassSecurityTrustHtml(html);
    }

    if (t === 'heading') {
      const lv = Math.min(3, Math.max(1, Number(b.value.level ?? 2)));
      const tag = `h${lv}`;
      const text = this.escapeHtml(b.value.text ?? '');
      return this.sanitizer.bypassSecurityTrustHtml(`<${tag}>${text}</${tag}>`);
    }

    if (t === 'image') {
      const url = this.escapeAttr(b.value.url ?? '');
      const alt = this.escapeAttr(b.value.alt ?? '');
      const caption = this.escapeHtml(b.value.caption ?? '');
      return this.sanitizer.bypassSecurityTrustHtml(
        url
          ? `<figure><img src="${url}" alt="${alt}"/><figcaption>${caption}</figcaption></figure>`
          : ''
      );
    }

    if (t === 'video') {
      const rawUrl = (b.value.url ?? '').trim();

      const yt =
        rawUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/)?.[1] ??
        rawUrl.match(/youtube\.com\/embed\/([^&?/]+)/)?.[1];

      if (yt) {
        return this.sanitizer.bypassSecurityTrustHtml(`
          <div style="position:relative;padding-top:56.25%;">
            <iframe
              src="https://www.youtube.com/embed/${this.escapeAttr(yt)}"
              style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:12px;"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen>
            </iframe>
          </div>
        `);
      }

      const vimeo = rawUrl.match(/vimeo\.com\/(\d+)/)?.[1];
      if (vimeo) {
        return this.sanitizer.bypassSecurityTrustHtml(`
          <div style="position:relative;padding-top:56.25%;">
            <iframe
              src="https://player.vimeo.com/video/${this.escapeAttr(vimeo)}"
              style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:12px;"
              allow="autoplay; fullscreen; picture-in-picture"
              allowfullscreen>
            </iframe>
          </div>
        `);
      }

      const src = this.escapeAttr(rawUrl);
      return this.sanitizer.bypassSecurityTrustHtml(
        src
          ? `<video controls style="max-width:100%;border-radius:12px;">
               <source src="${src}">
             </video>`
          : ''
      );
    }

    if (t === 'audio') {
      const src = this.escapeAttr((b.value.url ?? '').trim());
      return this.sanitizer.bypassSecurityTrustHtml(
        src ? `<audio controls style="width:100%;"><source src="${src}"></audio>` : ''
      );
    }

    if (t === 'hero') {
      const title = this.escapeHtml(b.value.title ?? 'Lesson start');
      const imageUrl = this.escapeAttr((b.value.imageUrl ?? '').trim());
      const body = b.value.bodyHtml ? String(b.value.bodyHtml) : '';
      const buttonLabel = this.escapeHtml(b.value.buttonLabel ?? 'Continue');
      return this.sanitizer.bypassSecurityTrustHtml(`
        <div style="display:grid;gap:12px;border:1px solid #dbe4f0;border-radius:16px;padding:18px;background:linear-gradient(180deg,#f8fbff,#ffffff);">
          ${imageUrl ? `<img src="${imageUrl}" alt="${title}" style="width:100%;max-height:220px;object-fit:cover;border-radius:12px;">` : ''}
          <div style="font-size:24px;font-weight:800;">${title}</div>
          ${body}
          <div><button type="button" style="padding:10px 18px;border-radius:999px;border:0;background:#234a84;color:#fff;font-weight:700;">${buttonLabel}</button></div>
        </div>
      `);
    }

    if (t === 'accordion') {
      const title = this.escapeHtml(b.value.title ?? 'Accordion section');
      const intro = b.value.introHtml ? String(b.value.introHtml) : '';
      const items = b.controls.items.controls
        .map((item) => `
          <details style="border:1px solid #dbe4f0;border-radius:12px;padding:0 12px;background:#fff;">
            <summary style="padding:12px 0;font-weight:700;cursor:pointer;">${this.escapeHtml(item.value.title ?? '')}</summary>
            <div style="padding:0 0 12px;">${item.value.bodyHtml ? String(item.value.bodyHtml) : ''}</div>
          </details>
        `)
        .join('');
      return this.sanitizer.bypassSecurityTrustHtml(`
        <div style="display:grid;gap:10px;">
          <div style="font-size:20px;font-weight:800;">${title}</div>
          ${intro}
          ${items}
        </div>
      `);
    }

    if (t === 'cardStack') {
      const title = this.escapeHtml(b.value.title ?? 'Interactive cards');
      const intro = b.value.introHtml ? String(b.value.introHtml) : '';
      const cards = b.controls.cards.controls
        .map((card, index) => `
          <div style="border:1px solid #dbe4f0;border-radius:14px;padding:14px;background:#fff;">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700;margin-bottom:4px;">${this.escapeHtml(b.value.variant ?? 'flip')} card ${index + 1}</div>
            <div style="font-size:18px;font-weight:700;">${this.escapeHtml(card.value.title ?? '')}</div>
            ${card.value.teaser ? `<div style="margin-top:4px;color:#64748b;">${this.escapeHtml(card.value.teaser)}</div>` : ''}
          </div>
        `)
        .join('');
      return this.sanitizer.bypassSecurityTrustHtml(`
        <div style="display:grid;gap:12px;">
          <div style="font-size:20px;font-weight:800;">${title}</div>
          ${intro}
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">${cards}</div>
        </div>
      `);
    }

    if (t === 'quizIntro') {
      const title = this.escapeHtml(b.value.title ?? 'Quiz');
      const body = b.value.bodyHtml ? String(b.value.bodyHtml) : '';
      const buttonLabel = this.escapeHtml(b.value.buttonLabel ?? 'Start quiz');
      return this.sanitizer.bypassSecurityTrustHtml(`
        <div style="display:grid;gap:12px;border:1px solid #dbe4f0;border-radius:16px;padding:18px;background:#fff;">
          <div style="font-size:24px;font-weight:800;">${title}</div>
          ${body}
          <div style="font-size:13px;color:#64748b;">Passing score: ${Number(b.value.passPct ?? 80)}%</div>
          <div><button type="button" style="padding:10px 18px;border-radius:999px;border:0;background:#234a84;color:#fff;font-weight:700;">${buttonLabel}</button></div>
        </div>
      `);
    }

    if (t === 'tabs') {
      const title = this.escapeHtml(b.value.title ?? 'Tabs');
      const intro = b.value.introHtml ? String(b.value.introHtml) : '';
      const tabs = b.controls.tabs.controls;
      const active = tabs[0]?.value;
      const tabButtons = tabs
        .map((tab, index) => `
          <span style="display:inline-flex;padding:10px 16px;border:1px solid #dbe4f0;background:${index === 0 ? '#ffffff' : '#f8fafc'};font-weight:800;text-transform:uppercase;letter-spacing:.08em;font-size:12px;">
            ${this.escapeHtml(tab.value.label ?? `Tab ${index + 1}`)}
          </span>
        `)
        .join('');
      const imageUrl = this.escapeAttr((active?.imageUrl ?? '').trim());
      const imageAlt = this.escapeAttr(active?.imageAlt ?? active?.title ?? '');
      return this.sanitizer.bypassSecurityTrustHtml(`
        <div style="display:grid;gap:12px;">
          <div style="font-size:20px;font-weight:800;">${title}</div>
          ${intro}
          <div style="display:flex;flex-wrap:wrap;">${tabButtons}</div>
          <div style="display:grid;gap:12px;border:1px solid #dbe4f0;border-radius:0 0 14px 14px;padding:18px;background:#fff;">
            ${active?.title ? `<div style="font-size:18px;font-weight:800;">${this.escapeHtml(active.title)}</div>` : ''}
            ${active?.bodyHtml ? String(active.bodyHtml) : ''}
            ${imageUrl ? `<img src="${imageUrl}" alt="${imageAlt}" style="width:100%;max-height:220px;object-fit:cover;border-radius:12px;">` : ''}
          </div>
        </div>
      `);
    }

    if (t === 'slideDeck') {
      const slide = b.controls.slides.at(0)?.value;
      if (!slide) {
        return this.sanitizer.bypassSecurityTrustHtml('');
      }

      const title = this.escapeHtml(slide.title ?? 'New slide');
      const imageUrl = this.escapeAttr((slide.imageUrl ?? '').trim());
      const audioUrl = this.escapeAttr((slide.audioUrl ?? '').trim());
      const notes = slide.notesHtml ? String(slide.notesHtml) : '';
      const cards = (slide.interactiveCards ?? [])
        .map((card) => `
          <div style="border:1px solid #dbe4f0;border-radius:12px;padding:10px;background:#fff;">
            <div style="font-weight:700;">${this.escapeHtml(card.title ?? 'Card')}</div>
            ${card.teaser ? `<div style="color:#64748b;font-size:13px;margin-top:4px;">${this.escapeHtml(card.teaser)}</div>` : ''}
            <div style="color:#94a3b8;font-size:12px;margin-top:6px;text-transform:capitalize;">${this.escapeHtml(card.variant ?? 'default')}</div>
          </div>
        `)
        .join('');

      return this.sanitizer.bypassSecurityTrustHtml(`
        <div style="display:grid;gap:12px;">
          <div style="font-weight:800;">${title}</div>
          ${imageUrl ? `<img src="${imageUrl}" alt="${title}" style="width:100%;border-radius:12px;object-fit:cover;max-height:220px;">` : ''}
          ${audioUrl ? `<audio controls style="width:100%;"><source src="${audioUrl}"></audio>` : ''}
          ${notes}
          ${cards ? `<div style="display:grid;gap:8px;">${cards}</div>` : ''}
        </div>
      `);
    }

    if (t === 'quiz') {
      const q = this.escapeHtml(b.value.question ?? '');
      const items = (b.controls.choices.controls ?? [])
        .map((c) => `<li>${this.escapeHtml(c.value.text ?? '')}</li>`)
        .join('');
      return this.sanitizer.bypassSecurityTrustHtml(
        `<strong>${q}</strong><ul>${items}</ul>`
      );
    }

    return this.sanitizer.bypassSecurityTrustHtml('');
  }

  private escapeHtml(s: string) {
    return s.replace(
      /[&<>"']/g,
      (ch) =>
        (
          {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          } as Record<string, string>
        )[ch] || ch
    );
  }

  private escapeAttr(s: string) {
    return (s ?? '').replace(/"/g, '&quot;');
  }

  /* ============================
     Drag & Drop
  ============================ */

  private moveInFA(fa: FormArray, prev: number, curr: number) {
    if (prev === curr) return;

    const ctrl = fa.at(prev);
    if (!ctrl) return;

    fa.removeAt(prev);
    fa.insert(curr, ctrl);
  }

  dropSections(ev: CdkDragDrop<any[]>) {
    this.moveInFA(this.sectionsFA, ev.previousIndex, ev.currentIndex);
  }

  dropLessons(si: number, ev: CdkDragDrop<any[]>) {
    const fa = this.lessonsFA(si) as unknown as FormArray;
    this.moveInFA(fa, ev.previousIndex, ev.currentIndex);
  }

  dropBlocks(si: number, li: number, ev: CdkDragDrop<any[]>) {
    const fa = this.blocksFA(si, li) as unknown as FormArray;
    this.moveInFA(fa, ev.previousIndex, ev.currentIndex);
  }

  /* ============================
     Edit
  ============================ */

  async editCourse(c: Course) {
    if (!this.canManageCourses) return;

    const id = c.id;
    if (!id) return;

    this.loadingEdit = true;
    try {
      const full = await this.repo.load(id);
      const data = full ?? c;

      this.editId = id;
      this.applyCourseToForm(data);

      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {}
    } finally {
      this.loadingEdit = false;
    }
  }

  cancelEdit() {
    if (!this.canManageCourses) return;
    this.editId = null;
    this.resetForm();
  }

  private resetForm() {
    this.form.reset({
      title: '',
      subtitle: '',
      description: '',
      lang: 'EN',
      durationMin: 60,
      ceCredit: 0,
      sortOrder: this.nextSortOrder(),
      active: true,
      kind: 'Course',
      type: 'Health',
      imageUrl: '',
      url: '',
      lecturer: '',
      accomodations: '',
      passingScore: 80,
      lockedSequence: false,
      isPublic: false,
      tagsText: '',
      disclosuresText: '',
      targetAudienceText: '',
      prerequisitesText: '',
      requirementsText: '',
    });
    this.jsonAppliedNotice = '';
    this.currentJsonPreview = '';
    this.sectionsFA.clear();
  }

  /* ============================
     Duplicate
  ============================ */

  async duplicateCourse(c: Course) {
    if (!this.canManageCourses) return;

    const id = c.id;
    if (!id) return;

    this.duplicatingId = id;
    try {
      const full = await this.repo.load(id);
      const src = full ?? c;

      const cloned: Omit<Course, 'id' | 'createdAt' | 'updatedAt'> = {
        title: `${src.title ?? 'Course'} (Copy)`,
        subtitle: src.subtitle ?? '',
        description: src.description ?? '',
        lang: src.lang ?? 'EN',
        durationMin: Number(src.durationMin ?? 0),
        ceCredit: Number(src.ceCredit ?? 0),
        sortOrder: this.nextSortOrder(),
        active: false,
        tags: Array.isArray(src.tags) ? [...src.tags] : [],
        imageUrl: src.imageUrl ?? '',
        kind: src.kind ?? 'Course',
        url: src.url ?? '',
        level: src.level ?? 'Beginner',
        type: src.type ?? 'Health',
        lecturer: src.lecturer ?? '',
        disclosures: Array.isArray(src.disclosures) ? [...src.disclosures] : [],
        targetAudience: Array.isArray(src.targetAudience)
          ? [...src.targetAudience]
          : [],
        prerequisites: Array.isArray(src.prerequisites)
          ? [...src.prerequisites]
          : [],
        requirements: Array.isArray(src.requirements) ? [...src.requirements] : [],
        accomodations: src.accomodations ?? '',
        passingScore: Number(src.passingScore ?? 80),
        lockedSequence: !!src.lockedSequence,
        isPublic: !!src.isPublic,
        healthMeta: src.healthMeta ?? undefined,
        orgId: src.orgId ?? null,
        orgType: src.orgType,

        sections: (src.sections ?? []).map((s, si) => ({
          id: crypto.randomUUID(),
          title: s.title ?? '',
          order: si,
          estMin: s.estMin,
          estMax: s.estMax,
          estAvg: s.estAvg,
          estTotal: s.estTotal,
          estTotalHours: s.estTotalHours,
          estTotalCreditUnits: s.estTotalCreditUnits,
          estTotalCreditHours: s.estTotalCreditHours,
          estTotalHoursPerCreditUnit: s.estTotalHoursPerCreditUnit,
          estTotalCreditUnitsPerHour: s.estTotalCreditUnitsPerHour,
          estTotalHoursPerCreditHour: s.estTotalHoursPerCreditHour,

          lessons: (s.lessons ?? []).map((l, li) => ({
            id: crypto.randomUUID(),
            title: l.title ?? '',
            estMin: Number(l.estMin ?? 0),
            order: li,
            createdAt: l.createdAt,
            updatedAt: l.updatedAt,

            blocks: (l.blocks ?? []).map((b) => {
              if (b.type === 'heading') {
                return {
                  type: 'heading',
                  level: b.level ?? 2,
                  text: b.text ?? '',
                } as Block;
              }

              if (b.type === 'text') {
                return { type: 'text', html: b.html ?? '' } as Block;
              }

              if (b.type === 'image') {
                return {
                  type: 'image',
                  url: b.url ?? '',
                  alt: b.alt ?? '',
                  caption: b.caption ?? '',
                } as Block;
              }

              if (b.type === 'audio') {
                return {
                  type: 'audio',
                  title: b.title ?? '',
                  url: b.url ?? '',
                  transcript: b.transcript ?? '',
                } as Block;
              }

              if (b.type === 'video') {
                return {
                  type: 'video',
                  url: b.url ?? '',
                  transcript: b.transcript ?? '',
                } as Block;
              }

              if (b.type === 'hero') {
                return {
                  type: 'hero',
                  title: b.title ?? '',
                  bodyHtml: b.bodyHtml ?? '',
                  imageUrl: b.imageUrl ?? '',
                  buttonLabel: b.buttonLabel ?? 'Continue',
                } as Block;
              }

              if (b.type === 'accordion') {
                return {
                  type: 'accordion',
                  title: b.title ?? '',
                  introHtml: b.introHtml ?? '',
                  items: (b.items ?? []).map((item) => ({
                    id: crypto.randomUUID(),
                    title: item.title ?? '',
                    bodyHtml: item.bodyHtml ?? '',
                    required: item.required !== false,
                  })),
                } as Block;
              }

              if (b.type === 'cardStack') {
                return {
                  type: 'cardStack',
                  title: b.title ?? '',
                  introHtml: b.introHtml ?? '',
                  variant: b.variant ?? 'flip',
                  cards: (b.cards ?? []).map((card) => ({
                    id: crypto.randomUUID(),
                    title: card.title ?? '',
                    teaser: card.teaser ?? '',
                    bodyHtml: card.bodyHtml ?? '',
                    imageUrl: card.imageUrl ?? '',
                    required: true,
                  })),
                } as Block;
              }

              if (b.type === 'quizIntro') {
                return {
                  type: 'quizIntro',
                  title: b.title ?? '',
                  bodyHtml: b.bodyHtml ?? '',
                  buttonLabel: b.buttonLabel ?? 'Start quiz',
                  passPct: Number(b.passPct ?? 80),
                } as Block;
              }

              if (b.type === 'tabs') {
                return {
                  type: 'tabs',
                  title: b.title ?? '',
                  introHtml: b.introHtml ?? '',
                  tabs: (b.tabs ?? []).map((tab) => ({
                    id: crypto.randomUUID(),
                    label: tab.label ?? '',
                    title: tab.title ?? '',
                    bodyHtml: tab.bodyHtml ?? '',
                    imageUrl: tab.imageUrl ?? '',
                    imageAlt: tab.imageAlt ?? '',
                    required: tab.required !== false,
                  })),
                } as Block;
              }

              if (b.type === 'slideDeck') {
                return {
                  type: 'slideDeck',
                  theme: b.theme ?? 'default',
                  slides: (b.slides ?? []).map((slide) => ({
                    id: crypto.randomUUID(),
                    title: slide.title ?? '',
                    imageUrl: slide.imageUrl ?? '',
                    audioUrl: slide.audioUrl ?? '',
                    transcript: slide.transcript ?? '',
                    notesHtml: slide.notesHtml ?? '',
                    interactiveCards: (slide.interactiveCards ?? []).map((card) => ({
                      id: crypto.randomUUID(),
                      title: card.title ?? '',
                      teaser: card.teaser ?? '',
                      bodyHtml: card.bodyHtml ?? '',
                      imageUrl: card.imageUrl ?? '',
                      variant: card.variant ?? 'default',
                      hotspotX: Number(card.hotspotX ?? 50),
                      hotspotY: Number(card.hotspotY ?? 50),
                    })),
                  })),
                } as Block;
              }

              if (b.type === 'callout') {
                return {
                  type: 'callout',
                  style: b.style ?? 'info',
                  html: b.html ?? '',
                } as Block;
              }

              if (b.type === 'quiz') {
                return {
                  type: 'quiz',
                  mode: b.mode ?? 'single',
                  question: b.question ?? '',
                  choices: (b.choices ?? []).map((ch) => ({
                    id: crypto.randomUUID(),
                    text: ch.text ?? '',
                    correct: !!ch.correct,
                  })),
                } as Block;
              }

              throw new Error(`Unsupported course block type: ${(b as Block).type}`);
            }),
          })),
        })),
      };

      await this.repo.add(cloned);
    } finally {
      this.duplicatingId = null;
    }
  }

  private serializeBlock(b: BlockForm): Block {
    const t = b.value.type!;

    if (t === 'heading') {
      return {
        type: 'heading',
        level: b.value.level ?? 2,
        text: b.value.text ?? '',
      };
    }

    if (t === 'text') {
      return {
        type: 'text',
        html: b.value.html ?? '',
      };
    }

    if (t === 'image') {
      return {
        type: 'image',
        url: b.value.url ?? '',
        alt: b.value.alt ?? '',
        caption: b.value.caption ?? '',
      };
    }

    if (t === 'audio') {
      return {
        type: 'audio',
        title: b.value.title ?? '',
        url: b.value.url ?? '',
        transcript: b.value.transcript ?? '',
      };
    }

    if (t === 'video') {
      return {
        type: 'video',
        url: b.value.url ?? '',
        transcript: b.value.transcript ?? '',
      };
    }

    if (t === 'hero') {
      return {
        type: 'hero',
        title: b.value.title ?? '',
        bodyHtml: b.value.bodyHtml ?? '',
        imageUrl: b.value.imageUrl ?? '',
        buttonLabel: b.value.buttonLabel ?? 'Continue',
      };
    }

    if (t === 'accordion') {
      return {
        type: 'accordion',
        title: b.value.title ?? '',
        introHtml: b.value.introHtml ?? '',
        items: b.controls.items.controls.map((item) => ({
          id: item.value.id ?? crypto.randomUUID(),
          title: item.value.title ?? '',
          bodyHtml: item.value.bodyHtml ?? '',
          required: item.value.required !== false,
        })),
      };
    }

    if (t === 'cardStack') {
      return {
        type: 'cardStack',
        title: b.value.title ?? '',
        introHtml: b.value.introHtml ?? '',
        variant: b.value.variant ?? 'flip',
        cards: b.controls.cards.controls.map((card) => ({
          id: card.value.id ?? crypto.randomUUID(),
          title: card.value.title ?? '',
          teaser: card.value.teaser ?? '',
          bodyHtml: card.value.bodyHtml ?? '',
          imageUrl: card.value.imageUrl ?? '',
          required: true,
        })),
      };
    }

    if (t === 'quizIntro') {
      return {
        type: 'quizIntro',
        title: b.value.title ?? '',
        bodyHtml: b.value.bodyHtml ?? '',
        buttonLabel: b.value.buttonLabel ?? 'Start quiz',
        passPct: Number(b.value.passPct ?? 80),
      };
    }

    if (t === 'tabs') {
      return {
        type: 'tabs',
        title: b.value.title ?? '',
        introHtml: b.value.introHtml ?? '',
        tabs: b.controls.tabs.controls.map((tab) => ({
          id: tab.value.id ?? crypto.randomUUID(),
          label: tab.value.label ?? '',
          title: tab.value.title ?? '',
          bodyHtml: tab.value.bodyHtml ?? '',
          imageUrl: tab.value.imageUrl ?? '',
          imageAlt: tab.value.imageAlt ?? '',
          required: tab.value.required !== false,
        })),
      };
    }

    if (t === 'slideDeck') {
      return {
        type: 'slideDeck',
        theme: b.value.theme ?? 'default',
        slides: b.controls.slides.controls.map((slide) => ({
          id: slide.value.id ?? crypto.randomUUID(),
          title: slide.value.title ?? '',
          imageUrl: slide.value.imageUrl ?? '',
          audioUrl: slide.value.audioUrl ?? '',
          transcript: slide.value.transcript ?? '',
          notesHtml: slide.value.notesHtml ?? '',
          interactiveCards: slide.controls.interactiveCards.controls.map((card) => ({
            id: card.value.id ?? crypto.randomUUID(),
            title: card.value.title ?? '',
            teaser: card.value.teaser ?? '',
            bodyHtml: card.value.bodyHtml ?? '',
            imageUrl: card.value.imageUrl ?? '',
            variant: card.value.variant ?? 'default',
            hotspotX: Number(card.value.hotspotX ?? 50),
            hotspotY: Number(card.value.hotspotY ?? 50),
          })),
        })),
      };
    }

    if (t === 'callout') {
      return {
        type: 'callout',
        style: b.value.style ?? 'info',
        html: b.value.html ?? '',
      };
    }

    if (t === 'quiz') {
      return {
        type: 'quiz',
        mode: b.value.mode ?? 'single',
        question: b.value.question ?? '',
        choices: b.controls.choices.controls.map((c) => ({
          id: c.value.id!,
          text: c.value.text ?? '',
          correct: !!c.value.correct,
        })),
      };
    }

    throw new Error(`Unsupported course block type: ${t}`);
  }

  private buildSectionsPayload(): Section[] {
    return this.sectionsFA.controls.map<Section>((s, si) => ({
      id: s.value.id!,
      title: s.value.title!,
      order: si,
      lessons: s.controls.lessons.controls.map<Lesson>((l, li) => ({
        id: l.value.id!,
        title: l.value.title!,
        estMin: Number(l.value.estMin ?? 0),
        continueMode: l.value.continueMode ?? 'guided',
        order: li,
        blocks: l.controls.blocks.controls.map<Block>((b) => this.serializeBlock(b)),
      })),
    }));
  }

  private quizValidationErrors(sections: Section[]): string[] {
    const errors: string[] = [];

    sections.forEach((section, sectionIndex) => {
      section.lessons.forEach((lesson, lessonIndex) => {
        lesson.blocks.forEach((block, blockIndex) => {
          if (block.type !== 'quiz') return;

          const choices = (block.choices ?? []).filter(choice => !!choice.text?.trim());
          const correctCount = choices.filter(choice => choice.correct).length;
          const location =
            `${section.title || `Section ${sectionIndex + 1}`} / `
            + `${lesson.title || `Lesson ${lessonIndex + 1}`} / block ${blockIndex + 1}`;

          if (!block.question?.trim()) {
            errors.push(`${location}: question is required.`);
          }
          if (choices.length < 2) {
            errors.push(`${location}: at least two labeled choices are required.`);
          }
          if (correctCount < 1) {
            errors.push(`${location}: select at least one correct answer.`);
          }
          if ((block.mode ?? 'single') === 'single' && correctCount > 1) {
            errors.push(`${location}: a single-choice quiz must have exactly one correct answer.`);
          }
        });
      });
    });

    return errors;
  }

  /* ============================
     Save
  ============================ */

  async save() {
    if (!this.canManageCourses || this.savingCourse) return;
    this.saveError = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError = 'Complete all required course fields before saving.';
      return;
    }

    const sections = this.buildSectionsPayload();
    const quizErrors = this.quizValidationErrors(sections);
    if (quizErrors.length) {
      this.saveError = `Course not saved. ${quizErrors[0]}`;
      return;
    }

    this.savingCourse = true;
    try {
      const payload: Course = {
        title: this.form.value.title!,
        subtitle: this.form.value.subtitle || '',
        description: this.form.value.description || '',
        lang: this.form.value.lang!,
        durationMin: this.form.value.durationMin!,
        ceCredit: Number(this.form.value.ceCredit ?? 0),
        sortOrder: this.safeSortOrder(this.form.value.sortOrder, this.nextSortOrder()),
        active: !!this.form.value.active,
        tags: this.csvToArray(this.form.value.tagsText),
        imageUrl: this.form.value.imageUrl || '',
        kind: this.form.value.kind!,
        url: this.form.value.url || '',
        level: this.form.value.level || 'Beginner',
        type: this.form.value.type!,

        lecturer: this.form.value.lecturer || '',
        disclosures: this.csvToArray(this.form.value.disclosuresText),
        targetAudience: this.csvToArray(this.form.value.targetAudienceText),
        prerequisites: this.csvToArray(this.form.value.prerequisitesText),
        requirements: this.csvToArray(this.form.value.requirementsText),
        accomodations: this.form.value.accomodations || '',
        passingScore: Number(this.form.value.passingScore ?? 80),
        lockedSequence: !!this.form.value.lockedSequence,
        isPublic: !!this.form.value.isPublic,

        sections,
      };

      if (this.editId) {
        await this.repo.update(this.editId, payload);
        this.editId = null;
      } else {
        await this.repo.add(payload);
      }

      this.resetForm();
    } finally {
      this.savingCourse = false;
    }
  }

  async moveCourse(course: Course, direction: -1 | 1): Promise<void> {
    if (!this.canManageCourses || !course.id) return;

    const ordered = [...this.courses()];
    const fromIndex = ordered.findIndex((item) => item.id === course.id);
    const toIndex = fromIndex + direction;

    if (fromIndex < 0 || toIndex < 0 || toIndex >= ordered.length) return;

    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);

    await this.repo.updateCourseSortOrders(
      ordered
        .filter((item): item is Course & { id: string } => !!item.id)
        .map((item, index) => ({
          id: item.id,
          sortOrder: (index + 1) * 10,
        }))
    );
  }

  canMoveCourse(course: Course, direction: -1 | 1): boolean {
    if (!course.id) return false;
    const index = this.courses().findIndex((item) => item.id === course.id);
    const nextIndex = index + direction;
    return index >= 0 && nextIndex >= 0 && nextIndex < this.courses().length;
  }

  trackById = (_: number, c: Course) => c.id ?? c.title;

  open(c: Course) {
    this.router.navigate([
      this.isSuperAdmin ? '/super-admin/courses' : '/manager/courses',
      c.id,
      'extras',
    ]);
  }
}
