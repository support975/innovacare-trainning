import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { AuthService } from '../../../../core/auth';
import { CommunicationCenterService } from '../data/communication-center.service';

@Component({
  selector: 'app-ai-content-studio-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="cc-panel">
      <header class="cc-panel__head">
        <div>
          <h2>AI Content Studio</h2>
          <p>Template drafts load from Firestore, but AI generation and provider delivery remain disabled.</p>
        </div>
        <button type="button" class="cc-disabled" disabled>AI send path: Coming later</button>
      </header>

      <p class="cc-message" *ngIf="!orgId()">Select an active organization to load template drafts.</p>
      <p class="cc-message" *ngIf="state().loading">Loading template drafts…</p>
      <p class="cc-message" *ngIf="state().error === 'permission-denied'">You do not have permission to read template drafts for this organization.</p>
      <p class="cc-message" *ngIf="!state().loading && !state().error && orgId() && !state().items.length">No template draft exists yet for this organization.</p>

      <div class="cc-grid" *ngIf="state().items.length">
        <article *ngFor="let template of state().items">
          <h3>{{ template.title }}</h3>
          <p>{{ template.summary }}</p>
          <strong>{{ template.status }}</strong>
          <small>Provider actions: Coming later</small>
        </article>
      </div>
    </section>
  `,
  styles: [
    `
      .cc-panel { border-radius: 18px; border: 1px solid #d7e4f0; background: rgba(255,255,255,.94); padding: 1rem; box-shadow: 0 10px 28px rgba(31, 77, 120, .08); }
      .cc-panel__head { display: flex; justify-content: space-between; gap: .8rem; align-items: start; }
      .cc-panel__head h2, .cc-grid h3 { margin: 0; color: #11304f; }
      .cc-panel__head p, .cc-grid p, .cc-message, .cc-grid small { margin: .35rem 0 0; color: #5d7c99; }
      .cc-disabled { border-radius: 10px; border: 1px solid #d8e4f0; background: #eef4fb; color: #5d7c99; padding: .5rem .7rem; font-weight: 700; }
      .cc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: .8rem; margin-top: 1rem; }
      .cc-grid article { border-radius: 14px; border: 1px solid #e0ebf5; background: #fbfdff; padding: 1rem; }
      .cc-grid strong { display: block; margin-top: .7rem; color: #1f4d78; text-transform: uppercase; }
    `,
  ],
})
export class AiContentStudioPage {
  private readonly auth = inject(AuthService);
  private readonly service = inject(CommunicationCenterService);

  readonly profile = toSignal(this.auth.profile$, { initialValue: null });
  readonly orgId = computed(() => this.profile()?.orgId || null);
  readonly state = toSignal(toObservable(this.orgId).pipe(switchMap((orgId) => this.service.listTemplates(orgId))), {
    initialValue: { items: [], loading: true, error: null },
  });
}
