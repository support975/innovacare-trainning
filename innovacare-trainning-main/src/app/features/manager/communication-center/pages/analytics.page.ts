import { CommonModule, CurrencyPipe, PercentPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { AuthService } from '../../../../core/auth';
import { CommunicationCenterService } from '../data/communication-center.service';

@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [CommonModule, PercentPipe, CurrencyPipe],
  template: `
    <section class="cc-panel">
      <header class="cc-panel__head">
        <div>
          <h2>Analytics</h2>
          <p>Newsletter analytics now read from Firestore preview data only.</p>
        </div>
      </header>

      <p class="cc-message" *ngIf="!orgId()">Select an active organization to load analytics.</p>
      <p class="cc-message" *ngIf="state().loading">Loading analytics…</p>
      <p class="cc-message" *ngIf="state().error === 'permission-denied'">You do not have permission to read analytics for this organization.</p>

      <section class="cc-grid" *ngIf="state().item as snapshot">
        <article>
          <span>Sends</span>
          <strong>{{ snapshot.analytics.sends }}</strong>
        </article>
        <article>
          <span>Opens</span>
          <strong>{{ snapshot.analytics.opens }}</strong>
        </article>
        <article>
          <span>Clicks</span>
          <strong>{{ snapshot.analytics.clicks }}</strong>
        </article>
        <article>
          <span>Unsubscribes</span>
          <strong>{{ snapshot.analytics.unsubscribes }}</strong>
        </article>
        <article>
          <span>Open rate</span>
          <strong>{{ openRate() | percent:'1.0-0' }}</strong>
        </article>
        <article>
          <span>Revenue attribution</span>
          <strong>{{ snapshot.analytics.revenueAttributed | currency:'USD':'symbol':'1.0-0' }}</strong>
        </article>
      </section>
    </section>
  `,
  styles: [
    `
      .cc-panel { border-radius: 18px; border: 1px solid #d7e4f0; background: rgba(255,255,255,.94); padding: 1rem; box-shadow: 0 10px 28px rgba(31, 77, 120, .08); }
      .cc-panel__head h2 { margin: 0; color: #11304f; }
      .cc-panel__head p, .cc-message { margin: .35rem 0 0; color: #5d7c99; }
      .cc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: .8rem; margin-top: 1rem; }
      .cc-grid article { border-radius: 14px; border: 1px solid #e0ebf5; background: #fbfdff; padding: 1rem; }
      .cc-grid span { display: block; text-transform: uppercase; letter-spacing: .08em; font-size: .72rem; font-weight: 800; color: #5d7c99; }
      .cc-grid strong { display: block; margin-top: .35rem; color: #11304f; font-size: 1.55rem; }
    `,
  ],
})
export class AnalyticsPage {
  private readonly auth = inject(AuthService);
  private readonly service = inject(CommunicationCenterService);

  readonly profile = toSignal(this.auth.profile$, { initialValue: null });
  readonly orgId = computed(() => this.profile()?.orgId || null);
  readonly state = toSignal(toObservable(this.orgId).pipe(switchMap((orgId) => this.service.getDashboardSnapshot(orgId))), {
    initialValue: { item: null, loading: true, error: null },
  });
  readonly openRate = computed(() => {
    const snapshot = this.state().item;
    return snapshot && snapshot.analytics.sends ? snapshot.analytics.opens / snapshot.analytics.sends : 0;
  });
}
