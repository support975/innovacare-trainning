import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CourseMaterial } from '../../../../../data/models';
import { LanguageService } from '../../../../../shared/services/language';
import {
  MaterialKind,
  formatBytes,
  isMaterialDownloadable,
  isMaterialInLesson,
  isSafeHttpUrl,
  materialBadge,
  materialKind,
  materialTitle,
} from '../player-materials';

interface MaterialRow {
  material: CourseMaterial;
  id: string;
  title: string;
  description: string;
  kind: MaterialKind;
  badge: string;
  meta: string;
  inLesson: boolean;
  fromOrg: boolean;
  viewed: boolean;
  downloadUrl: string | null;
}

/** The "Materials" tab of the course player: every document for the current lesson. */
@Component({
  selector: 'app-materials-library',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './materials.css',
  template: `
    <section class="cp-materials" aria-labelledby="cp-materials-title">
      <header class="cp-materials__head">
        <h2 id="cp-materials-title" class="cp-materials__title">{{ t('player.materials.title') }}</h2>
        <p class="cp-materials__intro">{{ t('player.materials.intro') }}</p>
      </header>

      @if (rows().length) {
        <ul class="cp-materials__list">
          @for (row of rows(); track row.id) {
            <li class="cp-material">
              <div class="cp-material__icon" [attr.data-kind]="row.kind" aria-hidden="true">{{ row.badge }}</div>
              <div class="cp-material__body">
                <div class="cp-material__title">{{ row.title }}</div>
                @if (row.description) {
                  <div class="cp-material__desc">{{ row.description }}</div>
                }
                @if (row.meta) {
                  <div class="cp-material__meta">{{ row.meta }}</div>
                }
                <div class="cp-material__tags">
                  @if (row.inLesson) {
                    <span class="cp-tag cp-tag--lesson">{{ t('player.materials.inLesson') }}</span>
                  } @else if (row.fromOrg) {
                    <span class="cp-tag cp-tag--org">{{ t('player.materials.fromOrg') }}</span>
                  } @else {
                    <span class="cp-tag">{{ t('player.materials.courseResource') }}</span>
                  }
                  @if (row.viewed) {
                    <span class="cp-tag cp-tag--viewed">{{ t('player.materials.viewed') }}</span>
                  }
                </div>
              </div>
              <div class="cp-material__actions">
                <button type="button" class="cp-btn cp-btn--navy" (click)="open.emit(row.material)">
                  {{ t('player.materials.open') }}
                </button>
                @if (row.downloadUrl) {
                  <a
                    class="cp-btn cp-btn--icon"
                    [href]="row.downloadUrl"
                    target="_blank"
                    rel="noopener"
                    download
                    [attr.aria-label]="t('player.materials.downloadNamed', { name: row.title })"
                    (click)="downloaded.emit(row.material)">
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>
                  </a>
                }
              </div>
            </li>
          }
        </ul>
      } @else {
        <p class="cp-materials__empty">{{ t('player.materials.empty') }}</p>
      }
    </section>
  `,
})
export class MaterialsLibrary {
  private readonly lang = inject(LanguageService);

  readonly materials = input<CourseMaterial[]>([]);
  readonly lessonId = input<string | null>(null);
  readonly viewed = input<Record<string, unknown>>({});

  readonly open = output<CourseMaterial>();
  readonly downloaded = output<CourseMaterial>();

  readonly rows = computed<MaterialRow[]>(() => {
    const lessonId = this.lessonId();
    const viewed = this.viewed() ?? {};
    return this.materials().map((m) => {
      const kind = materialKind(m);
      const size = formatBytes(m.sizeBytes);
      return {
        material: m,
        id: m.id,
        title: materialTitle(m),
        description: (m.description ?? '').trim(),
        kind,
        badge: materialBadge(kind),
        meta: [materialBadge(kind), size].filter(Boolean).join(' · '),
        inLesson: isMaterialInLesson(m, lessonId),
        fromOrg: m.source === 'organization',
        viewed: !!viewed[m.id],
        downloadUrl: isMaterialDownloadable(m) && isSafeHttpUrl(m.url) ? m.url : null,
      };
    });
  });

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.lang.t(key, params);
  }
}
