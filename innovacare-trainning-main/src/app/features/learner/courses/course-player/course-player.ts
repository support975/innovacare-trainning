import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { Auth, authState } from '@angular/fire/auth';
import { Firestore, doc, docData, collectionData } from '@angular/fire/firestore';

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


type Lang = 'EN' | 'FR' | 'ES';
type BlockType = 'heading' | 'text' | 'image' | 'audio' | 'video' | 'callout' | 'quiz';

interface Block {
  type: BlockType;
  level?: 1 | 2 | 3;
  text?: string;
  html?: string;
  style?: 'info' | 'warn' | 'success';
  url?: string;
  alt?: string;
  caption?: string;
  transcript?: string;
  mode?: 'single' | 'multi' | 'caseStudy';
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
export class CoursePlayer implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private afs = inject(Firestore);
  private auth = inject(Auth);
  private sanitizer = inject(DomSanitizer);

  notice = '';
  busyId: string | null = null;
  activeIndex = 0;
  sidebarOpen = true;

  private sidebarTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly sidebarDelayMs = 5000;

  readonly courseId: string = this.route.snapshot.paramMap.get('id') ?? '';

  private uid$ = authState(this.auth).pipe(map((u) => u?.uid ?? null));

  private quizSel = new Map<string, Set<string>>();
  private quizRes = new Map<string, 'passed' | 'failed'>();
  private quizLock = new Set<string>();

  ngOnInit(): void {
    this.startSidebarAutoClose();
  }

  ngOnDestroy(): void {
    this.clearSidebarTimer();
  }

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

    const correctIds = new Set((block.choices ?? []).filter((c) => c.correct).map((c) => c.id));
    const mode = block.mode ?? 'single';
    const isMulti = mode === 'multi' || mode === 'caseStudy';

    let ok = false;
    if (!isMulti) {
      ok = picked.size === 1 && correctIds.has([...picked][0]);
    } else {
      ok = picked.size === correctIds.size && [...picked].every((id) => correctIds.has(id));
    }

    this.quizRes.set(k, ok ? 'passed' : 'failed');
    if (ok) this.quizLock.add(k);
  }

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

  lessons = toSignal(
    (docData(doc(this.afs, `courses/${this.courseId}`), { idField: 'id' }) as Observable<CourseDoc>).pipe(
      map((c) => {
        const secs = Array.isArray(c?.sections) ? c.sections : [];
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

        if (this.activeIndex >= out.length) {
          this.activeIndex = Math.max(0, out.length - 1);
        }

        return out;
      })
    ),
    { initialValue: [] as FlatLesson[] }
  );

  completedSet = toSignal(
    this.uid$.pipe(
      switchMap((uid) => {
        if (!uid) return of(new Set<string>());
        const q = fsCollection(this.afs as any, `users/${uid}/enrollments/${this.courseId}/completedLessons`);
        return collectionData(q as any, { idField: 'id' }).pipe(
          map((rows: any[]) => new Set<string>(rows.map((r) => String(r.id))))
        );
      })
    ),
    { initialValue: new Set<string>() }
  );

  current(): FlatLesson | null {
    const ls = this.lessons();
    return this.activeIndex >= 0 && this.activeIndex < ls.length ? ls[this.activeIndex] : null;
  }

  
 

  pauseSidebarAutoClose() {
    this.clearSidebarTimer();
  }

 

  onSidebarFocusOut(event: FocusEvent) {
    const host = event.currentTarget as HTMLElement | null;
    const next = event.relatedTarget as Node | null;

    if (host && next && host.contains(next)) return;
    this.resumeSidebarAutoClose();
  }


  private clearSidebarTimer() {
    if (this.sidebarTimer) {
      clearTimeout(this.sidebarTimer);
      this.sidebarTimer = null;
    }
  }

  isVideoBlock(b: Block): boolean {
  return b.type === 'video';
}

videoKind(url?: string): 'youtube' | 'vimeo' | 'file' | 'none' {
  const raw = (url ?? '').trim();
  if (!raw) return 'none';
  if (/(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/i.test(raw)) return 'youtube';
  if (/vimeo\.com\/\d+/i.test(raw)) return 'vimeo';
  return 'file';
}

  isLastLesson(index: number): boolean {
    return index === this.lessons().length - 1;
  }

  endCourse() {
    this.backToCourse();
  }

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
        return b.html ? String(b.html) : b.text ? `<p>${escapeHtml(b.text)}</p>` : '';
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

      case 'video': {
  const rawUrl = (b.url || '').trim();

  const yt =
    rawUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/)?.[1] ??
    rawUrl.match(/youtube\.com\/embed\/([^&?/]+)/)?.[1];

  if (yt) {
    const transcript = b.transcript
      ? `<details><summary>Transcript</summary><pre>${escapeHtml(b.transcript)}</pre></details>`
      : '';
    return `
      <div class="video">
        <div class="video-frame ratio-16x9">
          <iframe
            src="https://www.youtube.com/embed/${escapeAttr(yt)}"
            loading="lazy"
            referrerpolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen>
          </iframe>
        </div>
        ${transcript}
      </div>
    `;
  }

  const vimeo = rawUrl.match(/vimeo\.com\/(\d+)/)?.[1];
  if (vimeo) {
    const transcript = b.transcript
      ? `<details><summary>Transcript</summary><pre>${escapeHtml(b.transcript)}</pre></details>`
      : '';
    return `
      <div class="video">
        <div class="video-frame ratio-16x9">
          <iframe
            src="https://player.vimeo.com/video/${escapeAttr(vimeo)}"
            loading="lazy"
            allow="autoplay; fullscreen; picture-in-picture"
            allowfullscreen>
          </iframe>
        </div>
        ${transcript}
      </div>
    `;
  }

  const src = escapeAttr(rawUrl);
  const transcript = b.transcript
    ? `<details><summary>Transcript</summary><pre>${escapeHtml(b.transcript)}</pre></details>`
    : '';

  return src
    ? `
      <div class="video">
        <video
          controls
          preload="metadata"
          playsinline
          controlsList="nodownload"
          style="max-width:100%;width:100%;border-radius:12px;">
          <source src="${src}">
          Your browser does not support the video tag.
        </video>
        ${transcript}
      </div>
    `
    : transcript;
}

      case 'callout': {
        const cls = `callout ${escapeAttr(b.style || 'info')}`;
        const content = b.html ? String(b.html) : b.text ? `<p>${escapeHtml(b.text)}</p>` : '';
        return `<div class="${cls}">${content}</div>`;
      }

      case 'quiz':
      default:
        return '';
    }
  }

  async completeLesson(lessonId: string): Promise<void> {
    this.notice = '';
    if (!lessonId) return;

    const user = await firstValueFrom(authState(this.auth));
    if (!user) {
      this.notice = 'Please sign in first.';
      return;
    }

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

      const idx = this.lessons().findIndex((l) => l.id === lessonId);
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

  private videoTimes = new Map<string, number>();

videoKey(lessonId: string, bi: number): string {
  return `${lessonId}::video::${bi}`;
}

getVideoUrl(b: Block): string {
  return (b.url ?? '').trim();
}

isYouTubeUrl(url?: string): boolean {
  const raw = (url ?? '').trim();
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/i.test(raw);
}

isVimeoUrl(url?: string): boolean {
  const raw = (url ?? '').trim();
  return /vimeo\.com\/\d+/i.test(raw);
}

isDirectVideoUrl(url?: string): boolean {
  const raw = (url ?? '').trim();
  return !!raw && !this.isYouTubeUrl(raw) && !this.isVimeoUrl(raw);
}

youtubeEmbed(url?: string): string {
  const raw = (url ?? '').trim();
  const id =
    raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/)?.[1] ??
    raw.match(/youtube\.com\/embed\/([^&?/]+)/)?.[1] ??
    '';
  return id ? `https://www.youtube.com/embed/${id}` : '';
}

vimeoEmbed(url?: string): string {
  const raw = (url ?? '').trim();
  const id = raw.match(/vimeo\.com\/(\d+)/)?.[1] ?? '';
  return id ? `https://player.vimeo.com/video/${id}` : '';
}

rememberVideoTime(lessonId: string, bi: number, event: Event): void {
  const el = event.target as HTMLVideoElement | null;
  if (!el) return;
  this.videoTimes.set(this.videoKey(lessonId, bi), el.currentTime || 0);
}

restoreVideoTime(lessonId: string, bi: number, event: Event): void {
  const el = event.target as HTMLVideoElement | null;
  if (!el) return;

  const saved = this.videoTimes.get(this.videoKey(lessonId, bi));
  if (saved == null) return;

  try {
    if (Number.isFinite(saved) && saved > 0 && saved < (el.duration || Number.MAX_SAFE_INTEGER)) {
      el.currentTime = saved;
    }
  } catch {}
}

trackByBlock = (index: number, block: Block) => {
  return `${block.type}-${index}-${block.url ?? block.text ?? block.question ?? ''}`;
};

private isMobileViewport(): boolean {
  return window.innerWidth <= 900;
}

setActive(i: number) {
  if (i >= 0 && i < this.lessons().length) {
    this.activeIndex = i;
    this.notice = '';

    // Close only on mobile after selecting a lesson
    if (this.isMobileViewport()) {
      this.sidebarOpen = false;
      this.clearSidebarTimer();
    }
  }
}

toggleSidebar() {
  this.sidebarOpen = !this.sidebarOpen;

  if (this.sidebarOpen) {
    this.startSidebarAutoClose();
  } else {
    this.clearSidebarTimer();
  }
}

resumeSidebarAutoClose() {
  if (!this.sidebarOpen) return;
  this.startSidebarAutoClose();
}

private startSidebarAutoClose() {
  this.clearSidebarTimer();

  // Do NOT auto-close on desktop
  if (!this.sidebarOpen || !this.isMobileViewport()) return;

  this.sidebarTimer = setTimeout(() => {
    this.sidebarOpen = false;
    this.sidebarTimer = null;
  }, this.sidebarDelayMs);
}
}

function escapeHtml(s: string): string {
  return (s ?? '').replace(
    /[&<>"']/g,
    (ch) =>
      (
        {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        } as any
      )[ch] || ch
  );
}


function escapeAttr(s: string): string {
  return (s ?? '').replace(/"/g, '&quot;');
}