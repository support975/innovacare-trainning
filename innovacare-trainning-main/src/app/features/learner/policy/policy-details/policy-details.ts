import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { combineLatest, from, map, Observable, of, switchMap } from 'rxjs';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../../../core/auth';
import { Policy } from '../model/policy.model';
import { PolicyService } from '../../../../shared/services/policy';
import { LanguageService } from '../../../../shared/services/language';
import { getAuth } from 'firebase/auth';

type TocItem = { id: string; text: string; level: 2 | 3 };

@Component({
  selector: 'app-policy-details',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatChipsModule,
    MatDividerModule,
    MatProgressSpinnerModule,
  ],
  template: `
  <div class="page" *ngIf="(vm$ | async) as vm">

    <!-- Top bar -->
    <div class="topbar">
      <div class="brand">
        <div class="brand-title">Innovacare Training</div>
        <div class="brand-sub">Policies</div>
      </div>

      <div class="top-actions">
        <button mat-stroked-button (click)="back()">{{ t('common.back') }}</button>
        <button mat-stroked-button (click)="print()">{{ t('common.print') }}</button>
        <button mat-stroked-button (click)="share(vm.policy?.id)">{{ t('common.share') }}</button>
      </div>
    </div>

    <!-- Loading -->
    <div *ngIf="vm.loading" class="loading">
      <mat-progress-spinner mode="indeterminate"></mat-progress-spinner>
    </div>

    <!-- Not found -->
    <mat-card *ngIf="!vm.loading && !vm.policy" class="card">
      <div class="empty">{{ t('policies.policyNotFound') }}</div>
    </mat-card>

    <!-- Main -->
    <ng-container *ngIf="!vm.loading && vm.policy">

      <!-- Header card -->
      <mat-card class="card header-card">
        <div class="header-grid">
          <div class="header-left">
            <div class="status-row">
              <span class="badge" [class.active]="vm.policy.status === 'active'">
                {{ vm.policy.status || 'active' }}
              </span>

              <span class="muted" *ngIf="vm.policy.owner">{{ t('policies.policyOwner') }}</span>
              <span class="pill" *ngIf="vm.policy.owner">{{ vm.policy.owner }}</span>
            </div>

            <h1 class="title">{{ vm.policy.title }}</h1>

            <div class="subtitle">
              <span class="pill">{{ vm.policy.category }}</span>
              <span class="dot">•</span>
              <span class="pill">{{ vm.policy.version }}</span>
              <span class="dot">•</span>
              <span class="muted">{{ t('policies.effective') }}</span> {{ vm.policy.effectiveDate }}
            </div>

            <div class="chip-row">
              <mat-chip-set>
                <mat-chip [disabled]="true" *ngIf="vm.policy.requiresAcknowledgement">{{ t('policies.chipAckRequired') }}</mat-chip>
                <mat-chip [disabled]="true" *ngIf="vm.policy.blocking">{{ t('policies.chipBlocking') }}</mat-chip>
                <mat-chip [disabled]="true" *ngIf="vm.acknowledged">{{ t('policies.chipAcknowledged') }}</mat-chip>
                <mat-chip [disabled]="true" *ngIf="vm.policy.requiresAcknowledgement && !vm.acknowledged">{{ t('policies.chipNotAcknowledged') }}</mat-chip>
              </mat-chip-set>
            </div>

            <div class="ackbar" *ngIf="vm.policy.requiresAcknowledgement">
              <button
                mat-raised-button
                color="primary"
                [disabled]="vm.busy || !vm.uid || vm.acknowledged"
                (click)="acknowledge(vm.policy)"
              >
                {{ vm.acknowledged ? t('policies.btnAcknowledged') : t('policies.btnAcknowledge') }}
              </button>

              <div class="acknote" *ngIf="!vm.uid">{{ t('policies.signInToAcknowledge') }}</div>
            </div>
          </div>

          <div class="header-right">
            <div class="meta">
              <div class="meta-row">
                <div class="k">{{ t('policies.metaCategory') }}</div>
                <div class="v">{{ vm.policy.category || '-' }}</div>
              </div>
              <div class="meta-row">
                <div class="k">{{ t('policies.metaArea') }}</div>
                <div class="v">{{ vm.policy.area || vm.policy.category || '-' }}</div>
              </div>
              <div class="meta-row">
                <div class="k">{{ t('policies.metaOwner') }}</div>
                <div class="v">{{ vm.policy.owner || '-' }}</div>
              </div>
              <div class="meta-row">
                <div class="k">{{ t('policies.metaLanguage') }}</div>
                <div class="v">{{ vm.policy.language || 'en' }}</div>
              </div>
              <div class="meta-row">
                <div class="k">{{ t('policies.metaLastRevised') }}</div>
                <div class="v">{{ vm.policy.lastRevised || '-' }}</div>
              </div>
              <div class="meta-row">
                <div class="k">{{ t('policies.metaNextReview') }}</div>
                <div class="v">{{ vm.policy.nextReview || '-' }}</div>
              </div>
            </div>
          </div>
        </div>
      </mat-card>

      <!-- Two columns -->
      <div class="layout">

        <!-- TOC -->
        <mat-card class="card toc" *ngIf="vm.toc?.length">
          <div class="toc-title">{{ t('policies.tableOfContents') }}</div>
          <a
            class="toc-item"
            *ngFor="let t of vm.toc"
            [class.l3]="t.level === 3"
            (click)="scrollTo(t.id)"
          >
            {{ t.text }}
          </a>
        </mat-card>

        <!-- Content -->
        <mat-card class="card content">
          <div class="content-title">{{ t('policies.policy') }}</div>
          <mat-divider></mat-divider>

          <div class="html" [innerHTML]="vm.safeHtml"></div>

          <ng-container *ngIf="vm.policy.referencesHtml">
            <div class="refs">
              <div class="content-title">{{ t('policies.references') }}</div>
              <mat-divider></mat-divider>
              <div class="html refs-html" [innerHTML]="vm.safeRefs"></div>
            </div>
          </ng-container>
        </mat-card>
      </div>
    </ng-container>
  </div>
  `,
  styles: [`
    .page{
      max-width: 1200px;
      margin: 18px auto;
      padding: 0 12px 40px;
    }

    .topbar{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:12px;
      margin-bottom: 12px;
    }
    .brand-title{ font-weight: 700; font-size: 14px; }
    .brand-sub{ color:#6b7280; font-size: 12px; }
    .top-actions{ display:flex; gap:10px; flex-wrap:wrap; }

    .loading{
      display:flex;
      justify-content:center;
      padding: 40px 0;
    }

    .card{
      border-radius: 12px;
      overflow: hidden;
      background: #fff;
      border: 1px solidrgb(88, 142, 250);
    }

    .empty{ padding: 18px; color:#6b7280; }

    /* Header */
    .header-card{ padding: 14px 16px; }
    .header-grid{
      display:grid;
      grid-template-columns: 1.6fr 1fr;
      gap: 16px;

    }
    @media (max-width: 980px){
      .header-grid{ grid-template-columns: 1fr; }
      .header-left{ margin-bottom: 12px; }
      .header-right{ margin-top: 12px; }
      .meta{ margin-top: 0; }
      .meta-row{ margin-bottom: 0; }
      .meta-row:last-child{ border-bottom: none; }
      .meta .k{ font-size: 12px; }

    }

    .status-row{
      display:flex;
      align-items:center;
      gap:10px;
      margin-bottom: 6px;
      flex-wrap: wrap;
      color:#374151;
    }
    .badge{
      display:inline-block;
      font-size: 12px;
      padding: 3px 10px;
      border-radius: 999px;
      border: 1px solid #e5e7eb;
      background: #f3f4f6;
      text-transform: capitalize;
    }
    .badge.active{
      background:rgb(228, 253, 241);
      border-color: #10b98133;
    }

    .pill{
      display:inline-block;
      font-size: 12px;
      padding: 2px 10px;
      border-radius: 999px;
      border: 1px solid #e5e7eb;
      background: #fff;
      color: #111827;
    }
    .muted{ color:#6b7280; font-size: 12px; }
    .dot{ color:#9ca3af; margin: 0 6px; }

    .title{
      margin: 6px 0 6px;
      font-size: 22px;
      line-height: 1.15;
      font-weight: 750;
      color:#111827;
    }
    .subtitle{
      display:flex;
      align-items:center;
      flex-wrap: wrap;
      gap: 6px;
      color:#374151;
      margin-bottom: 10px;
    }

    .chip-row{ margin-top: 10px; }

    .ackbar{
      margin-top: 12px;
      display:flex;
      align-items:center;
      flex-wrap: wrap;
      color: #374151;
      border-bottom: 1px solidrgb(197, 198, 202);
      border-color:rgba(103, 100, 244, 0.2)6, 185, 0.2);
    }
    .ackbar button:hover{ 
      background-color:rgb(208, 217, 249); 
      border-color:rgba(22, 20, 159, 0.2)6, 185, 0.2);
      color:#111827;
    }
    .ackbar button{
      cursor:pointer;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid #e5e7eb;
      background:rgb(211, 223, 247);
    
    }



    .acknote{ color:#6b7280; font-size: 12px; }

    .meta{
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 12px;
      background: #fafafa;
    }
    .meta-row{
      display:flex;
      justify-content:space-between;
      gap: 12px;
      padding: 6px 0;
      border-bottom: 1px dashed #e5e7eb;
    }
    .meta-row:last-child{ border-bottom: none; }
    .meta .k{ color:#6b7280; font-size: 12px; }
    .meta .v{ color:#111827; font-size: 12px; text-align:right; }

    /* Layout */
    .layout{
      margin-top: 14px;
      display:grid;
      grid-template-columns: 280px 1fr;
      gap: 14px;
      align-items:start;
    }
    @media (max-width: 980px){
      .layout{ grid-template-columns: 1fr; }
    }

    .toc{
      position: sticky;
      top: 10px;
      padding: 12px;
      max-height: calc(100vh - 40px);
      overflow: auto;
    }
    .toc-title{
      font-weight: 700;
      font-size: 13px;
      margin-bottom: 10px;
      color:#111827;
    }
    .toc-item{
      display:block;
      padding: 8px 8px;
      margin: 2px 0;
      border-radius: 8px;
      color:#111827;
      cursor:pointer;
      text-decoration:none;
      font-size: 13px;
    }
    .toc-item:hover{ background:#f3f4f6; }
    .toc-item.l3{ padding-left: 18px; color:#374151; font-size: 12px; }

    /* Content */
    .content{ padding: 12px 14px; }
    .content-title{
      font-weight: 800;
      font-size: 14px;
      color:#111827;
      margin-bottom: 8px;
    }

    /* HTML rendering */
    .html{
      padding-top: 12px;
      color:#111827;
      font-size: 14px;
      line-height: 1.65;
    }
    .html h2{
      margin: 18px 0 8px;
      font-size: 18px;
      line-height: 1.25;
    }
    .html h3{
      margin: 14px 0 6px;
      font-size: 18px;
      line-height: 1.25;
    }
    .html p{ margin: 10px 0; }
    .html ul, .html ol{ margin: 10px 0 10px 22px; }
    .html li{ margin: 6px 0; }
    .html a{ text-decoration: underline; }

    .refs{ margin-top: 18px; }
    .refs-html{ color:#374151; }
  `]
})
export class PolicyDetails implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private auth = inject(AuthService);
  private policySvc = inject(PolicyService);
  private languageService = inject(LanguageService);

  readonly t = (key: string, params?: Record<string, string | number>) => this.languageService.t(key, params);

  private busy = false;

  vm$!: Observable<{
    loading: boolean;
    busy: boolean;
    uid: string;
    policy: Policy | null;
    acknowledged: boolean;
    safeHtml: SafeHtml;
    safeRefs: SafeHtml;
    toc: TocItem[];
  }>;

  ngOnInit(): void {
    const uid$ = this.auth.profile$.pipe(map(p => p?.uid ?? ''));

    const policy$ = this.route.paramMap.pipe(
      map(pm => pm.get('id') || ''),
      switchMap(id => id ? from(this.policySvc.getPolicy(id)) : of(null))
    );

    const acknowledged$ = combineLatest([policy$, uid$]).pipe(
      switchMap(([policy, uid]) => {
        if (!policy) return of(false);
        if (!policy.requiresAcknowledgement) return of(true);
        if (!uid) return of(false);
        return from(this.policySvc.ackExists(policy.id!, uid));
      })
    );

    this.vm$ = combineLatest([policy$, uid$, acknowledged$]).pipe(
      map(([policy, uid, acknowledged]) => {
        const processed = processHtmlForToc(policy?.contentHtml || '');
        const safeHtml = this.sanitizer.bypassSecurityTrustHtml(processed.html);
        const safeRefs = this.sanitizer.bypassSecurityTrustHtml(policy?.referencesHtml || '');
        return {
          loading: false,
          busy: this.busy,
          uid,
          policy,
          acknowledged,
          safeHtml,
          safeRefs,
          toc: processed.toc
        };
      })
    );
  }

  back() {
    this.router.navigate(['../'], { relativeTo: this.route });
  }

  

  scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  print() {
    window.print();
  }

  async share(policyId?: string) {
    const url = policyId ? `${location.origin}/policy/${policyId}` : location.href;
    try {
      // @ts-ignore
      if (navigator.share) {
        // @ts-ignore
        await navigator.share({ title: 'Policy', url });
      } else {
        await navigator.clipboard.writeText(url);
        alert('Link copied to clipboard.');
      }
    } catch {
      // ignore
    }
  }

  async acknowledge(policy: Policy) {
    const uid = getAuth().currentUser?.uid;
    if (!uid || !policy?.id) return;

    this.busy = true;
    try {
      await this.policySvc.acknowledge({
        policyId: policy.id,
        policyVersion: policy.version,
        userId: uid,
      });
      // refresh state
      this.router.navigate([], { relativeTo: this.route });
    } finally {
      this.busy = false;
    }
  }
}

/** Adds ids to h2/h3 and returns a Table of Contents */
function processHtmlForToc(html: string): { html: string; toc: TocItem[] } {
  if (!html) return { html: '', toc: [] };

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const headings = Array.from(doc.querySelectorAll('h2, h3'));
    const toc: TocItem[] = [];

    let idx = 0;
    for (const h of headings) {
      const tag = h.tagName.toLowerCase();
      const level = (tag === 'h3' ? 3 : 2) as 2 | 3;

      const text = (h.textContent || '').trim();
      if (!text) continue;

      // ensure stable id
      const base = slugify(text);
      const id = h.id && h.id.trim() ? h.id.trim() : `${base}-${++idx}`;
      h.id = id;

      toc.push({ id, text, level });
    }

    return { html: doc.body.innerHTML, toc };
  } catch {
    return { html, toc: [] };
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'section';
}
