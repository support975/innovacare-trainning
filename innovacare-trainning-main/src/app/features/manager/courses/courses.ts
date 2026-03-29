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

import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/* ---------------------------
   Typed form helpers
---------------------------- */

type BlockForm = FormGroup<{
  type: FormControl<Block['type']>;
  // heading
  level: FormControl<1 | 2 | 3>;
  text: FormControl<string>;
  // text
  html: FormControl<string>;
  // image
  url: FormControl<string>;
  alt: FormControl<string>;
  caption: FormControl<string>;
  // audio
  transcript: FormControl<string>;
  // callout
  style: FormControl<'info' | 'warn' | 'success'>;
  // quiz
  mode: FormControl<'single' | 'multi'>;
  question: FormControl<string>;
  choices: FormArray<FormGroup<{
    id: FormControl<string>;
    text: FormControl<string>;
    correct: FormControl<boolean>;
  }>>;
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
  private fb = inject(FormBuilder).nonNullable;   // non-nullable controls
  private repo = inject(CoursesRepo);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);

  /** EDIT MODE */
  editId: string | null = null;
  loadingEdit = false;

  /** DUPLICATE busy id */
  duplicatingId: string | null = null;

  // -------- Root form (full Course) --------
  form = this.fb.group({
    title: this.fb.control<string>('', { validators: [Validators.required, Validators.minLength(3)] }),
    subtitle: this.fb.control<string>(''),
    description: this.fb.control<string>(''),
    lang: this.fb.control<'EN' | 'FR' | 'ES'>('EN', { validators: [Validators.required] }),
    durationMin: this.fb.control<number>(60, { validators: [Validators.required, Validators.min(1)] }),
    ceCredit: this.fb.control<number>(0, { validators: [Validators.min(0)] }),
    active: this.fb.control<boolean>(true),
    kind: this.fb.control<Course['kind']>('Course', { validators: [Validators.required] }),
    imageUrl: this.fb.control<string>(''),
    // Comma-separated entry for UX; split into array on save
    tagsText: this.fb.control<string>(''),
    sections: this.fb.array<SectionForm>([]),
  });

  // convenience getters
  get sectionsFA() { return this.form.controls.sections; }

  // -------- Live list from Firestore --------
  courses = this.repo.all(); // Signal<Course[]>

  /* ============================
     Builders
  ============================ */

  private newChoice(text = '', correct = false) {
    return this.fb.group({
      id: this.fb.control<string>(crypto.randomUUID()),
      text: this.fb.control<string>(text),
      correct: this.fb.control<boolean>(correct),
    });
  }

  private newBlock(kind: Block['type'] = 'text'): BlockForm {
    return this.fb.group({
      type: this.fb.control<Block['type']>(kind),
      level: this.fb.control<1|2|3>(2),                 // heading
      text: this.fb.control<string>(''),                // heading
      html: this.fb.control<string>(''),                // text/callout
      url: this.fb.control<string>(''),                 // image/audio
      alt: this.fb.control<string>(''),
      caption: this.fb.control<string>(''),
      transcript: this.fb.control<string>(''),
      style: this.fb.control<'info'|'warn'|'success'>('info'),
      mode: this.fb.control<'single'|'multi'>('single'),
      question: this.fb.control<string>(''),
      choices: this.fb.array([
        this.newChoice('Option A'),
        this.newChoice('Option B'),
        this.newChoice('Option C'),
      ]),
    });
  }

  private newLesson(): LessonForm {
    return this.fb.group({
      id: this.fb.control<string>(crypto.randomUUID()),
      title: this.fb.control<string>('New lesson', { validators: [Validators.required] }),
      estMin: this.fb.control<number>(5, { validators: [Validators.min(0)] }),
      blocks: this.fb.array<BlockForm>([this.newBlock('heading'), this.newBlock('text')]),
    });
  }

  private newSection(): SectionForm {
    return this.fb.group({
      id: this.fb.control<string>(crypto.randomUUID()),
      title: this.fb.control<string>('New section', { validators: [Validators.required] }),
      lessons: this.fb.array<LessonForm>([this.newLesson()]),
      url: this.fb.control<string>(''),
    });
  }

  /* ============================
     Section ops
  ============================ */
  addSection() { this.sectionsFA.push(this.newSection()); }
  removeSection(i: number) { this.sectionsFA.removeAt(i); }

  sectionAt(i: number) { return this.sectionsFA.at(i); }
  lessonsFA(i: number) { return this.sectionAt(i).controls.lessons; }

  addLesson(si: number) { this.lessonsFA(si).push(this.newLesson()); }
  removeLesson(si: number, li: number) { this.lessonsFA(si).removeAt(li); }

  lessonAt(si: number, li: number) { return this.lessonsFA(si).at(li); }
  blocksFA(si: number, li: number) { return this.lessonAt(si, li).controls.blocks; }

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
    // keep form intact; renderer will only use relevant fields
  }

  /* ============================
     Live preview (Text / Callout)
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
      return this.sanitizer.bypassSecurityTrustHtml(
        url ? `<figure><img src="${url}" alt="${alt}"/><figcaption>${this.escapeHtml(b.value.caption ?? '')}</figcaption></figure>` : ''
      );
    }
    if (t === 'quiz') {
      const q = this.escapeHtml(b.value.question ?? '');
      const items = (b.controls.choices.controls ?? []).map(c => `<li>${this.escapeHtml(c.value.text ?? '')}</li>`).join('');
      return this.sanitizer.bypassSecurityTrustHtml(`<strong>${q}</strong><ul>${items}</ul>`);
    }
    return this.sanitizer.bypassSecurityTrustHtml('');
  }

  private escapeHtml(s: string) {
    return s.replace(/[&<>"']/g, ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[ch] || ch
    );
  }

  private escapeAttr(s: string) {
    return (s ?? '').replace(/"/g, '&quot;');
  }

  /* ============================
     Drag & Drop (reorder FormArrays)
  ============================ */

  private moveInFA(fa: FormArray, prev: number, curr: number) {
    if (prev === curr) return;
  
    const ctrl = fa.at(prev);
    if (!ctrl) return;
  
    // remove first, then insert at new position
    fa.removeAt(prev);
    fa.insert(curr, ctrl);
  }
  

  dropSections(ev: CdkDragDrop<any[]>) {
    this.moveInFA(this.sectionsFA, ev.previousIndex, ev.currentIndex);
  }

  dropLessons(si: number, ev: CdkDragDrop<any[]>) {
    const fa = this.lessonsFA(si) as any;
    this.moveInFA(fa, ev.previousIndex, ev.currentIndex);
  }

  dropBlocks(si: number, li: number, ev: CdkDragDrop<any[]>) {
    const fa = this.blocksFA(si, li) as any;
    this.moveInFA(fa, ev.previousIndex, ev.currentIndex);
  }

  /* ============================
     EDIT (Load existing course into same form)
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
        imageUrl: data.imageUrl ?? '',
        tagsText: (data.tags ?? []).join(', '),
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
          url: (s as any).url ?? '',
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
                  bfg.patchValue({ level: (b.level ?? 2) as any, text: b.text ?? '' });
                } else if (b.type === 'text') {
                  bfg.patchValue({ html: b.html ?? '' });
                } else if (b.type === 'image') {
                  bfg.patchValue({ url: b.url ?? '', alt: b.alt ?? '', caption: b.caption ?? '' });
                } else if (b.type === 'audio') {
                  bfg.patchValue({ url: (b as any).url ?? '', transcript: b.transcript ?? '' });
                } else if (b.type === 'callout') {
                  bfg.patchValue({ style: (b.style ?? 'info') as any, html: b.html ?? '' });
                } else if (b.type === 'quiz') {
                  bfg.patchValue({
                    mode: (b.mode ?? 'single') as any,
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

      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
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
      imageUrl: '',
      tagsText: '',
    });
    this.sectionsFA.clear();
  }

  /* ============================
     Duplicate Course (deep clone with new UUIDs)
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
        active: false, // best practice: copy starts inactive
        tags: Array.isArray(src.tags) ? [...src.tags] : [],
        imageUrl: src.imageUrl ?? '',
        kind: src.kind ?? 'Course',
        url: src.url ?? '',
        sections: (src.sections ?? []).map((s) => ({
          id: crypto.randomUUID(),
          title: s.title ?? '',
          lessons: (s.lessons ?? []).map((l) => ({
            id: crypto.randomUUID(),
            title: l.title ?? '',
            estMin: Number(l.estMin ?? 0),
            blocks: (l.blocks ?? []).map((b) => {
              if (b.type === 'heading') {
                return { type: 'heading', level: b.level ?? 2, text: b.text ?? '' } as Block;
              }
              if (b.type === 'text') {
                return { type: 'text', html: b.html ?? '' } as Block;
              }
              if (b.type === 'image') {
                return { type: 'image', url: b.url ?? '', alt: b.alt ?? '', caption: b.caption ?? '' } as Block;
              }
              if (b.type === 'audio') {
                return { type: 'audio', url: (b as any).url ?? '', transcript: b.transcript ?? '' } as Block;
              }
              if (b.type === 'callout') {
                return { type: 'callout', style: b.style ?? 'info', html: b.html ?? '' } as Block;
              }
              // quiz
              return {
                type: 'quiz',
                mode: b.mode ?? 'single',
                question: b.question ?? '',
                choices: (b.choices ?? []).map(ch => ({
                  id: crypto.randomUUID(),
                  text: ch.text ?? '',
                  correct: !!ch.correct
                }))
              } as Block;
            })
          }))
        }))
      };

      await this.repo.add(cloned);
    } finally {
      this.duplicatingId = null;
    }
  }

  /* ============================
     Save (Create or Update)
  ============================ */
  async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const tags = this.form.value.tagsText
      ?.split(',')
      .map(t => t.trim())
      .filter(Boolean) ?? [];

    const payload: Course = {
      title: this.form.value.title!,
      subtitle: this.form.value.subtitle || '',
      description: this.form.value.description || '',
      lang: this.form.value.lang!,
      durationMin: this.form.value.durationMin!,
      ceCredit: Number(this.form.value.ceCredit ?? 0),
      active: !!this.form.value.active,
      tags,
      imageUrl: this.form.value.imageUrl || '',
      kind: this.form.value.kind!,
      sections: this.sectionsFA.controls.map<Section>(s => ({
        id: s.value.id!,
        title: s.value.title!,
        lessons: s.controls.lessons.controls.map<Lesson>(l => ({
          id: l.value.id!,
          title: l.value.title!,
          estMin: Number(l.value.estMin ?? 0),
          blocks: l.controls.blocks.controls.map<Block>(b => {
            const t = b.value.type!;
            if (t === 'heading') {
              return { type: 'heading', level: b.value.level ?? 2, text: b.value.text ?? '' };
            }
            if (t === 'text') {
              return { type: 'text', html: b.value.html ?? '' };
            }
            if (t === 'image') {
              return { type: 'image', url: b.value.url ?? '', alt: b.value.alt ?? '', caption: b.value.caption ?? '' };
            }
            if (t === 'audio') {
              return { type: 'audio', url: b.value.url ?? '', transcript: b.value.transcript ?? '' };
            }
            if (t === 'callout') {
              return { type: 'callout', style: b.value.style ?? 'info', html: b.value.html ?? '' };
            }
            return {
              type: 'quiz',
              mode: b.value.mode ?? 'single',
              question: b.value.question ?? '',
              choices: b.controls.choices.controls.map(c => ({
                id: c.value.id!, text: c.value.text ?? '', correct: !!c.value.correct
              })),
            };
          })
        }))
      })),
      url: ''
    };

    if (this.editId) {
      await this.repo.update(this.editId, payload);
      this.editId = null;
    } else {
      await this.repo.add(payload as any);
    }

    this.resetForm();
  }

  trackById = (_: number, c: Course) => c.id ?? c.title;
  open(c: Course) { this.router.navigate(['/manager/courses', c.id, 'extras']); }
}
