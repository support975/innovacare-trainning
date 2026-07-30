import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { AuthService } from '../../../../core/auth';
import { CommunicationCenterService } from '../data/communication-center.service';

@Component({
  selector: 'app-campaigns-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="cc-panel">
      <header class="cc-panel__head">
        <div>
          <h2>Campaigns</h2>
          <p>Firestore-backed campaign drafts. Scheduling and send providers remain unavailable.</p>
        </div>
        <button type="button" class="cc-disabled" disabled>Schedule send: Coming later</button>
      </header>

      <p class="cc-message" *ngIf="!orgId()">Select an active organization to list campaign drafts.</p>
      <p class="cc-message" *ngIf="state().loading">Loading campaign drafts…</p>
      <p class="cc-message" *ngIf="state().error === 'permission-denied'">You do not have permission to read campaign drafts for this organization.</p>
      <p class="cc-message" *ngIf="!state().loading && !state().error && orgId() && !state().items.length">No campaign draft exists yet for this organization.</p>

      <div class="cc-list" *ngIf="state().items.length">
        <article *ngFor="let campaign of state().items">
          <div class="cc-list__top">
            <div>
              <h3>{{ campaign.title }}</h3>
              <p>{{ campaign.summary }}</p>
            </div>
            <span class="cc-status">{{ campaign.status }}</span>
          </div>
          <dl>
            <div><dt>Newsletter</dt><dd>{{ campaign.newsletterId }}</dd></div>
            <div><dt>Goal</dt><dd>{{ campaign.conversionGoal }}</dd></div>
            <div><dt>Recipients</dt><dd>{{ campaign.estimatedRecipients }}</dd></div>
            <div><dt>Scheduled</dt><dd>{{ campaign.scheduledAt || 'Approval required' }}</dd></div>
          </dl>
          <div class="cc-actions">
            <button type="button" disabled>Send disabled</button>
            <button type="button" disabled>Provider integration: Coming later</button>
          </div>
        </article>
      </div>
    </section>
  `,
  styles: [
    `
      .cc-panel { border-radius: 18px; border: 1px solid #d7e4f0; background: rgba(255,255,255,.94); padding: 1rem; box-shadow: 0 10px 28px rgba(31, 77, 120, .08); }
      .cc-panel__head, .cc-list__top, .cc-actions { display: flex; justify-content: space-between; gap: .8rem; align-items: start; }
      .cc-panel__head h2, .cc-list h3 { margin: 0; color: #11304f; }
      .cc-panel__head p, .cc-list p { margin: .35rem 0 0; color: #5d7c99; }
      .cc-disabled, .cc-actions button { border-radius: 10px; border: 1px solid #d8e4f0; background: #eef4fb; color: #5d7c99; padding: .5rem .7rem; font-weight: 700; }
      .cc-list { display: grid; gap: .8rem; margin-top: 1rem; }
      .cc-list article { border-radius: 14px; border: 1px solid #e0ebf5; background: #fbfdff; padding: 1rem; }
      .cc-status { border-radius: 999px; background: #fff3dc; color: #805100; padding: .3rem .65rem; font-size: .76rem; font-weight: 800; text-transform: uppercase; }
      dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .7rem; margin: .9rem 0 0; }
      dt { font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: #5d7c99; }
      dd { margin: .25rem 0 0; color: #173b5d; }
      .cc-message { margin: 1rem 0 0; color: #5d7c99; }
      .cc-actions { margin-top: .9rem; }
    `,
  ],
})
export class CampaignsPage {
  private readonly auth = inject(AuthService);
  private readonly service = inject(CommunicationCenterService);

  readonly profile = toSignal(this.auth.profile$, { initialValue: null });
  readonly orgId = computed(() => this.profile()?.orgId || null);
  readonly state = toSignal(toObservable(this.orgId).pipe(switchMap((orgId) => this.service.listCampaignDrafts(orgId))), {
    initialValue: { items: [], loading: true, error: null },
  });
}
