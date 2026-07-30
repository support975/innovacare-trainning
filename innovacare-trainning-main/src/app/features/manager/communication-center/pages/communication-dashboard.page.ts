import { CommonModule, CurrencyPipe, PercentPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { AuthService } from '../../../../core/auth';
import { CommunicationCenterService } from '../data/communication-center.service';

@Component({
  selector: 'app-communication-dashboard-page',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, PercentPipe],
  template: `
    <section class="cc-panel">
      <header class="cc-panel__head">
        <div>
          <h2>Executive overview</h2>
          <p>Live draft-only Firestore snapshot for the active organization.</p>
        </div>
        <button type="button" class="cc-disabled" disabled>Send provider: Coming later</button>
      </header>

      <p class="cc-message" *ngIf="!orgId()">Select an active organization to load Communication Center persistence.</p>
      <p class="cc-message" *ngIf="state().error === 'permission-denied'">You do not have permission to view this organization communication workspace.</p>
      <p class="cc-message" *ngIf="state().loading">Loading draft metrics…</p>

      <ng-container *ngIf="state().item as snapshot">
        <section class="cc-grid">
          <article>
            <span>Draft newsletters</span>
            <strong>{{ snapshot.draftNewsletters }}</strong>
          </article>
          <article>
            <span>Open rate</span>
            <strong>{{ openRate() | percent:'1.0-0' }}</strong>
          </article>
          <article>
            <span>Click rate</span>
            <strong>{{ clickRate() | percent:'1.0-0' }}</strong>
          </article>
          <article>
            <span>Revenue attribution</span>
            <strong>{{ snapshot.analytics.revenueAttributed | currency:'USD':'symbol':'1.0-0' }}</strong>
          </article>
        </section>
      </ng-container>
    </section>
  `,
  styles: [
    `
      .cc-panel { border-radius: 18px; border: 1px solid #d7e4f0; background: rgba(255,255,255,.94); padding: 1rem; box-shadow: 0 10px 28px rgba(31, 77, 120, .08); }
      .cc-panel__head { display: flex; justify-content: space-between; gap: .8rem; align-items: start; }
      .cc-panel__head h2 { margin: 0; color: #11304f; }
      .cc-panel__head p { margin: .35rem 0 0; color: #5a7897; }
      .cc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: .8rem; margin-top: 1rem; }
      .cc-grid article { border-radius: 14px; border: 1px solid #e0ebf5; background: #fbfdff; padding: 1rem; }
      .cc-grid span { display: block; text-transform: uppercase; letter-spacing: .08em; font-size: .72rem; font-weight: 800; color: #5d7c99; }
      .cc-grid strong { display: block; margin-top: .35rem; font-size: 1.6rem; color: #11304f; }
      .cc-disabled { border-radius: 10px; border: 1px solid #d8e4f0; background: #eef4fb; color: #5d7c99; padding: .55rem .75rem; font-weight: 700; }
      .cc-message { margin: 1rem 0 0; color: #5d7c99; }
    `,
  ],
})
export class CommunicationDashboardPage {
  private readonly auth = inject(AuthService);
  private readonly service = inject(CommunicationCenterService);

  readonly profile = toSignal(this.auth.profile$, { initialValue: null });
  readonly orgId = computed(() => this.profile()?.orgId || null);
  readonly state = toSignal(
    toObservable(this.orgId).pipe(switchMap((orgId) => this.service.getDashboardSnapshot(orgId))),
    { initialValue: { item: null, loading: true, error: null } },
  );
  readonly openRate = computed(() => {
    const snapshot = this.state().item;
    return snapshot && snapshot.analytics.sends ? snapshot.analytics.opens / snapshot.analytics.sends : 0;
  });
  readonly clickRate = computed(() => {
    const snapshot = this.state().item;
    return snapshot && snapshot.analytics.sends ? snapshot.analytics.clicks / snapshot.analytics.sends : 0;
  });
}
