import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { AuthService } from '../../../../core/auth';
import { CommunicationCenterService } from '../data/communication-center.service';

@Component({
  selector: 'app-audience-builder-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="cc-panel">
      <header class="cc-panel__head">
        <div>
          <h2>Audience Builder</h2>
          <p>Live audience segment drafts stored in Firestore, still read-only in this phase.</p>
        </div>
      </header>

      <p class="cc-message" *ngIf="!orgId()">Select an active organization to load audience segments.</p>
      <p class="cc-message" *ngIf="state().loading">Loading audience segments…</p>
      <p class="cc-message" *ngIf="state().error === 'permission-denied'">You do not have permission to read audience segments for this organization.</p>
      <p class="cc-message" *ngIf="!state().loading && !state().error && orgId() && !state().items.length">No audience segment draft exists yet for this organization.</p>

      <div class="cc-grid" *ngIf="state().items.length">
        <article *ngFor="let segment of state().items">
          <span>{{ segment.status }}</span>
          <h3>{{ segment.title }}</h3>
          <p>{{ segment.description }}</p>
          <strong>{{ segment.estimatedAudienceSize }} projected recipients</strong>
        </article>
      </div>
    </section>
  `,
  styles: [
    `
      .cc-panel { border-radius: 18px; border: 1px solid #d7e4f0; background: rgba(255,255,255,.94); padding: 1rem; box-shadow: 0 10px 28px rgba(31, 77, 120, .08); }
      .cc-panel__head h2, .cc-grid h3 { margin: 0; color: #11304f; }
      .cc-panel__head p, .cc-grid p, .cc-message { margin: .35rem 0 0; color: #5d7c99; }
      .cc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .8rem; margin-top: 1rem; }
      .cc-grid article { border-radius: 14px; border: 1px solid #e0ebf5; background: #fbfdff; padding: 1rem; }
      .cc-grid span { display: inline-flex; border-radius: 999px; background: #eaf2fa; color: #1f4d78; padding: .2rem .5rem; font-size: .72rem; font-weight: 800; text-transform: uppercase; }
      .cc-grid strong { display: block; margin-top: .75rem; color: #1d4a72; }
    `,
  ],
})
export class AudienceBuilderPage {
  private readonly auth = inject(AuthService);
  private readonly service = inject(CommunicationCenterService);

  readonly profile = toSignal(this.auth.profile$, { initialValue: null });
  readonly orgId = computed(() => this.profile()?.orgId || null);
  readonly state = toSignal(toObservable(this.orgId).pipe(switchMap((orgId) => this.service.listSegments(orgId))), {
    initialValue: { items: [], loading: true, error: null },
  });
}
