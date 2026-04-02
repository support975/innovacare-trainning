import { Component, inject } from '@angular/core';
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
import { Router } from '@angular/router';

import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/* ---------------------------
   Typed form helpers
---------------------------- */

type ChoiceForm = FormGroup<{
  id: FormControl<string>;
  text: FormControl<string>;
  correct: FormControl<boolean>;
}>;

type BlockForm = FormGroup<{
  type: FormControl<Block['type']>;
  level: FormControl<1 | 2 | 3>;
  text: FormControl<string>;
  html: FormControl<string>;
  url: FormControl<string>;
  alt: FormControl<string>;
  caption: FormControl<string>;
  transcript: FormControl<string>;
  style: FormControl<'info' | 'warn' | 'success'>;
  mode: FormControl<'single' | 'multi' | 'caseStudy'>;
  question: FormControl<string>;
  choices: FormArray<ChoiceForm>;
}>;

type LessonForm = FormGroup<{
  id: FormControl<string>;
  title: FormControl<string>;
  estMin: FormControl<number>;
  blocks: FormArray<BlockForm>;
}>;

type SectionForm = FormGroup<{
  id: FormControl<string>;
  title: FormControl<string>;
  lessons: FormArray<LessonForm>;
  url: FormControl<string>;
}>;

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
  private sanitizer = inject(DomSanitizer);

  editId: string | null = null;
  loadingEdit = false;
  duplicatingId: string | null = null;

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

  courses = this.repo.all();

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

  private newBlock(kind: Block['type'] = 'text'): BlockForm {
    return this.fb.group({
      type: this.fb.control<Block['type']>(kind),
      level: this.fb.control<1 | 2 | 3>(2),
      text: this.fb.control<string>(''),
      html: this.fb.control<string>(''),
      url: this.fb.control<string>(''),
      alt: this.fb.control<string>(''),
      caption: this.fb.control<string>(''),
      transcript: this.fb.control<string>(''),
      style: this.fb.control<'info' | 'warn' | 'success'>('info'),
      mode: this.fb.control<'single' | 'multi' | 'caseStudy'>('single'),
      question: this.fb.control<string>(''),
      choices: this.fb.array<ChoiceForm>([
        this.newChoice('Option A'),
        this.newChoice('Option B'),
        this.newChoice('Option C'),
      ]),
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

  removeChoice(si: number, li: number, bi: number, ci: number) {
    const blk = this.blocksFA(si, li).at(bi);
    blk.controls.choices.removeAt(ci);
  }

  onBlockTypeChange(_b: BlockForm) {
    // no-op for now
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
    const id = c.id;
    if (!id) return;

    this.loadingEdit = true;
    try {
      const full = await this.repo.load(id);
      const data = full ?? c;

      this.editId = id;

      this.form.patchValue({
        title: data.title ?? '',
        subtitle: data.subtitle ?? '',
        description: data.description ?? '',
        lang: data.lang ?? 'EN',
        durationMin: Number(data.durationMin ?? 60),
        ceCredit: Number(data.ceCredit ?? 0),
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
                    level: (b.level ?? 2) as 1 | 2 | 3,
                    text: b.text ?? '',
                  });
                } else if (b.type === 'text') {
                  bfg.patchValue({ html: b.html ?? '' });
                } else if (b.type === 'image') {
                  bfg.patchValue({
                    url: b.url ?? '',
                    alt: b.alt ?? '',
                    caption: b.caption ?? '',
                  });
                } else if (b.type === 'audio') {
                  bfg.patchValue({
                    url: b.url ?? '',
                    transcript: b.transcript ?? '',
                  });
                } else if (b.type === 'video') {
                  bfg.patchValue({
                    url: b.url ?? '',
                    transcript: b.transcript ?? '',
                  });
                } else if (b.type === 'callout') {
                  bfg.patchValue({
                    style: (b.style ?? 'info') as 'info' | 'warn' | 'success',
                    html: b.html ?? '',
                  });
                } else if (b.type === 'quiz') {
                  bfg.patchValue({
                    mode: (b.mode ?? 'single') as 'single' | 'multi' | 'caseStudy',
                    question: b.question ?? '',
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

      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {}
    } finally {
      this.loadingEdit = false;
    }
  }

  cancelEdit() {
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
    this.sectionsFA.clear();
  }

  /* ============================
     Duplicate
  ============================ */

  async duplicateCourse(c: Course) {
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

              if (b.type === 'callout') {
                return {
                  type: 'callout',
                  style: b.style ?? 'info',
                  html: b.html ?? '',
                } as Block;
              }

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
            }),
          })),
        })),
      };

      await this.repo.add(cloned);
    } finally {
      this.duplicatingId = null;
    }
  }

  /* ============================
     Save
  ============================ */

  async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload: Course = {
      title: this.form.value.title!,
      subtitle: this.form.value.subtitle || '',
      description: this.form.value.description || '',
      lang: this.form.value.lang!,
      durationMin: this.form.value.durationMin!,
      ceCredit: Number(this.form.value.ceCredit ?? 0),
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

      sections: this.sectionsFA.controls.map<Section>((s, si) => ({
        id: s.value.id!,
        title: s.value.title!,
        order: si,

        lessons: s.controls.lessons.controls.map<Lesson>((l, li) => ({
          id: l.value.id!,
          title: l.value.title!,
          estMin: Number(l.value.estMin ?? 0),
          order: li,

          blocks: l.controls.blocks.controls.map<Block>((b) => {
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

            if (t === 'callout') {
              return {
                type: 'callout',
                style: b.value.style ?? 'info',
                html: b.value.html ?? '',
              };
            }

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
          }),
        })),
      })),
    };

    if (this.editId) {
      await this.repo.update(this.editId, payload);
      this.editId = null;
    } else {
      await this.repo.add(payload);
    }

    this.resetForm();
  }

  trackById = (_: number, c: Course) => c.id ?? c.title;

  open(c: Course) {
    this.router.navigate(['/manager/courses', c.id, 'extras']);
  }
}