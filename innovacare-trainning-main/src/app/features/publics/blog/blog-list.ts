import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { PublicSiteNavComponent } from '../../../shared/components/public-site-nav/public-site-nav';
import { PublicTranslateDirective } from '../../../shared/directives/public-translate.directive';
import { PublicBlogService } from './blog.service';

@Component({
  selector: 'app-public-blog-list',
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

    <main class="blog-page" appPublicTranslate>
      <section class="blog-hero">
        <p class="eyebrow">Perspectives Innovacare</p>
        <h1>Des articles pour mieux former, se conformer et préparer les équipes</h1>
        <p>
          Des ressources pratiques pour les équipes de santé, les entreprises de services, les responsables RH et les organisations qui bâtissent des opérations de formation plus solides.
        </p>
      </section>

      <section class="article-grid" *ngIf="articles().length; else emptyState">
        <article class="article-card" *ngFor="let article of articles()">
          <a class="media" [routerLink]="['/blog', article.slug]" [attr.aria-label]="article.title">
            <img *ngIf="article.heroImageUrl" [src]="article.heroImageUrl" [alt]="article.heroImageAlt || article.title" />
            <span *ngIf="!article.heroImageUrl">{{ article.category || 'Innovacare Training' }}</span>
          </a>
          <div class="content">
            <div class="meta">
              <span>{{ article.category }}</span>
              <span>{{ article.readingMinutes || 1 }} min de lecture</span>
            </div>
            <h2><a [routerLink]="['/blog', article.slug]">{{ article.title }}</a></h2>
            <p>{{ article.excerpt || article.metaDescription }}</p>
            <div class="tag-row" *ngIf="article.tags?.length">
              <span *ngFor="let tag of article.tags.slice(0, 4)">{{ tag }}</span>
            </div>
            <a class="read-link" [routerLink]="['/blog', article.slug]">Lire l'article</a>
          </div>
        </article>
      </section>

      <ng-template #emptyState>
        <section class="empty-state">
          <h2>Les articles arrivent bientôt</h2>
          <p>Le studio de contenu est prêt. Les articles marketing publiés apparaîtront automatiquement ici.</p>
        </section>
      </ng-template>
    </main>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: #f7f9fc;
      color: #10213f;
    }

    .blog-page {
      max-width: 1180px;
      margin: 0 auto;
      padding: 48px 24px 72px;
    }

    .blog-hero {
      max-width: 880px;
      margin-bottom: 34px;
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
      font-size: clamp(2.3rem, 5vw, 4.6rem);
      line-height: 0.98;
      letter-spacing: 0;
    }

    .blog-hero p {
      max-width: 760px;
      margin: 18px 0 0;
      color: #51627a;
      font-size: 1.08rem;
      line-height: 1.7;
    }

    .article-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
    }

    .article-card {
      overflow: hidden;
      border: 1px solid #dbe3ef;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 12px 34px rgba(15, 23, 42, 0.07);
    }

    .media {
      display: grid;
      place-items: center;
      aspect-ratio: 16 / 9;
      background: linear-gradient(135deg, #0d2240, #0f766e);
      color: #fff;
      font-weight: 900;
      text-decoration: none;
      text-align: center;
      padding: 20px;
    }

    .media img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .content {
      padding: 18px;
    }

    .meta,
    .tag-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }

    .meta span,
    .tag-row span {
      border-radius: 999px;
      background: #edf7f6;
      color: #0f766e;
      font-size: 0.72rem;
      font-weight: 800;
      padding: 6px 9px;
    }

    h2 {
      margin: 14px 0 8px;
      font-size: 1.28rem;
      line-height: 1.2;
    }

    h2 a,
    .read-link {
      color: #10213f;
      text-decoration: none;
    }

    .content p {
      margin: 0 0 14px;
      color: #52637a;
      line-height: 1.6;
    }

    .read-link {
      display: inline-flex;
      margin-top: 16px;
      color: #075fc7;
      font-weight: 900;
    }

    .empty-state {
      max-width: 720px;
      border: 1px solid #dbe3ef;
      border-radius: 8px;
      background: #fff;
      padding: 28px;
    }

    .empty-state h2 {
      margin-top: 0;
    }

    @media (max-width: 980px) {
      .article-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 640px) {
      .blog-page {
        padding: 34px 16px 54px;
      }

      .article-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class PublicBlogListComponent {
  private readonly blog = inject(PublicBlogService);
  readonly articles = toSignal(this.blog.listPublished(), { initialValue: [] });
}
