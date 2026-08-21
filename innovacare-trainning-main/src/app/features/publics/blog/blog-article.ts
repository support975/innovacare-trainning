import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { map, of, switchMap } from 'rxjs';

import { PublicSiteNavComponent } from '../../../shared/components/public-site-nav/public-site-nav';
import { PublicTranslateDirective } from '../../../shared/directives/public-translate.directive';
import { PublicBlogService } from './blog.service';
import { MarketingArticle } from '../../superAdmin/services/content-studio.service';

@Component({
  selector: 'app-public-blog-article',
  standalone: true,
  imports: [CommonModule, RouterModule, PublicSiteNavComponent, PublicTranslateDirective],
  template: `
    <app-public-site-nav
      page="blog"
      contextLabel="Ressources marketing"
      contextValue="Articles pour les responsables de formation"
      mobileMetaLabel="Blogue public"
      mobileMetaValue="Formation, conformité et opérations"
    ></app-public-site-nav>

    <main class="article-page" appPublicTranslate>
      <ng-container *ngIf="loading()">
        <div class="state-card">Chargement de l'article…</div>
      </ng-container>

      <ng-container *ngIf="notFound()">
        <div class="state-card">
          <h1>Article introuvable</h1>
          <p>Cet article n'existe pas ou n'est plus publié.</p>
          <a routerLink="/blog" class="back-link">← Retour au blogue</a>
        </div>
      </ng-container>

      <article class="article" *ngIf="article() as a">
        <a routerLink="/blog" class="back-link">← Retour au blogue</a>

        <header class="article-header">
          <p class="eyebrow" *ngIf="a.category">{{ a.category }}</p>
          <h1>{{ a.title }}</h1>
          <div class="meta-row">
            <span *ngIf="a.author">{{ a.author }}</span>
            <span class="dot" *ngIf="a.author"></span>
            <span>{{ a.readingMinutes || 1 }} min de lecture</span>
          </div>
        </header>

        <div class="hero-image" *ngIf="a.heroImageUrl">
          <img [src]="a.heroImageUrl" [alt]="a.heroImageAlt || a.title" />
        </div>

        <div class="article-body" [innerHTML]="bodyHtml()"></div>

        <div class="tag-row" *ngIf="a.tags?.length">
          <span *ngFor="let tag of a.tags">{{ tag }}</span>
        </div>

        <section class="share">
          <span>Partager :</span>
          <a [href]="shareLinks().linkedin" target="_blank" rel="noopener" aria-label="Partager sur LinkedIn">LinkedIn</a>
          <a [href]="shareLinks().facebook" target="_blank" rel="noopener" aria-label="Partager sur Facebook">Facebook</a>
          <a [href]="shareLinks().whatsapp" target="_blank" rel="noopener" aria-label="Partager sur WhatsApp">WhatsApp</a>
        </section>

        <section class="cta-band">
          <h2>Prêt à moderniser la formation de votre équipe ?</h2>
          <p>Découvrez comment Innovacare Training simplifie la conformité et la montée en compétence.</p>
          <a routerLink="/pricing" class="cta-button">Voir les tarifs</a>
        </section>
      </article>
    </main>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: #f7f9fc;
      color: #10213f;
    }

    .article-page {
      max-width: 760px;
      margin: 0 auto;
      padding: 40px 24px 96px;
    }

    .state-card {
      max-width: 640px;
      margin: 40px auto;
      border: 1px solid #dbe3ef;
      border-radius: 8px;
      background: #fff;
      padding: 32px;
      text-align: center;
    }

    .back-link {
      display: inline-flex;
      color: #075fc7;
      font-weight: 800;
      text-decoration: none;
      margin-bottom: 24px;
    }

    .article-header {
      margin-bottom: 24px;
    }

    .eyebrow {
      margin: 0 0 10px;
      color: #0f766e;
      font-size: 0.78rem;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      font-size: clamp(1.9rem, 4vw, 2.9rem);
      line-height: 1.1;
    }

    .meta-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 14px;
      color: #51627a;
      font-size: 0.92rem;
      font-weight: 600;
    }

    .dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #b7c2d4;
    }

    .hero-image {
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 28px;
      aspect-ratio: 16 / 9;
      background: linear-gradient(135deg, #0d2240, #0f766e);
    }

    .hero-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .article-body {
      color: #26364f;
      line-height: 1.75;
      font-size: 1.05rem;
    }

    .article-body :is(h2, h3) {
      color: #10213f;
      margin: 1.8em 0 0.6em;
      line-height: 1.25;
    }

    .article-body h2 { font-size: 1.5rem; }
    .article-body h3 { font-size: 1.2rem; }

    .article-body p { margin: 0 0 1.1em; }

    .article-body ul,
    .article-body ol {
      margin: 0 0 1.1em;
      padding-left: 1.4em;
    }

    .article-body li { margin-bottom: 0.4em; }

    .article-body a {
      color: #075fc7;
      font-weight: 700;
    }

    .article-body img {
      max-width: 100%;
      border-radius: 8px;
      margin: 1.2em 0;
    }

    .tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 32px;
    }

    .tag-row span {
      border-radius: 999px;
      background: #edf7f6;
      color: #0f766e;
      font-size: 0.78rem;
      font-weight: 800;
      padding: 6px 12px;
    }

    .share {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #dbe3ef;
      font-size: 0.88rem;
      color: #51627a;
      font-weight: 700;
    }

    .share a {
      color: #075fc7;
      text-decoration: none;
    }

    .cta-band {
      margin-top: 48px;
      padding: 32px;
      border-radius: 12px;
      background: linear-gradient(135deg, #0d2240, #0f766e);
      color: #fff;
      text-align: center;
    }

    .cta-band h2 {
      margin: 0 0 8px;
      font-size: 1.4rem;
    }

    .cta-band p {
      margin: 0 0 20px;
      opacity: 0.9;
    }

    .cta-button {
      display: inline-flex;
      padding: 12px 24px;
      border-radius: 999px;
      background: #fff;
      color: #0d2240;
      font-weight: 800;
      text-decoration: none;
    }

    @media (max-width: 640px) {
      .article-page {
        padding: 28px 16px 64px;
      }
    }
  `],
})
export class PublicBlogArticleComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly blog = inject(PublicBlogService);
  private readonly sanitizer = inject(DomSanitizer);

  // null = still loading, undefined = not found / not published, else the article.
  private readonly articleResult = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get('slug') ?? ''),
      switchMap((slug) => (slug ? this.blog.getBySlug(slug) : of(undefined))),
      map((article): MarketingArticle | undefined | null => article)
    ),
    { initialValue: null as MarketingArticle | undefined | null }
  );

  readonly loading = computed(() => this.articleResult() === null);
  readonly article = computed(() => this.articleResult() || null);
  readonly notFound = computed(() => !this.loading() && !this.article());

  readonly bodyHtml = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.article()?.bodyHtml || '')
  );

  readonly shareLinks = computed(() => {
    const url = encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '');
    const title = encodeURIComponent(this.article()?.title || 'Innovacare Training');
    return {
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      whatsapp: `https://wa.me/?text=${title}%20${url}`,
    };
  });
}
