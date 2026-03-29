// course-player.ts (KEEP PREVIEW + ADD INTERACTIVE QUIZ) — COPY/PASTE
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { Auth, authState } from '@angular/fire/auth';
import { Firestore, doc, docData, collection, collectionData } from '@angular/fire/firestore';

import {
  doc as fsDoc,
  setDoc,
  getDoc,
  getCountFromServer,
  serverTimestamp,
  collection as fsCollection,
} from 'firebase/firestore';

import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, firstValueFrom, map, of, switchMap } from 'rxjs';

import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/** Course shape (minimal for the player) */
type Lang = 'EN' | 'FR' | 'ES';
type BlockType = 'heading' | 'text' | 'image' | 'audio' | 'callout' | 'quiz';

interface Block {
  type: BlockType;

  // heading
  level?: 1 | 2 | 3;
  text?: string;

  // text / callout
  html?: string;
  style?: 'info' | 'warn' | 'success';

  // image
  url?: string;
  alt?: string;
  caption?: string;

  // audio
  transcript?: string;

  // quiz (interactive here)
  mode?: 'single' | 'multi';
  question?: string;
  choices?: Array<{ id: string; text: string; correct: boolean }>;
}

interface Lesson {
  id: string;
  title: string;
  estMin?: number;
  blocks: Block[];
}

interface Section {
  id: string;
  title: string;
  lessons: Lesson[];
  url?: string;
}

interface CourseDoc {
  id?: string;
  title: string;
  subtitle?: string;
  description?: string;
  lang: Lang;
  durationMin: number;
  ceCredit?: number;
  active: boolean;
  kind: 'Course' | 'Text' | 'Module';
  imageUrl?: string;
  tags?: string[];
  url?: string;
  sections?: Section[];
}

interface FlatLesson {
  id: string;
  title: string;
  estMin?: number;
  sectionId: string;
  sectionTitle: string;
  index: number;
  blocks: Block[];
}

@Component({
  selector: 'app-course-player',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './course-player.html',
  styleUrls: ['./course-player.css'],
})
export class CoursePlayer {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private afs = inject(Firestore);
  private auth = inject(Auth);
  private sanitizer = inject(DomSanitizer);

  notice = '';
  busyId: string | null = null;
  activeIndex = 0;

  /** Sidebar open/close for responsive drawer */
  sidebarOpen = true;

  readonly courseId: string = this.route.snapshot.paramMap.get('id') ?? '';

  private uid$ = authState(this.auth).pipe(map(u => u?.uid ?? null));

  /** -----------------------------
   *  QUIZ (LOCAL UI STATE ONLY)
   *  - selections + result per quiz block
   *  - keyed by lessonId + blockIndex
   *  ----------------------------- */
  private quizSel = new Map<string, Set<string>>();                 // key -> selected choice ids
  private quizRes = new Map<string, 'passed' | 'failed'>();         // key -> status
  private quizLock = new Set<string>();                              // key -> locked after passed (optional)

  private qKey(lessonId: string, bi: number): string {
    return `${lessonId}::${bi}`;
  }

  isQuizLocked(lessonId: string, bi: number): boolean {
    return this.quizLock.has(this.qKey(lessonId, bi));
  }

  quizStatus(lessonId: string, bi: number): 'passed' | 'failed' | '' {
    return this.quizRes.get(this.qKey(lessonId, bi)) ?? '';
  }

  isSelected(lessonId: string, bi: number, choiceId: string): boolean {
    return this.quizSel.get(this.qKey(lessonId, bi))?.has(choiceId) ?? false;
  }

  selectSingle(lessonId: string, bi: number, choiceId: string) {
    const k = this.qKey(lessonId, bi);
    this.quizSel.set(k, new Set([choiceId]));
    this.quizRes.delete(k);
  }

  toggleMulti(lessonId: string, bi: number, choiceId: string) {
    const k = this.qKey(lessonId, bi);
    const set = new Set(this.quizSel.get(k) ?? []);
    if (set.has(choiceId)) set.delete(choiceId);
    else set.add(choiceId);
    this.quizSel.set(k, set);
    this.quizRes.delete(k);
  }

  submitQuiz(lessonId: string, bi: number, block: Block) {
    const k = this.qKey(lessonId, bi);
    const picked = this.quizSel.get(k) ?? new Set<string>();

    const correctIds = new Set((block.choices ?? []).filter(c => c.correct).map(c => c.id));
    const mode = block.mode ?? 'single';
    const isMulti = mode === 'multi';

    let ok = false;
    if (!isMulti) {
      ok = picked.size === 1 && correctIds.has([...picked][0]);
    } else {
      ok = picked.size === correctIds.size && [...picked].every(id => correctIds.has(id));
    }

    this.quizRes.set(k, ok ? 'passed' : 'failed');

    // optional lock after pass
    if (ok) this.quizLock.add(k);
  }

  /** Load course doc */
  course = toSignal(
    docData(doc(this.afs, `courses/${this.courseId}`), { idField: 'id' }) as Observable<CourseDoc>,
    {
      initialValue: {
        id: this.courseId,
        title: '',
        subtitle: '',
        description: '',
        lang: 'EN',
        durationMin: 0,
        active: true,
        kind: 'Course',
        imageUrl: '',
        tags: [],
        url: '',
        sections: [],
      } satisfies CourseDoc,
    }
  );

  /** Flatten sections[].lessons[] -> FlatLesson[] */
  lessons = toSignal(
    (docData(doc(this.afs, `courses/${this.courseId}`), { idField: 'id' }) as Observable<CourseDoc>).pipe(
      map((c) => {
        const secs = Array.isArray(c?.sections) ? c.sections! : [];
        const out: FlatLesson[] = [];

        secs.forEach((s) => {
          const ls = Array.isArray(s.lessons) ? s.lessons : [];
          ls.forEach((l) => {
            out.push({
              id: String(l.id),
              title: l.title || 'Lesson',
              estMin: l.estMin,
              sectionId: s.id,
              sectionTitle: s.title,
              index: out.length,
              blocks: Array.isArray(l.blocks) ? l.blocks : [],
            });
          });
        });

        if (this.activeIndex >= out.length) this.activeIndex = Math.max(0, out.length - 1);
        return out;
      })
    ),
    { initialValue: [] as FlatLesson[] }
  );

  /** Completed lessons set */
  completedSet = toSignal(
    this.uid$.pipe(
      switchMap(uid => {
        if (!uid) return of(new Set<string>());
        const q = collection(this.afs, `users/${uid}/enrollments/${this.courseId}/completedLessons`);
        return collectionData(q, { idField: 'id' }).pipe(
          map((rows: any[]) => new Set<string>(rows.map(r => String(r.id))))
        );
      })
    ),
    { initialValue: new Set<string>() }
  );

  /** Current lesson */
  current(): FlatLesson | null {
    const ls = this.lessons();
    return (this.activeIndex >= 0 && this.activeIndex < ls.length) ? ls[this.activeIndex] : null;
  }

  setActive(i: number) {
    if (i >= 0 && i < this.lessons().length) {
      this.activeIndex = i;
      this.notice = '';
      // IMPORTANT: do not clear quiz states globally; keep them per block.
      // If you want reset per lesson when switching, uncomment:
      // this.clearQuizStateForLesson(this.current()?.id ?? '');
    }
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  isLastLesson(index: number): boolean {
    return index === this.lessons().length - 1;
  }

  endCourse() {
    this.backToCourse();
  }

  /**
   * ✅ Render block as SafeHtml (same strategy as Manager preview)
   * We SKIP quiz here; quiz is interactive in template.
   */
  blockHtml(b: Block): SafeHtml {
    const html = this.renderBlockToHtmlString(b);
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private renderBlockToHtmlString(b: Block): string {
    switch (b.type) {
      case 'heading': {
        const lv = Math.min(3, Math.max(1, Number(b.level ?? 2))) as 1 | 2 | 3;
        const tag = `h${lv}`;
        return `<${tag}>${escapeHtml(b.text || '')}</${tag}>`;
      }

      case 'text': {
        return b.html ? String(b.html) : (b.text ? `<p>${escapeHtml(b.text)}</p>` : '');
      }

      case 'image': {
        const url = escapeAttr(b.url || '');
        const alt = escapeAttr(b.alt || '');
        const cap = b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : '';
        return url ? `<figure><img src="${url}" alt="${alt}" />${cap}</figure>` : '';
      }

      case 'audio': {
        const url = escapeAttr(b.url || '');
        const tr = b.transcript
          ? `<details><summary>Transcript</summary><pre>${escapeHtml(b.transcript)}</pre></details>`
          : '';
        return url ? `<div class="audio"><audio controls src="${url}"></audio>${tr}</div>` : tr;
      }

      case 'callout': {
        const cls = `callout ${escapeAttr(b.style || 'info')}`;
        const content = b.html ? String(b.html) : (b.text ? `<p>${escapeHtml(b.text)}</p>` : '');
        return `<div class="${cls}">${content}</div>`;
      }

      // ✅ IMPORTANT: quiz is interactive in HTML template
      case 'quiz':
      default:
        return '';
    }
  }

  async completeLesson(lessonId: string): Promise<void> {
    this.notice = '';
    if (!lessonId) return;

    const user = await firstValueFrom(authState(this.auth));
    if (!user) { this.notice = 'Please sign in first.'; return; }

    this.busyId = lessonId;
    try {
      const uid = user.uid;

      const compRef = fsDoc(
        this.afs as any,
        `users/${uid}/enrollments/${this.courseId}/completedLessons/${lessonId}`
      );
      const compSnap = await getDoc(compRef);
      if (!compSnap.exists()) {
        await setDoc(compRef, { doneAt: serverTimestamp() });
      }

      const total = this.lessons().length;
      const completedSnap = await getCountFromServer(
        fsCollection(this.afs as any, `users/${uid}/enrollments/${this.courseId}/completedLessons`)
      );
      const done = completedSnap.data().count || 0;
      const progress = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

      const enrRef = fsDoc(this.afs as any, `users/${uid}/enrollments/${this.courseId}`);
      await setDoc(
        enrRef,
        {
          status: progress === 100 ? 'completed' : 'started',
          progress,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const idx = this.lessons().findIndex(l => l.id === lessonId);
      this.next(idx);
    } catch (e: any) {
      console.error('completeLesson failed:', e);
      this.notice = e?.message || 'Failed to complete lesson.';
    } finally {
      this.busyId = null;
    }
  }

  next(currentIndex: number): void {
    const total = this.lessons().length;
    if (total === 0) {
      this.notice = 'No lessons available.';
      return;
    }

    if (currentIndex < total - 1) {
      this.setActive(currentIndex + 1);
      this.notice = `Moved to lesson ${currentIndex + 2} / ${total}.`;
      return;
    }

    this.notice = 'You reached the last lesson.';
  }

  backToCourse() {
    this.router.navigate(['/learner/courses', this.courseId]);
  }
}

function escapeHtml(s: string): string {
  return (s ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[ch] || ch
  );
}

function escapeAttr(s: string): string {
  return (s ?? '').replace(/"/g, '&quot;');
}
