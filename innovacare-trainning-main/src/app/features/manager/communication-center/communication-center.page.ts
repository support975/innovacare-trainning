import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { switchMap } from 'rxjs/operators';
import { AuthService } from '../../../core/auth';
import { CommunicationCenterService } from './data/communication-center.service';

@Component({
  selector: 'app-communication-center-page',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, CurrencyPipe],
  template: `
    <section class="cc-shell">
      <header class="cc-hero">
        <div>
          <p class="cc-kicker">Communication Center</p>
          <h1>Draft-only persistence</h1>
          <p class="cc-copy">Newsletter, campaign, segment, template, approval and audit data now load from Firestore with org-scoped safety.</p>
          <p class="cc-scope">Scope: <strong>{{ scopeLabel() }}</strong></p>
        </div>
        <div class="cc-guardrail">
          <span>Guardrails</span>
          <strong>No send provider. No auto-send. No production automation.</strong>
          <p>Provider actions remain disabled and labeled Coming later.</p>
        </div>
      </header>

      <section class="cc-metrics" *ngIf="orgId(); else noScopeTpl">
        <article *ngIf="snapshotState().item as snapshot; else loadingMetricTpl">
          <span>Draft newsletters</span>
          <strong>{{ snapshot.draftNewsletters }}</strong>
        </article>
        <article *ngIf="snapshotState().item as snapshot; else loadingMetricTpl">
          <span>Pending approvals</span>
          <strong>{{ snapshot.pendingApprovals }}</strong>
        </article>
        <article *ngIf="snapshotState().item as snapshot; else loadingMetricTpl">
          <span>Revenue attribution</span>
          <strong>{{ snapshot.analytics.revenueAttributed | currency:'USD':'symbol':'1.0-0' }}</strong>
        </article>
      </section>

      <nav class="cc-nav">
        <a routerLink="dashboard" routerLinkActive="active">Dashboard</a>
        <a routerLink="newsletters" routerLinkActive="active">Newsletters</a>
        <a routerLink="campaigns" routerLinkActive="active">Campaigns</a>
        <a routerLink="audience-builder" routerLinkActive="active">Audience Builder</a>
        <a routerLink="ai-content-studio" routerLinkActive="active">AI Content Studio</a>
        <a routerLink="approval-queue" routerLinkActive="active">Approval Queue</a>
        <a routerLink="analytics" routerLinkActive="active">Analytics</a>
      </nav>

      <main class="cc-content">
        <router-outlet></router-outlet>
      </main>

      <ng-template #noScopeTpl>
        <p class="cc-notice">Select an active organization scope to load persisted Communication Center drafts.</p>
      </ng-template>
      <ng-template #loadingMetricTpl>
        <article><span>Loading</span><strong>…</strong></article>
      </ng-template>
    </section>
  `,
  styles: [
    `
      .cc-shell { min-height: 100%; display: grid; gap: 1rem; padding: 1.25rem; background: linear-gradient(180deg, #f7fbff 0%, #eef4fb 100%); }
      .cc-hero { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; background: linear-gradient(135deg, #12375b 0%, #1d5e8e 60%, #53a3c5 100%); color: #fff; border-radius: 18px; padding: 1.25rem 1.35rem; box-shadow: 0 20px 44px rgba(18, 55, 91, 0.18); }
      .cc-kicker { margin: 0 0 .35rem; text-transform: uppercase; letter-spacing: .12em; font-size: .74rem; font-weight: 800; opacity: .84; }
      .cc-hero h1 { margin: 0 0 .4rem; font-size: clamp(1.7rem, 2vw, 2.35rem); }
      .cc-copy { margin: 0; max-width: 48rem; color: rgba(255,255,255,.88); }
      .cc-scope { margin: .85rem 0 0; color: rgba(255,255,255,.88); }
      .cc-guardrail { border-radius: 16px; padding: 1rem; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.18); }
      .cc-guardrail span { display: block; text-transform: uppercase; letter-spacing: .08em; font-size: .74rem; font-weight: 800; opacity: .85; }
      .cc-guardrail strong { display: block; margin-top: .35rem; font-size: 1rem; }
      .cc-guardrail p { margin: .45rem 0 0; color: rgba(255,255,255,.82); }
      .cc-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: .8rem; }
      .cc-metrics article { border-radius: 16px; border: 1px solid #d8e4f0; background: #fff; padding: 1rem; box-shadow: 0 8px 24px rgba(31, 77, 120, .08); }
      .cc-metrics span { display: block; color: #567595; text-transform: uppercase; letter-spacing: .08em; font-size: .72rem; font-weight: 800; }
      .cc-metrics strong { display: block; margin-top: .35rem; color: #11304f; font-size: 1.7rem; }
      .cc-nav { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .6rem; }
      .cc-nav a { text-decoration: none; text-align: center; border-radius: 12px; border: 1px solid #d0dfef; background: #fff; padding: .7rem .8rem; color: #20486d; font-weight: 800; }
      .cc-nav a.active { background: #11304f; border-color: #11304f; color: #f6fbff; }
      .cc-content { display: grid; }
      .cc-notice { margin: 0; color: #4e6b88; }
      @media (max-width: 900px) { .cc-hero { grid-template-columns: 1fr; } }
    `,
  ],
})
export class CommunicationCenterPage {
  private readonly auth = inject(AuthService);
  private readonly service = inject(CommunicationCenterService);

  readonly profile = toSignal(this.auth.profile$, { initialValue: null });
  readonly orgId = computed(() => this.profile()?.orgId || null);
  readonly scopeLabel = computed(() => this.orgId() ? `Organization ${this.orgId()}` : 'No active organization selected');
  readonly snapshotState = toSignal(
    toObservable(this.orgId).pipe(switchMap((orgId) => this.service.getDashboardSnapshot(orgId))),
    { initialValue: { item: null, loading: true, error: null } },
  );
}
