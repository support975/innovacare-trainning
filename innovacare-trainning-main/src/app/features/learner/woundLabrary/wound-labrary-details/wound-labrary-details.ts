// src/app/features/learner/woundLabrary/wound-labrary-details/wound-labrary-details.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

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
    private router: Router,
    private sanitizer: DomSanitizer
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

  selectedImage(wound: WoundType) {
    const images = wound.images || [];
    if (!images.length) return this.placeholder;
    return images[this.selected] || images[0] || this.placeholder;
  }

  onImgError(ev: Event) {
    const img = ev.target as HTMLImageElement;
    img.style.display = 'none';
  }

  safeVideoEmbedUrl(url: string): SafeResourceUrl | null {
    const embedUrl = this.videoEmbedUrl(url);
    return embedUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl) : null;
  }

  isDirectVideoUrl(url: string): boolean {
    return /\.(mp4|webm|ogg)(\?.*)?$/i.test(url || '');
  }

  videoLabel(url: string, index: number): string {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      return `Video ${index + 1} · ${host}`;
    } catch {
      return `Video ${index + 1}`;
    }
  }

  private videoEmbedUrl(rawUrl: string): string | null {
    try {
      const url = new URL(rawUrl);
      const host = url.hostname.replace(/^www\./, '').toLowerCase();

      if (host === 'youtu.be') {
        const id = url.pathname.split('/').filter(Boolean)[0];
        return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
      }

      if (host === 'youtube.com' || host === 'm.youtube.com') {
        const watchId = url.searchParams.get('v');
        if (watchId) return `https://www.youtube.com/embed/${encodeURIComponent(watchId)}`;

        const parts = url.pathname.split('/').filter(Boolean);
        const embedIndex = parts.findIndex(part => part === 'embed' || part === 'shorts');
        const id = embedIndex >= 0 ? parts[embedIndex + 1] : '';
        return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
      }

      if (host === 'vimeo.com' || host === 'player.vimeo.com') {
        const id = url.pathname.split('/').filter(part => /^\d+$/.test(part)).pop();
        return id ? `https://player.vimeo.com/video/${encodeURIComponent(id)}` : null;
      }
    } catch {
      return null;
    }

    return null;
  }
}
