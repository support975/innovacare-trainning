// src/app/features/learner/woundLabrary/wound-labrary-table/wound-labrary-table.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { WoundType } from '../../../manager/wound.model';
import { WoundService } from '../../../manager/services/wound-service';

@Component({
  selector: 'app-wound-labrary-table',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  template: `
  <div class="resources-page">
    <header class="page-header">
      <div>
        <p class="page-eyebrow">Organization resources</p>
        <h1 class="page-title">Quick Practice Zone</h1>
        <p class="page-sub">
          Internal quick sheets for recurring tasks, refreshers and practical reminders. Only people in your organization can access these resources.
        </p>
      </div>
      <span class="resource-count">{{ filteredItems.length }} shown</span>
    </header>

    <section class="resource-panel">
      <div class="search-row">
        <div class="search-box">
          <mat-icon>search</mat-icon>
          <input [formControl]="searchControl" type="search" placeholder="Search quick sheets, tasks, tags or reminders" />
          <button *ngIf="searchControl.value" type="button" class="clear-search" (click)="searchControl.setValue('')" aria-label="Clear search">×</button>
        </div>
      </div>

      <div class="category-strip" aria-label="Resource categories">
        <span class="category-chip category-chip--active">Org quick sheets</span>
        <span class="category-chip">Created by your organization</span>
      </div>

      <div *ngIf="loading; else resourcesTpl" class="loading">
        <mat-progress-spinner diameter="36" mode="indeterminate"></mat-progress-spinner>
      </div>

      <ng-template #resourcesTpl>
        <div class="resource-grid" *ngIf="filteredItems.length; else emptyTpl">
          <article class="resource-card" *ngFor="let item of filteredItems; trackBy: trackById">
            <div class="resource-card__image" [class.resource-card__image--empty]="!item.images?.length">
              <img *ngIf="item.images?.length" [src]="item.images?.[0]" [alt]="item.name" (error)="onImgError($event)" />
              <mat-icon *ngIf="!item.images?.length">medical_services</mat-icon>
            </div>

            <div class="resource-card__body">
              <div class="resource-card__meta">
                <span>{{ item.category || 'Quick practice' }}</span>
              </div>
              <h2>{{ item.name }}</h2>
              <p>{{ item.shortDescription || item.fullDescription || 'Quick sheet details are available in the overview.' }}</p>

              <div class="tags" *ngIf="item.tags?.length || item.characteristics?.length">
                <span class="tag" *ngFor="let t of visibleLabels(item)">{{ t }}</span>
              </div>
            </div>

            <button class="btn-primary" type="button" (click)="openDetail(item.woundId)">
              Open quick sheet
            </button>
          </article>
        </div>

        <ng-template #emptyTpl>
          <div class="empty-state">
            <div class="empty-state__icon"><mat-icon>menu_book</mat-icon></div>
            <h2>No quick sheets found</h2>
            <p>Try a different search, or ask your administrator to publish quick practice content for your organization.</p>
          </div>
        </ng-template>
      </ng-template>
    </section>
  </div>
  `,
  styles: [`
    :host { display: block; }

    .resources-page {
      max-width: 1180px;
      margin: 0 auto;
      padding: 24px clamp(14px, 3vw, 32px);
      display: grid;
      gap: 22px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }

    .page-eyebrow {
      margin: 0 0 6px;
      color: #00a79d;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .page-title {
      margin: 0 0 6px;
      color: #1a3f6f;
      font-size: 28px;
      font-weight: 900;
      line-height: 1.15;
    }

    .page-sub {
      max-width: 760px;
      margin: 0;
      color: #5a6a7e;
      font-size: 14px;
      line-height: 1.6;
    }

    .resource-count {
      flex: 0 0 auto;
      padding: 6px 12px;
      border: 1px solid #c8d8f0;
      border-radius: 999px;
      background: #e8f0fb;
      color: #1a3f6f;
      font-size: 12px;
      font-weight: 900;
    }

    .resource-panel {
      overflow: hidden;
      border: 1px solid #e4ecf7;
      border-radius: 14px;
      background: #ffffff;
      box-shadow: 0 2px 12px rgba(26, 63, 111, 0.06);
    }

    .search-row {
      padding: 18px 20px;
      border-bottom: 1px solid #e4ecf7;
      background: #f8faff;
    }

    .search-box {
      position: relative;
      display: flex;
      align-items: center;
      max-width: 620px;
    }

    .search-box mat-icon {
      position: absolute;
      left: 12px;
      color: #8ea0b8;
      pointer-events: none;
    }

    .search-box input {
      width: 100%;
      min-height: 42px;
      padding: 9px 40px 9px 40px;
      border: 1px solid #d6e1f0;
      border-radius: 10px;
      outline: none;
      background: #ffffff;
      color: #1a2b4a;
      font: inherit;
      font-size: 14px;
    }

    .search-box input:focus {
      border-color: #00a79d;
      box-shadow: 0 0 0 3px rgba(0, 167, 157, 0.12);
    }

    .clear-search {
      position: absolute;
      right: 9px;
      width: 26px;
      height: 26px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: #8ea0b8;
      cursor: pointer;
      font-size: 20px;
      line-height: 1;
    }

    .clear-search:hover {
      background: #e8f0fb;
      color: #1a3f6f;
    }

    .category-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 14px 20px;
      border-bottom: 1px solid #e4ecf7;
    }

    .category-chip {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 4px 10px;
      border: 1px solid #e4ecf7;
      border-radius: 999px;
      background: #ffffff;
      color: #5a6a7e;
      font-size: 12px;
      font-weight: 800;
    }

    .category-chip--active {
      border-color: #9ae6d6;
      background: #e8f5f5;
      color: #00797a;
    }

    .resource-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 14px;
      padding: 18px 20px 20px;
    }

    .resource-card {
      display: flex;
      min-width: 0;
      min-height: 100%;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #e4ecf7;
      border-radius: 12px;
      background: #ffffff;
      transition: border-color 0.15s, box-shadow 0.15s;
    }

    .resource-card:hover {
      border-color: #c8d8f0;
      box-shadow: 0 6px 18px rgba(26, 63, 111, 0.08);
    }

    .resource-card__image {
      height: 150px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #f4f7fb;
      color: #8ea0b8;
    }

    .resource-card__image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .resource-card__image--empty {
      border-bottom: 1px dashed #d6e1f0;
    }

    .resource-card__body {
      flex: 1;
      padding: 14px;
      min-width: 0;
    }

    .resource-card__meta {
      margin-bottom: 6px;
      color: #00797a;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .resource-card h2 {
      margin: 0 0 8px;
      color: #1a3f6f;
      font-size: 17px;
      font-weight: 900;
      line-height: 1.25;
    }

    .resource-card p {
      margin: 0;
      color: #5a6a7e;
      font-size: 13px;
      line-height: 1.55;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 12px;
    }

    .tag {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border: 1px solid #e4ecf7;
      border-radius: 999px;
      background: #f4f7fb;
      color: #5a6a7e;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 800;
    }

    .btn-primary {
      margin: 0 14px 14px;
      min-height: 38px;
      border: 0;
      border-radius: 8px;
      background: #1a3f6f;
      color: #ffffff;
      font: inherit;
      font-size: 13px;
      font-weight: 900;
      cursor: pointer;
    }

    .btn-primary:hover {
      background: #0d2240;
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 56px 20px;
    }

    .empty-state {
      display: grid;
      justify-items: center;
      gap: 8px;
      padding: 56px 20px;
      text-align: center;
      color: #5a6a7e;
    }

    .empty-state__icon {
      display: grid;
      place-items: center;
      width: 46px;
      height: 46px;
      border-radius: 14px;
      background: #e8f0fb;
      color: #1a3f6f;
    }

    .empty-state h2 {
      margin: 4px 0 0;
      color: #1a3f6f;
      font-size: 18px;
    }

    .empty-state p {
      max-width: 420px;
      margin: 0;
      line-height: 1.5;
    }

    @media (max-width: 760px) {
      .resources-page {
        padding: 16px;
      }

      .page-header {
        flex-direction: column;
      }

      .resource-grid {
        grid-template-columns: 1fr;
        padding: 14px;
      }

      .search-row,
      .category-strip {
        padding-inline: 14px;
      }
    }
  `]
})
export class WoundLabraryTableComponent implements OnInit {
  items: WoundType[] = [];
  filteredItems: WoundType[] = [];
  loading = false;
  searchControl = new FormControl('');

  constructor(private svc: WoundService, private router: Router,private route: ActivatedRoute) {}
  ngOnInit(): void {
    this.load();

    this.searchControl.valueChanges.subscribe(q => {
      this.applyFilter(q);
    });
  }

  async load() {
    this.loading = true;
    try {
      const list = await this.svc.listWoundTypes();
      const active = list.filter(w => w.isActive !== false);
      this.items = active;
      this.applyFilter(this.searchControl.value);
    } catch (err) {
      console.error('Failed to load wound library', err);
      this.items = [];
      this.filteredItems = [];
    } finally {
      this.loading = false;
    }
  }

  applyFilter(q: string | null) {
    const term = (q || '').trim().toLowerCase();
    if (!term) {
      this.filteredItems = [...this.items];
      return;
    }

    this.filteredItems = this.items.filter((item) => {
      const haystack = [
        item.name,
        item.category,
        item.shortDescription,
        item.fullDescription,
        ...(item.tags || []),
        ...(item.characteristics || [])
      ].join(' ').toLowerCase();

      return haystack.includes(term);
    });
  }

  visibleLabels(item: WoundType): string[] {
    return [...(item.tags || []), ...(item.characteristics || [])].filter(Boolean).slice(0, 4);
  }

  trackById(_: number, item: WoundType) {
    return item.woundId || item.name;
  }

  openDetail(woundId?: string | undefined) {
    if (!woundId) return;
    // We're currently at .../wound, so navigate to the child route ':id'
    // which yields .../wound/:id. Use a path relative to the current ActivatedRoute.
    this.router.navigate([woundId], { relativeTo: this.route });
  }
  

  onImgError(ev: Event) {
    const img = ev.target as HTMLImageElement;
    img.style.display = 'none';
  }
}
