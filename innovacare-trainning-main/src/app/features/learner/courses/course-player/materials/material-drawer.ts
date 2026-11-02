import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CourseMaterial } from '../../../../../data/models';
import { LanguageService } from '../../../../../shared/services/language';
import {
  formatBytes,
  isMaterialDownloadable,
  isPreviewableUrl,
  isSafeHttpUrl,
  materialBadge,
  materialKind,
  materialTitle,
} from '../player-materials';

/**
 * Side panel (bottom sheet on phones) that shows a course material over the
 * lesson. Closing it returns the learner to exactly where they were.
 */
@Component({
  selector: 'app-material-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './materials.css',
  template: `
    @if (material(); as m) {
      <div class="cp-drawer" role="presentation">
        <button type="button" class="cp-drawer__scrim" tabindex="-1" [attr.aria-label]="t('player.materials.close')" (click)="closed.emit()"></button>
        <aside class="cp-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="cp-drawer-title">
          <div class="cp-drawer__grip" aria-hidden="true"></div>
          <header class="cp-drawer__head">
            <div class="cp-material__icon cp-material__icon--sm" [attr.data-kind]="kind()" aria-hidden="true">{{ badge() }}</div>
            <div class="cp-drawer__heading">
              <div id="cp-drawer-title" class="cp-drawer__title">{{ title() }}</div>
              @if (meta()) {
                <div class="cp-drawer__meta">{{ meta() }}</div>
              }
            </div>
            <button #closeBtn type="button" class="cp-btn cp-btn--icon" [attr.aria-label]="t('player.materials.close')" (click)="closed.emit()">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </header>

          <div class="cp-drawer__body">
            @if (previewUrl(); as src) {
              @switch (kind()) {
                @case ('pdf') {
                  <iframe class="cp-drawer__frame" [src]="src" [title]="title()"></iframe>
                }
                @case ('image') {
                  <img class="cp-drawer__image" [src]="m.url" [alt]="title()" />
                }
                @case ('video') {
                  <video class="cp-drawer__media" [src]="m.url" controls preload="metadata"></video>
                }
                @case ('audio') {
                  <audio class="cp-drawer__audio" [src]="m.url" controls preload="metadata"></audio>
                }
                @default {
                  <ng-container [ngTemplateOutlet]="noPreview" />
                }
              }
            } @else {
              <ng-container [ngTemplateOutlet]="noPreview" />
            }

            <ng-template #noPreview>
              <div class="cp-drawer__fallback">
                <div class="cp-material__icon cp-material__icon--lg" [attr.data-kind]="kind()" aria-hidden="true">{{ badge() }}</div>
                <p>{{ t('player.materials.noPreview') }}</p>
                @if (m.description) {
                  <p class="cp-drawer__desc">{{ m.description }}</p>
                }
                @if (safeUrl()) {
                  <a class="cp-btn cp-btn--ghost" [href]="safeUrl()" target="_blank" rel="noopener">{{ t('player.materials.openNewTab') }}</a>
                }
              </div>
            </ng-template>
          </div>

          <footer class="cp-drawer__foot">
            <button type="button" class="cp-btn cp-btn--teal cp-btn--grow" (click)="closed.emit()">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
              {{ t('player.materials.backToLesson') }}
            </button>
            <button type="button" class="cp-btn cp-btn--ghost" (click)="showAll.emit()">{{ t('player.materials.all') }}</button>
            @if (downloadUrl()) {
              <a class="cp-btn cp-btn--ghost" [href]="downloadUrl()" target="_blank" rel="noopener" download (click)="downloaded.emit(m)">
                {{ t('player.materials.download') }}
              </a>
            }
          </footer>
        </aside>
      </div>
    }
  `,
  imports: [NgTemplateOutlet],
})
export class MaterialDrawer {
  private readonly lang = inject(LanguageService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');

  readonly material = input<CourseMaterial | null>(null);
  readonly closed = output<void>();
  readonly showAll = output<void>();
  readonly downloaded = output<CourseMaterial>();

  readonly kind = computed(() => {
    const m = this.material();
    return m ? materialKind(m) : 'file';
  });
  readonly badge = computed(() => materialBadge(this.kind()));
  readonly title = computed(() => {
    const m = this.material();
    return m ? materialTitle(m) : '';
  });
  readonly meta = computed(() => {
    const m = this.material();
    if (!m) return '';
    return [this.badge(), formatBytes(m.sizeBytes)].filter(Boolean).join(' · ');
  });
  readonly safeUrl = computed(() => {
    const url = this.material()?.url;
    return isSafeHttpUrl(url) ? url! : null;
  });
  readonly downloadUrl = computed(() => {
    const m = this.material();
    return m && isMaterialDownloadable(m) ? this.safeUrl() : null;
  });
  /** Only Firebase/Cloud Storage files are embedded; anything else opens in a new tab. */
  readonly previewUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.material()?.url;
    if (!isPreviewableUrl(url)) return null;
    const kind = this.kind();
    if (kind !== 'pdf' && kind !== 'image' && kind !== 'video' && kind !== 'audio') return null;
    const src = kind === 'pdf' && !isMaterialDownloadable(this.material()!) ? `${url}#toolbar=0` : url!;
    return this.sanitizer.bypassSecurityTrustResourceUrl(src);
  });

  constructor() {
    // Move focus into the panel when it opens, for keyboard and screen-reader users.
    effect(() => {
      const btn = this.closeBtn();
      if (this.material() && btn) queueMicrotask(() => btn.nativeElement.focus());
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.material()) this.closed.emit();
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.lang.t(key, params);
  }
}
