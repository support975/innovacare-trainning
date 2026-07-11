import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, effect, inject } from '@angular/core';
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

import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import { BreakpointObserver } from '@angular/cdk/layout';
import { AppLanguage, LanguageService } from '../../../../shared/services/language';
import {
  canAccessCourseByEmail,
  hasCourseEmailDomainRestriction,
  normalizedAllowedEmailDomains,
} from '../../../../shared/course-domain-access';


type Lang = 'EN' | 'FR' | 'ES';
type BlockType = 'heading' | 'text' | 'image' | 'audio' | 'video' | 'hero' | 'accordion' | 'tabs' | 'cardStack' | 'quizIntro' | 'slideDeck' | 'callout' | 'quiz';

interface AccordionItem {
  id: string;
  title: string;
  bodyHtml?: string;
  bodyText?: string;
  bulletsText?: string;
  html?: string;
  text?: string;
  body?: string | { html?: string; text?: string };
  content?: string | { html?: string; text?: string };
  required?: boolean;
}

interface CardStackCard {
  id: string;
  title: string;
  teaser?: string;
  bodyHtml: string;
  imageUrl?: string;
  required?: boolean;
}

interface TabItem {
  id: string;
  label: string;
  title?: string;
  bodyHtml: string;
  imageUrl?: string;
  imageAlt?: string;
  required?: boolean;
}

interface SlideDeckSlide {
  id: string;
  title?: string;
  imageUrl: string;
  audioUrl?: string;
  transcript?: string;
  notesHtml?: string;
  interactiveCards?: Array<{
    id: string;
    title: string;
    teaser?: string;
    bodyHtml: string;
    imageUrl?: string;
    variant?: 'default' | 'flip' | 'hotspot' | 'sequence';
    hotspotX?: number;
    hotspotY?: number;
  }>;
}

interface Block {
  type: BlockType;
  level?: 1 | 2 | 3;
  title?: string;
  text?: string;
  html?: string;
  bodyHtml?: string;
  introHtml?: string;
  style?: 'info' | 'warn' | 'success';
  url?: string;
  imageUrl?: string;
  alt?: string;
  caption?: string;
  transcript?: string;
  buttonLabel?: string;
  passPct?: number;
  variant?: 'flip' | 'gated';
  items?: AccordionItem[];
  cards?: CardStackCard[];
  theme?: 'default' | 'focus';
  slides?: SlideDeckSlide[];
  mode?: 'single' | 'multi' | 'caseStudy';
  question?: string;
  choices?: Array<{ id: string; text: string; correct: boolean }>;
  tabs?: TabItem[];
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
  allowedEmailDomains?: string[];
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

interface SlideDeckProgressEntry {
  currentIndex?: number;
  visited?: number[];
  revealedCardIds?: string[];
}

interface EnrollmentDoc {
  slideDeckProgress?: Record<string, SlideDeckProgressEntry>;
}

@Component({
  selector: 'app-course-player',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './course-player.html',
  styleUrls: ['./course-player.css'],
})
export class CoursePlayer implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('viewerBodyHost') viewerBodyRef?: ElementRef<HTMLElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private afs = inject(Firestore);
  private auth = inject(Auth);
  private sanitizer = inject(DomSanitizer);
  private breakpointObserver = inject(BreakpointObserver);
  private languageService = inject(LanguageService);

  notice = '';
  busyId: string | null = null;
  activeIndex = 0;
  sidebarOpen = true;
  readonly languageCode = this.languageService.language;

  private sidebarTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly sidebarDelayMs = 5000;

  readonly courseId: string = this.route.snapshot.paramMap.get('id') ?? '';

  private uid$ = authState(this.auth).pipe(map((u) => u?.uid ?? null));
  private currentUser = toSignal(authState(this.auth), { initialValue: undefined as any });

  private quizSel = new Map<string, Set<string>>();
  private quizRes = new Map<string, 'passed' | 'failed'>();
  private quizLock = new Set<string>();
  private slideDeckIndexes = new Map<string, number>();
  private slideDeckVisited = new Map<string, Set<number>>();
  private slideDeckRevealedCards = new Map<string, Set<string>>();
  private cardStackRevealed = new Map<string, Set<string>>();
  private accordionSeen = new Map<string, Set<string>>();
  private tabSeen = new Map<string, Set<string>>();
  private activeTabs = new Map<string, string>();
  private trustedVideoEmbeds = new Map<string, SafeResourceUrl>();
  private trustedHtmlCache = new Map<string, SafeHtml>();
  private htmlInteractionRequired = new Map<string, string[]>();
  private htmlInteractionSeen = new Map<string, Set<string>>();

  private readonly enrollment = toSignal(
    this.uid$.pipe(
      switchMap((uid) => {
        if (!uid) return of(null);
        return docData(doc(this.afs, `users/${uid}/enrollments/${this.courseId}`)) as Observable<EnrollmentDoc | null>;
      })
    ),
    { initialValue: null as EnrollmentDoc | null }
  );

  private readonly syncSlideDeckProgress = effect(() => {
    this.hydrateSlideDeckProgress(this.enrollment()?.slideDeckProgress ?? null);
  });

  ngOnInit(): void {
    this.startSidebarAutoClose();
  }

  ngAfterViewInit(): void {
    this.scheduleLessonInteractionScan();
  }

  ngOnDestroy(): void {
    this.clearSidebarTimer();
  }

  private qKey(lessonId: string, bi: number): string {
    return `${lessonId}::${bi}`;
  }

  setLanguage(language: AppLanguage): void {
    this.languageService.setLanguage(language);
  }

  domainAccessPending(): boolean {
    return hasCourseEmailDomainRestriction(this.course()) && this.currentUser() === undefined;
  }

  domainAccessDenied(): boolean {
    const user = this.currentUser();
    if (user === undefined) return false;
    return !canAccessCourseByEmail(this.course(), user?.email ?? '');
  }

  allowedDomainLabel(): string {
    return normalizedAllowedEmailDomains(this.course()).join(', ');
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.languageService.t(key, params);
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
    if (!this.isValidQuiz(block)) {
      this.notice = this.t('player.incompleteQuiz');
      return;
    }

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

  isValidQuiz(block: Block): boolean {
    if (block.type !== 'quiz' || !block.question?.trim()) return false;

    const choices = (block.choices ?? []).filter(
      choice => !!choice?.id && !!choice.text?.trim()
    );
    const correctCount = choices.filter(choice => choice.correct).length;
    const mode = block.mode ?? 'single';

    if (choices.length < 2 || correctCount < 1) return false;
    return mode === 'single' ? correctCount === 1 : correctCount < choices.length;
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
        allowedEmailDomains: [],
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
              title: l.title || this.t('player.courseFallback'),
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

  groupedLessons() {
    const groups: Array<{ id: string; title: string; lessons: FlatLesson[] }> = [];
    for (const lesson of this.lessons()) {
      const currentGroup = groups[groups.length - 1];
      if (!currentGroup || currentGroup.id !== lesson.sectionId) {
        groups.push({
          id: lesson.sectionId,
          title: lesson.sectionTitle,
          lessons: [lesson],
        });
      } else {
        currentGroup.lessons.push(lesson);
      }
    }
    return groups;
  }

  courseProgressPct(): number {
    const total = this.lessons().length;
    if (!total) return 0;
    return Math.round((this.completedSet().size / total) * 100);
  }

  completedLessonsCount(): number {
    return this.completedSet().size;
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

slideDeckKey(lessonId: string, bi: number): string {
  return `${lessonId}::slideDeck::${bi}`;
}

private markSlideVisited(lessonId: string, bi: number, index: number): void {
  const key = this.slideDeckKey(lessonId, bi);
  const visited = this.slideDeckVisited.get(key) ?? new Set<number>();
  visited.add(index);
  this.slideDeckVisited.set(key, visited);
}

private ensureSlideDeckState(lessonId: string, bi: number, block: Block): void {
  const slides = this.slideDeckSlides(block);
  if (!slides.length) return;

  const key = this.slideDeckKey(lessonId, bi);
  if (!this.slideDeckIndexes.has(key)) {
    this.slideDeckIndexes.set(key, 0);
  }

  const currentIndex = this.slideDeckIndexes.get(key) ?? 0;
  this.markSlideVisited(lessonId, bi, Math.min(Math.max(currentIndex, 0), slides.length - 1));
}

private hydrateSlideDeckProgress(progress: Record<string, SlideDeckProgressEntry> | null): void {
  this.slideDeckIndexes.clear();
  this.slideDeckVisited.clear();
  this.slideDeckRevealedCards.clear();

  if (!progress) return;

  Object.entries(progress).forEach(([key, value]) => {
    const currentIndex = Number.isFinite(value?.currentIndex) ? Number(value.currentIndex) : 0;
    const visited = Array.isArray(value?.visited)
      ? value.visited.filter((entry) => Number.isFinite(entry)).map((entry) => Number(entry))
      : [];
    const revealedCardIds = Array.isArray(value?.revealedCardIds)
      ? value.revealedCardIds.filter((entry) => typeof entry === 'string' && !!entry)
      : [];

    this.slideDeckIndexes.set(key, currentIndex);
    this.slideDeckVisited.set(key, new Set(visited));
    this.slideDeckRevealedCards.set(key, new Set(revealedCardIds));
  });
}

private async persistSlideDeckState(lessonId: string, bi: number): Promise<void> {
  const uid = this.auth.currentUser?.uid;
  if (!uid) return;

  const key = this.slideDeckKey(lessonId, bi);
  const currentIndex = this.slideDeckIndexes.get(key) ?? 0;
  const visited = Array.from(this.slideDeckVisited.get(key) ?? []).sort((a, b) => a - b);
  const revealedCardIds = Array.from(this.slideDeckRevealedCards.get(key) ?? []).sort();

  const enrRef = fsDoc(this.afs as any, `users/${uid}/enrollments/${this.courseId}`);
  await setDoc(
    enrRef,
    {
      uid,
      courseId: this.courseId,
      slideDeckProgress: {
        [key]: {
          currentIndex,
          visited,
          revealedCardIds,
          updatedAt: serverTimestamp(),
        },
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

slideDeckSlides(block: Block): SlideDeckSlide[] {
  return Array.isArray(block.slides) ? block.slides : [];
}

slideDeckTotalCardCount(block: Block): number {
  return this.slideDeckSlides(block).reduce((total, slide) => total + (slide.interactiveCards?.length ?? 0), 0);
}

slideDeckRevealedCount(lessonId: string, bi: number, block: Block): number {
  const validIds = new Set(
    this.slideDeckSlides(block).flatMap((slide) => (slide.interactiveCards ?? []).map((card) => card.id))
  );
  const revealed = this.slideDeckRevealedCards.get(this.slideDeckKey(lessonId, bi)) ?? new Set<string>();
  return Array.from(revealed).filter((id) => validIds.has(id)).length;
}

slideDeckCompletionState(lessonId: string, bi: number, block: Block) {
  const totalSlides = this.slideDeckSlides(block).length;
  const totalCards = this.slideDeckTotalCardCount(block);
  const visitedSlides = this.slideDeckVisitedCount(lessonId, bi, block);
  const revealedCards = this.slideDeckRevealedCount(lessonId, bi, block);
  return {
    totalSlides,
    totalCards,
    visitedSlides,
    revealedCards,
    isComplete: visitedSlides >= totalSlides && revealedCards >= totalCards,
  };
}

slideDeckIndex(lessonId: string, bi: number, block: Block): number {
  const slides = this.slideDeckSlides(block);
  if (!slides.length) return 0;

  this.ensureSlideDeckState(lessonId, bi, block);

  const key = this.slideDeckKey(lessonId, bi);
  const current = this.slideDeckIndexes.get(key) ?? 0;
  return Math.min(Math.max(current, 0), slides.length - 1);
}

activeSlide(lessonId: string, bi: number, block: Block): SlideDeckSlide | null {
  const slides = this.slideDeckSlides(block);
  if (!slides.length) return null;
  return slides[this.slideDeckIndex(lessonId, bi, block)] ?? null;
}

setActiveSlide(lessonId: string, bi: number, block: Block, index: number): void {
  const slides = this.slideDeckSlides(block);
  if (!slides.length) return;

  const nextIndex = Math.min(Math.max(index, 0), slides.length - 1);
  this.markSlideVisited(lessonId, bi, nextIndex);
  this.slideDeckIndexes.set(this.slideDeckKey(lessonId, bi), nextIndex);
  void this.persistSlideDeckState(lessonId, bi);
}

nextSlide(lessonId: string, bi: number, block: Block): void {
  this.setActiveSlide(lessonId, bi, block, this.slideDeckIndex(lessonId, bi, block) + 1);
}

prevSlide(lessonId: string, bi: number, block: Block): void {
  this.setActiveSlide(lessonId, bi, block, this.slideDeckIndex(lessonId, bi, block) - 1);
}

slideNotesHtml(html?: string): SafeHtml {
  return this.trustedHtml(html || '');
}

slideInteractiveCards(block: Block): NonNullable<SlideDeckSlide['interactiveCards']> {
  const cards = this.activeSlide('', 0, block)?.interactiveCards;
  return Array.isArray(cards) ? cards : [];
}

slideInteractiveCardsFor(lessonId: string, bi: number, block: Block) {
  const cards = this.activeSlide(lessonId, bi, block)?.interactiveCards;
  return Array.isArray(cards) ? cards : [];
}

slideHotspotCardsFor(lessonId: string, bi: number, block: Block) {
  return this.slideInteractiveCardsFor(lessonId, bi, block).filter((card) => card.variant === 'hotspot');
}

slidePanelCardsFor(lessonId: string, bi: number, block: Block) {
  return this.slideInteractiveCardsFor(lessonId, bi, block).filter((card) => card.variant !== 'hotspot');
}

interactiveCardVariantLabel(card: NonNullable<SlideDeckSlide['interactiveCards']>[number]): string {
  switch (card.variant ?? 'default') {
    case 'flip':
      return this.t('player.flipCard');
    case 'hotspot':
      return this.t('player.hotspot');
    case 'sequence':
      return this.t('player.stepReveal');
    default:
      return this.t('player.explore');
  }
}

interactiveCardHotspotStyle(card: NonNullable<SlideDeckSlide['interactiveCards']>[number]) {
  const left = Math.min(100, Math.max(0, Number(card.hotspotX ?? 50)));
  const top = Math.min(100, Math.max(0, Number(card.hotspotY ?? 50)));
  return { left: left + '%', top: top + '%' };
}

canRevealInteractiveCard(lessonId: string, bi: number, block: Block, cardId: string): boolean {
  const cards = this.slideInteractiveCardsFor(lessonId, bi, block);
  const index = cards.findIndex((card) => card.id === cardId);
  if (index < 0) return false;

  const card = cards[index];
  if ((card.variant ?? 'default') !== 'sequence') return true;

  const previousSequenceCards = cards.slice(0, index).filter((entry) => (entry.variant ?? 'default') === 'sequence');
  return previousSequenceCards.every((entry) => this.isInteractiveCardRevealed(lessonId, bi, entry.id));
}

isInteractiveCardRevealed(lessonId: string, bi: number, cardId: string): boolean {
  return (this.slideDeckRevealedCards.get(this.slideDeckKey(lessonId, bi)) ?? new Set<string>()).has(cardId);
}

async revealInteractiveCard(lessonId: string, bi: number, block: Block, cardId: string): Promise<void> {
  if (!cardId) return;
  if (!this.canRevealInteractiveCard(lessonId, bi, block, cardId)) {
    this.notice = this.t('player.discoverPreviousStep');
    return;
  }

  const key = this.slideDeckKey(lessonId, bi);
  const revealed = this.slideDeckRevealedCards.get(key) ?? new Set<string>();
  if (revealed.has(cardId)) return;

  revealed.add(cardId);
  this.slideDeckRevealedCards.set(key, revealed);
  await this.persistSlideDeckState(lessonId, bi);
}

revealedInteractiveCardsCount(lessonId: string, bi: number, block: Block): number {
  const cardIds = new Set(this.slideInteractiveCardsFor(lessonId, bi, block).map((card) => card.id));
  const revealed = this.slideDeckRevealedCards.get(this.slideDeckKey(lessonId, bi)) ?? new Set<string>();
  return Array.from(revealed).filter((id) => cardIds.has(id)).length;
}

slideDeckVisitedCount(lessonId: string, bi: number, block: Block): number {
  const slides = this.slideDeckSlides(block);
  if (!slides.length) return 0;

  const key = this.slideDeckKey(lessonId, bi);
  const visited = new Set(this.slideDeckVisited.get(key) ?? []);
  visited.add(this.slideDeckIndex(lessonId, bi, block));
  return visited.size;
}

  slideDeckProgressPct(lessonId: string, bi: number, block: Block): number {
  const total = this.slideDeckSlides(block).length + this.slideDeckTotalCardCount(block);
  if (!total) return 0;
  const completed = this.slideDeckVisitedCount(lessonId, bi, block) + this.slideDeckRevealedCount(lessonId, bi, block);
  return Math.round((completed / total) * 100);
}

private lessonById(lessonId: string): FlatLesson | null {
  return this.lessons().find((lesson) => lesson.id === lessonId) ?? null;
}

lessonAdvanceBlocked(lesson: FlatLesson | null): boolean {
  if (!lesson || this.completedSet().has(lesson.id)) return false;
  if (lesson.blocks.some((block, bi) => block.type === 'slideDeck' && !this.slideDeckCompletionState(lesson.id, bi, block).isComplete)) {
    return true;
  }

  if (lesson.blocks.some(
    (block, bi) =>
      block.type === 'quiz'
      && this.isValidQuiz(block)
      && this.quizStatus(lesson.id, bi) !== 'passed'
  )) {
    return true;
  }

  return !this.lessonHtmlInteractionsComplete(lesson);
}

cardStackCards(block: Block): CardStackCard[] {
  return Array.isArray(block.cards) ? block.cards : [];
}

private cardStackKey(lessonId: string, bi: number): string {
  return `${lessonId}::cardStack::${bi}`;
}

isCardStackCardRevealed(lessonId: string, bi: number, cardId: string): boolean {
  return (this.cardStackRevealed.get(this.cardStackKey(lessonId, bi)) ?? new Set<string>()).has(cardId);
}

canRevealCardStackCard(lessonId: string, bi: number, block: Block, cardId: string): boolean {
  const cards = this.cardStackCards(block);
  const index = cards.findIndex((card) => card.id === cardId);
  if (index < 0) return false;
  if ((block.variant ?? 'flip') !== 'gated') return true;
  return cards.slice(0, index).every((card) => this.isCardStackCardRevealed(lessonId, bi, card.id));
}

toggleCardStackCard(lessonId: string, bi: number, block: Block, cardId: string): void {
  if (!this.canRevealCardStackCard(lessonId, bi, block, cardId)) {
    this.notice = this.t('player.openPreviousCardNotice');
    return;
  }

  const key = this.cardStackKey(lessonId, bi);
  const revealed = this.cardStackRevealed.get(key) ?? new Set<string>();
  if (revealed.has(cardId)) {
    revealed.delete(cardId);
  } else {
    revealed.add(cardId);
  }
  this.cardStackRevealed.set(key, revealed);
}

lessonAdvanceHint(lesson: FlatLesson | null): string {
  if (!lesson) return '';
  for (let bi = 0; bi < lesson.blocks.length; bi += 1) {
    const block = lesson.blocks[bi];
    if (block.type !== 'slideDeck') continue;
    const state = this.slideDeckCompletionState(lesson.id, bi, block);
    if (state.isComplete) continue;

    if (state.visitedSlides < state.totalSlides) {
      return this.t('player.reviewAllSlides', { total: state.totalSlides });
    }
    if (state.revealedCards < state.totalCards) {
      return this.t('player.discoverAllCards', { total: state.totalCards });
    }
  }
  for (let bi = 0; bi < lesson.blocks.length; bi += 1) {
    const block = lesson.blocks[bi];
    if (
      block.type === 'quiz'
      && this.isValidQuiz(block)
      && this.quizStatus(lesson.id, bi) !== 'passed'
    ) {
      return this.t('player.passQuiz');
    }
  }
  const htmlProgress = this.lessonHtmlInteractionSummary(lesson);
  if (htmlProgress.total > 0 && !htmlProgress.complete) {
    return this.t('player.interactAll', { total: htmlProgress.total });
  }
  return '';
}

onSlideAudioEnded(lessonId: string, bi: number, block: Block): void {
  const slides = this.slideDeckSlides(block);
  if (!slides.length) return;

  const currentIndex = this.slideDeckIndex(lessonId, bi, block);
  this.markSlideVisited(lessonId, bi, currentIndex);

  if (currentIndex < slides.length - 1) {
    this.setActiveSlide(lessonId, bi, block, currentIndex + 1);
    this.notice = this.t('player.slideCounter', { current: currentIndex + 2, total: slides.length });
    return;
  }

  this.notice = this.slideDeckTotalCardCount(block) > 0
    ? this.t('player.slideDeckCardsNotice')
    : this.t('player.slideDeckDoneNotice');
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
    return this.trustedHtml(html);
  }

  private trustedHtml(html: string): SafeHtml {
    const cached = this.trustedHtmlCache.get(html);
    if (cached) return cached;

    const trusted = this.sanitizer.bypassSecurityTrustHtml(html);
    this.trustedHtmlCache.set(html, trusted);
    return trusted;
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
          ? `<details><summary>${escapeHtml(this.t('player.transcript'))}</summary><pre>${escapeHtml(b.transcript)}</pre></details>`
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
      ? `<details><summary>${escapeHtml(this.t('player.transcript'))}</summary><pre>${escapeHtml(b.transcript)}</pre></details>`
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
      ? `<details><summary>${escapeHtml(this.t('player.transcript'))}</summary><pre>${escapeHtml(b.transcript)}</pre></details>`
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
    ? `<details><summary>${escapeHtml(this.t('player.transcript'))}</summary><pre>${escapeHtml(b.transcript)}</pre></details>`
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
          ${escapeHtml(this.t('player.browserNoVideo'))}
        </video>
        ${transcript}
      </div>
    `
    : transcript;
}

      case 'hero': {
        const title = escapeHtml(b.title || '');
        const body = b.bodyHtml ? String(b.bodyHtml) : b.text ? `<p>${escapeHtml(b.text)}</p>` : '';
        const image = b.imageUrl ? `<img src="${escapeAttr(b.imageUrl)}" alt="${title}" />` : '';
        const buttonLabel = escapeHtml(b.buttonLabel || this.t('player.continueButton'));
        return `
          <section class="hero-block">
            ${image ? `<div class="hero-block__media">${image}</div>` : ''}
            <div class="hero-block__copy">
              ${title ? `<h2>${title}</h2>` : ''}
              ${body}
              <button type="button" class="hero-block__action track-interaction" data-track-interaction="true"> ${buttonLabel} </button>
            </div>
          </section>
        `;
      }

      case 'accordion': {
        return '';
      }

      case 'quizIntro': {
        const title = b.title ? `<h3>${escapeHtml(b.title)}</h3>` : '<h3>Quiz</h3>';
        const body = b.bodyHtml ? String(b.bodyHtml) : '';
        const passPct = Number(b.passPct ?? 80);
        const buttonLabel = escapeHtml(b.buttonLabel || this.t('player.startQuiz'));
        return `
          <section class="quiz-intro-block">
            ${title}
            ${body}
            <p class="quiz-intro-block__meta">${escapeHtml(this.t('player.passingScore', { pct: passPct }))}</p>
            <button type="button" class="hero-block__action track-interaction" data-track-interaction="true">${buttonLabel}</button>
          </section>
        `;
      }

      case 'slideDeck':
        return '';

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

  async completeLesson(lessonId: string, autoAdvance = true): Promise<void> {
    this.notice = '';
    if (!lessonId) return;
    if (this.domainAccessDenied()) {
      this.notice = `This course is restricted to ${this.allowedDomainLabel()} accounts.`;
      return;
    }

    const lesson = this.lessonById(lessonId);
    if (this.lessonAdvanceBlocked(lesson)) {
      this.notice = this.lessonAdvanceHint(lesson) || this.t('player.completeInteractive');
      return;
    }

    const user = await firstValueFrom(authState(this.auth));
    if (!user) {
      this.notice = this.t('player.signInFirst');
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
      if (autoAdvance) {
        this.next(idx);
      } else {
        this.notice = this.t('player.lessonSaved');
      }
    } catch (e: any) {
      console.error('completeLesson failed:', e);
      this.notice = e?.message || this.t('player.lessonSaveFailed');
    } finally {
      this.busyId = null;
    }
  }

  next(currentIndex: number): void {
    const total = this.lessons().length;
    if (total === 0) {
      this.notice = this.t('player.noLessonsAvailable');
      return;
    }

    const currentLesson = this.lessons()[currentIndex] ?? null;
    if (this.lessonAdvanceBlocked(currentLesson)) {
      this.notice = this.lessonAdvanceHint(currentLesson) || this.t('player.completeInteractive');
      return;
    }

    if (currentIndex < total - 1) {
      this.setActive(currentIndex + 1);
      this.notice = this.t('player.movedToLesson', { current: currentIndex + 2, total });
      return;
    }

    this.notice = this.t('player.lastLesson');
  }

  backToCourse() {
    this.router.navigate(['/learner/courses', this.courseId]);
  }

  async continueLesson(lesson: FlatLesson | null): Promise<void> {
    if (!lesson) return;
    if (this.domainAccessDenied()) {
      this.notice = `This course is restricted to ${this.allowedDomainLabel()} accounts.`;
      return;
    }
    if (this.lessonAdvanceBlocked(lesson)) {
      this.notice = this.lessonAdvanceHint(lesson) || this.t('player.finishInteractions');
      return;
    }

    if (!this.completedSet().has(lesson.id)) {
      await this.completeLesson(lesson.id, true);
      return;
    }

    if (lesson.index === this.lessons().length - 1) {
      this.endCourse();
      return;
    }

    this.setActive(lesson.index + 1);
  }

  private videoTimes = new Map<string, number>();

videoKey(lessonId: string, bi: number): string {
  return `${lessonId}::video::${bi}`;
}

getVideoUrl(b: Block): string {
  return (b.url ?? '').trim();
}

isYouTubeUrl(url?: string): boolean {
  return !!this.youtubeVideoId(url);
}

isVimeoUrl(url?: string): boolean {
  return !!this.vimeoVideoId(url);
}

isDirectVideoUrl(url?: string): boolean {
  const raw = (url ?? '').trim();
  return !!raw && !this.isYouTubeUrl(raw) && !this.isVimeoUrl(raw);
}

youtubeEmbed(url?: string): SafeResourceUrl | null {
  const id = this.youtubeVideoId(url);
  return id ? this.trustedEmbedUrl(`https://www.youtube-nocookie.com/embed/${id}`) : null;
}

vimeoEmbed(url?: string): SafeResourceUrl | null {
  const id = this.vimeoVideoId(url);
  return id ? this.trustedEmbedUrl(`https://player.vimeo.com/video/${id}`) : null;
}

private trustedEmbedUrl(url: string): SafeResourceUrl {
  const cached = this.trustedVideoEmbeds.get(url);
  if (cached) return cached;

  const trusted = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  this.trustedVideoEmbeds.set(url, trusted);
  return trusted;
}

private youtubeVideoId(url?: string): string {
  const raw = (url ?? '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const parts = parsed.pathname.split('/').filter(Boolean);

    if (host === 'youtu.be') {
      return safeYouTubeId(parts[0] ?? '');
    }

    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com') {
      if (parts[0] === 'watch') {
        return safeYouTubeId(parsed.searchParams.get('v') ?? '');
      }

      if (['embed', 'shorts', 'live'].includes(parts[0] ?? '')) {
        return safeYouTubeId(parts[1] ?? '');
      }
    }
  } catch {}

  const match =
    raw.match(/(?:youtube\.com\/watch\?[^#]*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([A-Za-z0-9_-]+)/i)?.[1] ??
    '';

  return safeYouTubeId(match);
}

private vimeoVideoId(url?: string): string {
  const raw = (url ?? '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const parts = parsed.pathname.split('/').filter(Boolean);

    if (host === 'vimeo.com') {
      return safeNumericId(parts[0] ?? '');
    }

    if (host === 'player.vimeo.com' && parts[0] === 'video') {
      return safeNumericId(parts[1] ?? '');
    }
  } catch {}

  return safeNumericId(raw.match(/vimeo\.com\/(?:video\/)?(\d+)/i)?.[1] ?? '');
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
    return this.breakpointObserver.isMatched('(max-width: 900px)');
  }

  setActive(i: number) {
    if (i >= 0 && i < this.lessons().length) {
      const currentLesson = this.current();
      if (i > this.activeIndex && this.lessonAdvanceBlocked(currentLesson)) {
        this.notice = this.lessonAdvanceHint(currentLesson) || this.t('player.completeInteractive');
        return;
      }

      this.activeIndex = i;
      this.notice = '';
      this.scheduleLessonInteractionScan();

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

    if (!this.sidebarOpen || !this.isMobileViewport()) return;

    this.sidebarTimer = setTimeout(() => {
      this.sidebarOpen = false;
      this.sidebarTimer = null;
    }, this.sidebarDelayMs);
  }

  private scheduleLessonInteractionScan(): void {
    setTimeout(() => this.collectLessonInteractions(), 0);
  }

  private lessonInteractionKey(lessonId: string): string {
    return `${lessonId}::html-interactions`;
  }

  private interactionSelector(): string {
    return [
      'details:not([data-track="false"])',
      '[data-track-interaction]',
      '.track-interaction',
      '.gate-card',
      '.flip-card',
      '.flash-card',
      '.info-card',
      '.accordion-card',
    ].join(', ');
  }

  private collectLessonInteractions(): void {
    const lesson = this.current();
    const host = this.viewerBodyRef?.nativeElement;
    if (!lesson || !host) return;

    this.setupCustomAccordions(host);

    const tracked = Array.from(host.querySelectorAll<HTMLElement>(this.interactionSelector()));
    const ids: string[] = [];

    tracked.forEach((element, index) => {
      const resolvedId = element.dataset['trackId'] || `${element.tagName.toLowerCase()}-${index}`;
      element.dataset['resolvedTrackId'] = resolvedId;
      ids.push(resolvedId);
    });

    const key = this.lessonInteractionKey(lesson.id);
    this.htmlInteractionRequired.set(key, ids);

    const seen = this.htmlInteractionSeen.get(key) ?? new Set<string>();
    tracked.forEach((element) => {
      const resolvedId = element.dataset['resolvedTrackId'];
      if (!resolvedId) return;

      if (element.tagName.toLowerCase() === 'details' && (element as HTMLDetailsElement).open) {
        seen.add(resolvedId);
        return;
      }

      if (element.matches('[aria-expanded="true"], [data-track-complete="true"]')) {
        seen.add(resolvedId);
      }
    });
    this.htmlInteractionSeen.set(key, seen);
  }

  private setupCustomAccordions(host: HTMLElement): void {
    const triggers = host.querySelectorAll<HTMLElement>(
      '[data-accordion-trigger], .accordion-trigger, .accordion-header, .accordion-title, .faq-question'
    );

    triggers.forEach((trigger) => {
      if (!trigger.hasAttribute('role')) {
        trigger.setAttribute('role', 'button');
      }
      if (!trigger.hasAttribute('tabindex')) {
        trigger.setAttribute('tabindex', '0');
      }

      const item = trigger.closest<HTMLElement>(
        '[data-accordion-item], .accordion-item, .accordion-card, .faq-item'
      );
      const panel =
        item?.querySelector<HTMLElement>(
          '[data-accordion-panel], .accordion-panel, .accordion-content, .accordion-body, .faq-answer'
        ) ??
        (trigger.nextElementSibling as HTMLElement | null);

      if (!panel) return;

      const expanded = trigger.getAttribute('aria-expanded') === 'true' || item?.classList.contains('is-open') === true;
      trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      panel.hidden = !expanded;
      panel.style.display = expanded ? 'block' : 'none';
    });
  }

  onViewerClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    this.handleNativeDetailsClick(target, event);
    this.handleCustomAccordionClick(target, event);
    this.markInteractionFromTarget(target);
  }

  onViewerToggle(event: Event): void {
    this.markInteractionFromTarget(event.target as HTMLElement | null);
  }

  private markInteractionFromTarget(target: HTMLElement | null): void {
    const lesson = this.current();
    const host = this.viewerBodyRef?.nativeElement;
    if (!lesson || !host || !target) return;

    const trackedElement = target.closest<HTMLElement>(this.interactionSelector());
    if (!trackedElement || !host.contains(trackedElement)) return;

    const resolvedId = trackedElement.dataset['resolvedTrackId'];
    if (!resolvedId) return;

    const key = this.lessonInteractionKey(lesson.id);
    const seen = this.htmlInteractionSeen.get(key) ?? new Set<string>();
    seen.add(resolvedId);
    this.htmlInteractionSeen.set(key, seen);
  }

  private handleCustomAccordionClick(target: HTMLElement | null, event: Event): void {
    if (!target) return;

    const nativeSummary = target.closest('summary');
    if (nativeSummary) return;

    const trigger = target.closest<HTMLElement>(
      '[data-accordion-trigger], .accordion-trigger, .accordion-header, .accordion-title, .faq-question'
    );
    if (!trigger) return;

    const item = trigger.closest<HTMLElement>(
      '[data-accordion-item], .accordion-item, .accordion-card, .faq-item'
    );

    const panel =
      item?.querySelector<HTMLElement>(
        '[data-accordion-panel], .accordion-panel, .accordion-content, .accordion-body, .faq-answer'
      ) ??
      (trigger.nextElementSibling as HTMLElement | null);

    if (!panel) return;

    event.preventDefault();

    const nextExpanded = trigger.getAttribute('aria-expanded') !== 'true';
    trigger.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
    panel.hidden = !nextExpanded;
    panel.style.display = nextExpanded ? 'block' : 'none';

    if (item) {
      item.dataset['trackComplete'] = nextExpanded ? 'true' : item.dataset['trackComplete'] ?? 'false';
      item.classList.toggle('is-open', nextExpanded);
    }
  }

  private handleNativeDetailsClick(target: HTMLElement | null, event: Event): void {
    if (!target) return;

    const summary = target.closest<HTMLElement>('summary');
    if (!summary) return;

    const details = summary.closest<HTMLDetailsElement>('details');
    const host = this.viewerBodyRef?.nativeElement;
    if (!details || !host?.contains(details)) return;

    event.preventDefault();

    details.open = !details.open;
    details.classList.toggle('is-open', details.open);
    details.querySelectorAll<HTMLElement>(':scope > :not(summary)').forEach((panel) => {
      panel.hidden = !details.open;
      panel.style.display = details.open ? 'block' : 'none';
      panel.style.visibility = details.open ? 'visible' : '';
      panel.style.opacity = details.open ? '1' : '';
    });

    const resolvedId =
      details.dataset['resolvedTrackId']
      || details.dataset['trackId']
      || summary.textContent?.trim()
      || `details-${Date.now()}`;
    details.dataset['resolvedTrackId'] = resolvedId;

    if (details.open) {
      details.dataset['trackComplete'] = 'true';
    }
  }

  accordionItems(block: Block): AccordionItem[] {
    return Array.isArray(block.items) ? block.items : [];
  }

  accordionItemContentHtml(item: AccordionItem): SafeHtml {
    return this.trustedHtml(this.accordionItemHtmlString(item));
  }

  hasAccordionItemContent(item: AccordionItem): boolean {
    return this.accordionItemHtmlString(item).trim().length > 0;
  }

  private accordionItemHtmlString(item: AccordionItem): string {
    const html =
      item.bodyHtml
      || item.html
      || this.extractLegacyHtml(item.body)
      || this.extractLegacyHtml(item.content);

    if (html?.trim()) return html;

    const text = item.bodyText || item.text || this.extractLegacyText(item.body) || this.extractLegacyText(item.content);
    const paragraphs = (text ?? '')
      .split(/\r?\n\r?\n/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => `<p>${escapeHtml(chunk).replace(/\r?\n/g, '<br>')}</p>`)
      .join('');

    const bullets = (item.bulletsText ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join('');

    return `${paragraphs}${bullets ? `<ul>${bullets}</ul>` : ''}`;
  }

  private extractLegacyHtml(value: AccordionItem['body'] | AccordionItem['content']): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value.html ?? '';
  }

  private extractLegacyText(value: AccordionItem['body'] | AccordionItem['content']): string {
    if (!value || typeof value === 'string') return '';
    return value.text ?? '';
  }

  accordionItemTrackId(item: AccordionItem, index: number): string {
    return item.id || `accordion-${index}`;
  }

  tabItems(block: Block): TabItem[] {
    return Array.isArray(block.tabs) ? block.tabs : [];
  }

  activeTabId(lessonId: string, bi: number, block: Block): string {
    const tabs = this.tabItems(block);
    if (!tabs.length) return '';

    const key = this.tabKey(lessonId, bi);
    const current = this.activeTabs.get(key);
    return tabs.some((tab) => tab.id === current) ? current! : tabs[0].id;
  }

  activeTab(lessonId: string, bi: number, block: Block): TabItem | null {
    const activeId = this.activeTabId(lessonId, bi, block);
    return this.tabItems(block).find((tab) => tab.id === activeId) ?? null;
  }

  setActiveTab(lessonId: string, bi: number, tab: TabItem): void {
    const key = this.tabKey(lessonId, bi);
    this.activeTabs.set(key, tab.id);

    const seen = this.tabSeen.get(key) ?? new Set<string>();
    seen.add(tab.id);
    this.tabSeen.set(key, seen);
  }

  private tabKey(lessonId: string, bi: number): string {
    return `${lessonId}::tabs::${bi}`;
  }

  onAccordionToggle(event: Event, lessonId: string, bi: number, item: AccordionItem, index: number): void {
    const details = event.target as HTMLDetailsElement | null;
    if (!details?.open) return;

    const key = this.accordionKey(lessonId, bi);
    const seen = this.accordionSeen.get(key) ?? new Set<string>();
    seen.add(this.accordionItemTrackId(item, index));
    this.accordionSeen.set(key, seen);
  }

  private accordionKey(lessonId: string, bi: number): string {
    return `${lessonId}::accordion::${bi}`;
  }

  private lessonAccordionInteractionSummary(lesson: FlatLesson) {
    let total = 0;
    let touched = 0;

    lesson.blocks.forEach((block, bi) => {
      if (block.type !== 'accordion') return;

      const items = this.accordionItems(block);
      const seen = this.accordionSeen.get(this.accordionKey(lesson.id, bi)) ?? new Set<string>();

      total += items.length;
      touched += items.filter((item, index) => seen.has(this.accordionItemTrackId(item, index))).length;
    });

    return { total, touched };
  }

  private lessonTabsInteractionSummary(lesson: FlatLesson) {
    let total = 0;
    let touched = 0;

    lesson.blocks.forEach((block, bi) => {
      if (block.type !== 'tabs') return;

      const tabs = this.tabItems(block);
      if (!tabs.length) return;

      const key = this.tabKey(lesson.id, bi);
      const seen = new Set(this.tabSeen.get(key) ?? []);
      seen.add(this.activeTabId(lesson.id, bi, block));

      total += tabs.length;
      touched += tabs.filter((tab) => seen.has(tab.id)).length;
    });

    return { total, touched };
  }

  private lessonHtmlInteractionSummary(lesson: FlatLesson) {
    const key = this.lessonInteractionKey(lesson.id);
    const required = this.htmlInteractionRequired.get(key) ?? [];
    const seen = this.htmlInteractionSeen.get(key) ?? new Set<string>();
    const htmlTouched = required.filter((id) => seen.has(id)).length;
    const accordion = this.lessonAccordionInteractionSummary(lesson);
    const tabs = this.lessonTabsInteractionSummary(lesson);
    const total = required.length + accordion.total + tabs.total;
    const touched = htmlTouched + accordion.touched + tabs.touched;

    return {
      total,
      touched,
      remaining: Math.max(0, total - touched),
      complete: total === 0 || touched >= total,
    };
  }

  lessonHtmlInteractionsComplete(lesson: FlatLesson | null): boolean {
    if (!lesson) return true;
    return this.lessonHtmlInteractionSummary(lesson).complete;
  }

  lessonInteractionProgressLabel(lesson: FlatLesson | null): string {
    if (!lesson) return '';
    const summary = this.lessonHtmlInteractionSummary(lesson);
    if (!summary.total) return this.t('player.noTrackedInteractions');
    return this.t('player.interactionsCompleted', { done: summary.touched, total: summary.total });
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

function safeYouTubeId(id: string): string {
  const trimmed = (id ?? '').trim();
  return /^[A-Za-z0-9_-]{6,20}$/.test(trimmed) ? trimmed : '';
}

function safeNumericId(id: string): string {
  const trimmed = (id ?? '').trim();
  return /^\d{4,20}$/.test(trimmed) ? trimmed : '';
}
