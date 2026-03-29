// src/app/features/learner/woundLabrary/wound-labrary-details/wound-labrary-details.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { WoundType } from '../../../manager/wound.model';
import { WoundService } from '../../../manager/services/wound-service';

@Component({
  selector: 'app-wound-library-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    // Material
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatListModule,
    MatProgressSpinnerModule,
    
  ],
  templateUrl: './wound-labrary-details.html',
  styleUrl: './wound-labrary-details.css'
})
export class WoundLibraryDetailComponent implements OnInit {
  wound?: WoundType | null = null;
  loading = true;
  selected = 0;
  placeholder = 'assets/wound-placeholder.png';

  constructor(
    private route: ActivatedRoute,
    private svc: WoundService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.load(id);
    else this.loading = false;
  }

  async load(id: string) {
    this.loading = true;
    try {
      this.wound = await this.svc.getWoundType(id);
    } catch (err) {
      console.error('Failed to load wound type', err);
      this.wound = null;
    } finally {
      this.loading = false;
      // reset selected thumbnail when new wound loads
      this.selected = 0;
    }
  }

  back() {
    this.router.navigate(['/learner/wound']);
  }

  selectThumbnail(i: number) {
    // guard against invalid index or missing images
    if (!this.wound?.images) return;
    if (i >= 0 && i < this.wound.images.length) this.selected = i;
  }

  onImgError(ev: Event) {
    const img = ev.target as HTMLImageElement;
    img.style.display = 'none';
  }
}
