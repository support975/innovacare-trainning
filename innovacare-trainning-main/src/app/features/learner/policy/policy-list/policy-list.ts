import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import {
  combineLatest,
  from,
  map,
  Observable,
  of,
  Subject,
  switchMap,
  takeUntil,
  tap,
  startWith,
  shareReplay,
} from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../../../core/auth';
import { PolicyService } from '../../../../shared/services/policy';
import { LanguageService } from '../../../../shared/services/language';

type PolicyVm = {
  id: string;
  title: string;
  category: string;
  version: string;
  effectiveDate: string;
  area: string;
  lastRevised: string;
  lastApproved: string;

  requiresAcknowledgement: boolean;
  blocking: boolean;
  acknowledged: boolean;

  preview: string;
};

@Component({
  selector: 'app-policy-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
  <div class="page">

    <div class="hero">
      <div class="hero-inner">
        <div class="hero-title">{{ t('policies.searchPolicies') }}</div>

        <div class="hero-search">
          <input
            class="search-input"
            [formControl]="qCtrl"
            [placeholder]="t('policies.searchPlaceholder')"
          />
          <button class="search-btn" (click)="noop()">
            <mat-icon>search</mat-icon>
          </button>
        </div>

        <!-- Export removed -->
        <div class="hero-actions"></div>
      </div>
    </div>

    <div class="card" *ngIf="accessDenied">
      <div class="empty">
        <div class="empty-title">{{ t('policies.title') }}</div>
        <div class="empty-sub">{{ t('policies.readPolicies') }}</div>
        <div class="empty-note">{{ t('policies.signInRequired') }}</div>
      </div>
    </div>

    <div class="loading" *ngIf="loading && !accessDenied">
      <mat-progress-spinner mode="indeterminate"></mat-progress-spinner>
    </div>

    <div class="card" *ngIf="!loading && !accessDenied">

      <div class="filters">
        <div class="pill-row">
          <button class="pill" [class.active]="scopeCtrl.value === 'TITLE'" (click)="scopeCtrl.setValue('TITLE')">{{ t('policies.titlesOnly') }}</button>
          <button class="pill" [class.active]="scopeCtrl.value === 'ALL'" (click)="scopeCtrl.setValue('ALL')">{{ t('policies.titlesAndContent') }}</button>
        </div>

        <div class="pill-row">
          <button class="pill" [class.active]="areaCtrl.value === 'ALL'" (click)="areaCtrl.setValue('ALL')">{{ t('policies.allAreas') }}</button>
          <button class="pill" [class.active]="ownerCtrl.value === 'ALL'" (click)="ownerCtrl.setValue('ALL')">{{ t('policies.allOwners') }}</button>
          <button class="pill" [class.active]="refCtrl.value === 'ALL'" (click)="refCtrl.setValue('ALL')">{{ t('policies.allReferences') }}</button>
        </div>

        <div class="count" *ngIf="(rows$ | async) as rows">
          {{ t('policies.results', { count: rows.length }) }}
        </div>
      </div>

      <div class="table-wrap" *ngIf="(rows$ | async) as rows">
        <div class="empty-note" *ngIf="rows.length === 0">{{ t('policies.noPoliciesFound') }}</div>

        <table class="table" *ngIf="rows.length">
          <thead>
            <tr>
              <th class="col-title">{{ t('policies.colTitle') }}</th>
              <th class="col-preview">{{ t('policies.colPreview') }}</th>
              <th class="col-area">{{ t('policies.colArea') }}</th>
              <th class="col-date">{{ t('policies.colLastRevised') }}</th>
              <th class="col-date">{{ t('policies.colEffective') }}</th>
              <th class="col-date">{{ t('policies.colLastApproved') }}</th>
            </tr>
          </thead>

          <tbody>
            <tr *ngFor="let p of rows">
              <td class="col-title">
                <div class="title-cell">
                  <a class="title-link" (click)="openPolicy(p.id)">{{ p.title }}</a>

                  <span class="mini-badge" *ngIf="p.requiresAcknowledgement">{{ t('policies.badgeAck') }}</span>
                  <span class="mini-badge warn" *ngIf="p.blocking">{{ t('policies.badgeBlocking') }}</span>
                  <span class="mini-badge ok" *ngIf="p.requiresAcknowledgement && p.acknowledged">{{ t('policies.badgeDone') }}</span>

                  <button
                    class="icon-btn"
                    *ngIf="isAdmin"
                    (click)="editPolicy(p.id)"
                    title="Edit"
                  >
                    <mat-icon>edit</mat-icon>
                  </button>
                </div>

                <div class="subline">
                  <span class="subpill">{{ p.category || '—' }}</span>
                  <span class="dot">•</span>
                  <span class="subpill">{{ p.version || '—' }}</span>
                </div>
              </td>

              <td class="col-preview">
                <div class="preview">{{ p.preview || '-' }}</div>
              </td>

              <td class="col-area"><div class="area">{{ p.area }}</div></td>
              <td class="col-date">{{ p.lastRevised }}</td>
              <td class="col-date">{{ p.effectiveDate }}</td>
              <td class="col-date">{{ p.lastApproved }}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  </div>
  `,
  styles: [`
    .page{ max-width: 1180px; margin: 0 auto; padding: 14px 12px 44px; }

    .hero{
      background: #eef7f4;
      border: 1px solid #d8ebe5;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 14px;
    }
    .hero-inner{
      display:grid;
      grid-template-columns: 1fr 520px 140px;
      align-items:center;
      gap: 12px;
    }
    @media (max-width: 980px){
      .hero-inner{ grid-template-columns: 1fr; }
    }
    .hero-title{
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
    }
    .hero-search{
      display:flex;
      align-items:center;
      width: 100%;
      background: white;
      border: 1px solid #dbe3e0;
      border-radius: 8px;
      overflow: hidden;
      height: 40px;
    }
    .search-input{
      border: none;
      outline: none;
      width: 100%;
      padding: 0 12px;
      font-size: 13px;
    }
    .search-btn{
      border: none;
      width: 44px;
      height: 40px;
      background: #0f3b38;
      color: #fff;
      cursor: pointer;
      display:flex;
      justify-content:center;
      align-items:center;
    }
    .hero-actions{ display:flex; justify-content:flex-end; }
    .export-btn{
      display:flex;
      align-items:center;
      gap: 8px;
      height: 40px;
      padding: 0 12px;
      border-radius: 8px;
      border: 1px solid #dbe3e0;
      background: white;
      cursor: pointer;
      font-size: 13px;
    }
    .export-btn:disabled{ opacity:.55; cursor:not-allowed; }

    .card{
      background: #fff;
      border: 1px solid #e6eaef;
      border-radius: 10px;
      overflow: hidden;
    }

    .empty{ padding: 18px; }
    .empty-title{ font-weight: 700; font-size: 18px; margin-bottom: 4px; }
    .empty-sub{ color:#64748b; margin-bottom: 10px; }
    .empty-note{ color:#64748b; padding: 12px 0; }

    .loading{ display:flex; justify-content:center; padding: 28px; }

    .filters{
      padding: 12px 14px;
      border-bottom: 1px solid #eef2f7;
      display:flex;
      justify-content:space-between;
      gap: 12px;
      flex-wrap: wrap;
      align-items:center;
    }
    .pill-row{ display:flex; gap: 8px; flex-wrap: wrap; }
    .pill{
      border: 1px solid #cfd8d6;
      background: #f8fafc;
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
      color:#0f172a;
    }
    .pill.active{
      border-color: #3b82f6;
      background: #eff6ff;
      color:#1d4ed8;
    }
    .count{ color:#475569; font-size: 12px; }

    .table-wrap{ padding: 8px 0 10px; }
    .table{
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    thead th{
      text-align:left;
      font-size: 12px;
      color:#475569;
      font-weight: 700;
      padding: 10px 14px;
      border-bottom: 1px solid #eef2f7;
      background: #fbfdff;
    }
    tbody td{
      padding: 14px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: top;
      font-size: 13px;
      color:#0f172a;
    }
    tbody tr:hover{ background:#fafcff; }

    .col-title{ width: 34%; }
    .col-preview{ width: 26%; }
    .col-area{ width: 18%; }
    .col-date{ width: 7.3%; }

    .title-cell{
      display:flex;
      align-items:center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .title-link{
      color:#1d4ed8;
      text-decoration: underline;
      cursor:pointer;
      font-weight: 600;
    }
    .subline{
      margin-top: 6px;
      color:#64748b;
      font-size: 12px;
      display:flex;
      gap: 8px;
      align-items:center;
      flex-wrap: wrap;
    }
    .subpill{
      border: 1px solid #e2e8f0;
      padding: 2px 8px;
      border-radius: 999px;
      background: #fff;
      color:#334155;
    }
    .dot{ color:#94a3b8; }

    .preview{
      color:#334155;
      font-size: 12px;
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .area{ color:#334155; font-size: 12px; }

    .mini-badge{
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      color:#334155;
      border-radius: 999px;
      padding: 1px 8px;
      font-size: 11px;
    }
    .mini-badge.warn{
      border-color: #f59e0b55;
      background: #fffbeb;
      color:#92400e;
    }
    .mini-badge.ok{
      border-color: #10b98155;
      background: #ecfdf5;
      color:#065f46;
    }

    .icon-btn{
      border:none;
      background: transparent;
      cursor: pointer;
      padding: 0;
      height: 24px;
      width: 24px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      color:#64748b;
    }
    .icon-btn:hover{ color:#0f172a; }
  `]
})
export class PolicyList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private languageService = inject(LanguageService);

  readonly t = (key: string, params?: Record<string, string | number>) => this.languageService.t(key, params);

  qCtrl = new FormControl<string>('', { nonNullable: true });
  scopeCtrl = new FormControl<'TITLE'|'ALL'>('TITLE', { nonNullable: true });

  // UI-only
  areaCtrl = new FormControl<string>('ALL', { nonNullable: true });
  ownerCtrl = new FormControl<string>('ALL', { nonNullable: true });
  refCtrl = new FormControl<string>('ALL', { nonNullable: true });

  rows$!: Observable<PolicyVm[]>;
  loading = true;
  accessDenied = false;

  uid = '';
  isAdmin = false;

  constructor(
    private auth: AuthService,
    private policySvc: PolicyService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const profile$ = this.auth.profile$.pipe(
      tap(p => {
        this.loading = !p;
        this.accessDenied = !p;
        this.uid = p?.uid ?? '';
        this.isAdmin = (p as any)?.role === 'admin';
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
      takeUntil(this.destroy$)
    );

    const signedIn$ = profile$.pipe(map(p => !!p));

    // Charge une seule fois (cache)
    const policies$ = signedIn$.pipe(
      switchMap(ok => ok
        ? from(this.policySvc.listPolicies({ includeArchived: false, limit: 1000 }))
        : of([])
      ),
      map(list => list.map(p => toPolicyVm(p))),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    // Inputs immédiats
    const q$ = this.qCtrl.valueChanges.pipe(
      startWith(this.qCtrl.value),
      map(v => v.trim().toLowerCase())
    );

    const scope$ = this.scopeCtrl.valueChanges.pipe(startWith(this.scopeCtrl.value));
    const area$  = this.areaCtrl.valueChanges.pipe(startWith(this.areaCtrl.value));

    // Filtrage synchrone (affichage immédiat)
    const filtered$ = combineLatest([policies$, q$, scope$, area$]).pipe(
      map(([policies, q, scope, area]) => {
        return policies.filter(p => {
          const title = (p.title || '').toLowerCase();
          const cat   = (p.category || '').toLowerCase();
          const ver   = (p.version || '').toLowerCase();
          const content = (p.preview || '').toLowerCase();

          const matchesQ =
            !q ||
            title.includes(q) ||
            cat.includes(q) ||
            ver.includes(q) ||
            (scope === 'ALL' && content.includes(q));

          const matchesArea = (area === 'ALL' || p.area === area);

          return matchesQ && matchesArea;
        });
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    // Ack en arrière-plan (ne bloque pas la recherche/affichage)
    this.rows$ = combineLatest([filtered$, profile$]).pipe(
      switchMap(([rows, prof]) => {
        if (!prof?.uid) return of(rows);

        return from(Promise.all(rows.map(async p => {
          if (!p.requiresAcknowledgement) return { ...p, acknowledged: true };
          const ok = await this.policySvc.ackExists(p.id, prof.uid);
          return { ...p, acknowledged: ok };
        })));
      }),
      tap(() => (this.loading = false)),
      takeUntil(this.destroy$)
    );

    // IMPORTANT: déclenche le chargement dès l’entrée sur la page
    // (sinon selon le timing Angular, la requête peut attendre un autre subscribe)
    this.rows$.pipe(takeUntil(this.destroy$)).subscribe();
  }

  openPolicy(id?: string) {
    if (!id) return;
    this.router.navigate(['/learner/policies', id]);
  }

  editPolicy(id?: string) {
    if (!id) return;
    this.router.navigate(['/manager/policy', id, 'edit']);
  }

  noop() {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

function sanitizeHtmlForPreview(html: string): string {
  const s = html || '';

  // Remove HEAD block entirely
  const noHead = s.replace(/<head[\s\S]*?<\/head>/gi, ' ');

  // Remove STYLE blocks entirely (content included)
  const noStyle = noHead.replace(/<style[\s\S]*?<\/style>/gi, ' ');

  // Remove SCRIPT blocks entirely (content included)
  const noScript = noStyle.replace(/<script[\s\S]*?<\/script>/gi, ' ');

  return noScript;
}

function stripHtml(html: string): string {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trunc(s: string, max = 220): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max).trim() + '…' : s;
}

function toPolicyVm(p: any): PolicyVm {
  const raw = p?.contentHtml || '';
  const cleaned = sanitizeHtmlForPreview(raw);
  const preview = trunc(stripHtml(cleaned), 220);

  return {
    id: p?.id || '',
    title: p?.title || '—',
    category: p?.category || '—',
    version: p?.version || '—',
    effectiveDate: p?.effectiveDate || '—',
    area: p?.area || '—',
    lastRevised: p?.lastRevised || '—',
    lastApproved: p?.lastApproved || '—',
    requiresAcknowledgement: !!p?.requiresAcknowledgement,
    blocking: !!p?.blocking,
    acknowledged: false,
    preview,
  };
}
