import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { AuthService } from '../../../../core/auth';
import { CommunicationCenterService } from '../data/communication-center.service';

@Component({
  selector: 'app-approval-queue-page',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <section class="cc-panel">
      <header class="cc-panel__head">
        <div>
          <h2>Approval Queue</h2>
          <p>Approval records now load from Firestore. Decision actions remain disabled in this safe phase.</p>
        </div>
        <button type="button" class="cc-disabled" disabled>Review action: Coming later</button>
      </header>

      <p class="cc-message" *ngIf="!orgId()">Select an active organization to load approval items.</p>
      <p class="cc-message" *ngIf="state().loading">Loading approval queue…</p>
      <p class="cc-message" *ngIf="state().error === 'permission-denied'">You do not have permission to read approval items for this organization.</p>
      <p class="cc-message" *ngIf="!state().loading && !state().error && orgId() && !state().items.length">No approval item is waiting for review in this organization.</p>

      <div class="cc-list" *ngIf="state().items.length">
        <article *ngFor="let item of state().items">
          <div class="cc-list__top">
            <div>
              <h3>{{ item.title }}</h3>
              <p>{{ item.summary }}</p>
            </div>
            <span class="cc-status">{{ item.status }}</span>
          </div>
          <p class="cc-meta">Requested {{ item.requestedAt | date:'medium' }} by {{ item.requestedByUid }}</p>
          <button type="button" class="cc-disabled" disabled>Approve / Reject: Coming later</button>
        </article>
      </div>
    </section>
  `,
  styles: [
    `
      .cc-panel { border-radius: 18px; border: 1px solid #d7e4f0; background: rgba(255,255,255,.94); padding: 1rem; box-shadow: 0 10px 28px rgba(31, 77, 120, .08); }
      .cc-panel__head, .cc-list__top { display: flex; justify-content: space-between; gap: .8rem; align-items: start; }
      .cc-panel__head h2, .cc-list h3 { margin: 0; color: #11304f; }
      .cc-panel__head p, .cc-list p, .cc-message { margin: .35rem 0 0; color: #5d7c99; }
      .cc-list { display: grid; gap: .8rem; margin-top: 1rem; }
      .cc-list article { border-radius: 14px; border: 1px solid #e0ebf5; background: #fbfdff; padding: 1rem; }
      .cc-status { border-radius: 999px; background: #fff3dc; color: #805100; padding: .3rem .65rem; font-size: .76rem; font-weight: 800; text-transform: uppercase; }
      .cc-meta { font-size: .84rem; }
      .cc-disabled { margin-top: .75rem; border-radius: 10px; border: 1px solid #d8e4f0; background: #eef4fb; color: #5d7c99; padding: .5rem .7rem; font-weight: 700; }
    `,
  ],
})
export class ApprovalQueuePage {
  private readonly auth = inject(AuthService);
  private readonly service = inject(CommunicationCenterService);

  readonly profile = toSignal(this.auth.profile$, { initialValue: null });
  readonly orgId = computed(() => this.profile()?.orgId || null);
  readonly state = toSignal(toObservable(this.orgId).pipe(switchMap((orgId) => this.service.listApprovals(orgId))), {
    initialValue: { items: [], loading: true, error: null },
  });
}
