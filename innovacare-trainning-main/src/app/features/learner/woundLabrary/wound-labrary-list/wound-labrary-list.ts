// src/app/features/learner/woundLabrary/wound-labrary-table/wound-labrary-table.component.ts
import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatInputModule } from '@angular/material/input';
// removed: import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
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
    // Material
    MatTableModule,
    MatPaginatorModule,
    MatInputModule,
    // MatChipsModule removed
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  template: `
  <div class="container">
    <h1>Wound Library</h1>

    <div class="toolbar">
      <mat-form-field appearance="outline" class="search">
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [formControl]="searchControl" placeholder="Search wound types, tags or characteristics">
      </mat-form-field>
    </div>

    <div class="table-wrap" *ngIf="!loading; else loadingTpl">
      <table mat-table [dataSource]="dataSource" class="mat-elevation-z1" matSort>

        <!-- Thumbnail Column -->
        <ng-container matColumnDef="thumb">
          <th mat-header-cell *matHeaderCellDef> </th>
          <td mat-cell *matCellDef="let element">
            <img class="thumb" [src]="element.images?.[0] || placeholder" (error)="onImgError($event)" />
          </td>
        </ng-container>

        <!-- Name -->
        <ng-container matColumnDef="name">
          <th mat-header-cell *matHeaderCellDef> Name </th>
          <td mat-cell *matCellDef="let element"> <strong>{{ element.name }}</strong> </td>
        </ng-container>

        <!-- Category -->
        <ng-container matColumnDef="category">
          <th mat-header-cell *matHeaderCellDef> Category </th>
          <td mat-cell *matCellDef="let element"> {{ element.category || '-' }} </td>
        </ng-container>

        <!-- Tags (replaced mat-chips with simple spans) -->
        <ng-container matColumnDef="tags">
          <th mat-header-cell *matHeaderCellDef> Tags </th>
          <td mat-cell *matCellDef="let element">
            <div class="tags" *ngIf="element.tags?.length">
              <span class="tag"  *ngFor="let t of element.tags">{{ t }}</span>
            </div>
          </td>
        </ng-container>

        <!-- Short description -->
        <ng-container matColumnDef="shortDescription">
          <th mat-header-cell *matHeaderCellDef> Summary </th>
          <td mat-cell *matCellDef="let element"> {{ element.shortDescription || '-' }} </td>
        </ng-container>

        <!-- Actions -->
        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef> </th>
          <td mat-cell *matCellDef="let element">
            <button mat-stroked-button color="primary" (click)="openDetail(element.woundId)" >Overview</button>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
      </table>

      <mat-paginator #paginator [pageSize]="10" [pageSizeOptions]="[5,10,25]"></mat-paginator>
      <div *ngIf="dataSource.data.length === 0" class="empty">No wound types found.</div>
    </div>

    <ng-template #loadingTpl>
      <div class="loading"><mat-progress-spinner mode="indeterminate"></mat-progress-spinner></div>
    </ng-template>
  </div>
  `,
  styles: [`
    .container { max-width:1100px; margin: 20px auto; padding: 8px; }
    h1 { margin-bottom: 12px; }
    .toolbar { display:flex; justify-content:flex-end; margin-bottom:12px; }
    .search { width: 360px; }
    .table-wrap { overflow: auto; }
    table { width: 100%; min-width: 800px; }
    .thumb { height:48px; width:auto; border-radius:4px; border:1px solid #ddd; }
    /* tag styles replacing mat-chips */
    .tags { display:flex; flex-wrap:wrap; gap:6px; }
    .tag {
      display:inline-block;
      background:#e0e7ff;
      color:#1f2a8a;
      padding:4px 8px;
      border-radius:12px;
      font-size:0.8rem;
      line-height:1;
      border: 1px solid rgba(31,42,138,0.08);
    }
    .chip { margin-right:4px; } /* kept if any older styles reference it */
    .empty { text-align:center; color:#666; padding:12px 0; }
    .loading { display:flex; justify-content:center; padding:40px 0; }
    @media (max-width: 900px) {
      .search { width: 100%; }
      table { min-width: 700px; }
    }
  `]
})
export class WoundLabraryTableComponent implements OnInit {
  displayedColumns: string[] = ['thumb', 'name', 'category', 'tags', 'shortDescription', 'actions'];
  dataSource = new MatTableDataSource<WoundType>([]);
  loading = false;
  placeholder = 'assets/wound-placeholder.png';
  searchControl = new FormControl('');

  @ViewChild(MatPaginator, { static: true }) paginator!: MatPaginator;

  constructor(private svc: WoundService, private router: Router,private route: ActivatedRoute) {}
  ngOnInit(): void {
    this.dataSource.paginator = this.paginator;
    this.load();

    // set up filter to search name, summary, tags, characteristics
    this.dataSource.filterPredicate = (data: WoundType, filter: string) => {
      const term = filter.trim().toLowerCase();
      const inName = (data.name || '').toLowerCase().includes(term);
      const inShort = (data.shortDescription || '').toLowerCase().includes(term);
      const inTags = (data.tags || []).some(t => t.toLowerCase().includes(term));
      const inChars = (data.characteristics || []).some(c => c.toLowerCase().includes(term));
      return inName || inShort || inTags || inChars;
    };

    this.searchControl.valueChanges.subscribe(q => {
      this.applyFilter(q);
    });
  }

  async load() {
    this.loading = true;
    try {
      const list = await this.svc.listWoundTypes();
      const active = list.filter(w => w.isActive !== false);
      this.dataSource.data = active;
    } catch (err) {
      console.error('Failed to load wound library', err);
      this.dataSource.data = [];
    } finally {
      this.loading = false;
    }
  }

  applyFilter(q: string | null) {
    this.dataSource.filter = (q || '').trim().toLowerCase();
    // reset to first page after filter
    if (this.dataSource.paginator) this.dataSource.paginator.firstPage();
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
