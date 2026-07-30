import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ContentStudioService,
  MarketingArticle,
  MarketingNewsletter,
  estimateReadingMinutes,
  slugify,
} from '../services/content-studio.service';

@Component({
  selector: 'app-content-studio',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './content-studio.html',
  styleUrl: './content-studio.css',
})
export class ContentStudioComponent {
  private readonly studio = inject(ContentStudioService);

  readonly articles = toSignal(this.studio.listArticles(), { initialValue: [] as MarketingArticle[] });
  readonly newsletters = toSignal(this.studio.listNewsletters(), { initialValue: [] as MarketingNewsletter[] });
  readonly selectedSlug = signal('');
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly mode = signal<'article' | 'newsletter'>('article');
  readonly article = signal<MarketingArticle>(this.blankArticle());
  readonly newsletter = signal<MarketingNewsletter>(this.blankNewsletter());
  readonly draftTopic = signal('Training compliance and onboarding for growing organizations');
  readonly draftAudience = signal('business owners, HR managers, training coordinators');
  readonly draftTone = signal('clear, practical, premium');

  readonly publishedArticles = computed(() => this.articles().filter((item) => item.status === 'published'));
  readonly seoScore = computed(() => this.computeSeoScore(this.article()));
  readonly publicUrl = computed(() => `https://innovacare-training.web.app/blog/${this.article().slug || 'your-slug'}`);
  readonly shareLinks = computed(() => {
    const url = encodeURIComponent(this.publicUrl());
    const title = encodeURIComponent(this.article().ogTitle || this.article().title || 'Innovacare Training');
    const text = encodeURIComponent(this.article().ogDescription || this.article().excerpt || '');
    return {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      whatsapp: `https://wa.me/?text=${title}%20${url}`,
      x: `https://twitter.com/intent/tweet?url=${url}&text=${title}%20${text}`,
    };
  });

  constructor() {
    effect(() => {
      const current = this.article();
      const nextSlug = current.slug || slugify(current.title);
      const nextReading = estimateReadingMinutes(current.bodyMarkdown);
      if (current.slug !== nextSlug || current.readingMinutes !== nextReading) {
        this.article.set({
          ...current,
          slug: nextSlug,
          canonicalPath: `/blog/${nextSlug}`,
          readingMinutes: nextReading,
        });
      }
    }, { allowSignalWrites: true });
  }

  selectArticle(item: MarketingArticle): void {
    this.mode.set('article');
    this.selectedSlug.set(item.slug);
    this.article.set({
      ...item,
      tags: [...(item.tags || [])],
    });
  }

  newArticle(): void {
    this.selectedSlug.set('');
    this.article.set(this.blankArticle());
  }

  newNewsletter(): void {
    this.newsletter.set(this.blankNewsletter());
    this.mode.set('newsletter');
  }

  generateDraftPack(): void {
    const topic = this.draftTopic().trim() || 'Training compliance';
    const audience = this.draftAudience().trim() || 'business leaders';
    const tone = this.draftTone().trim() || 'clear and practical';
    const title = `${topic}: a practical guide for ${audience}`;
    const slug = slugify(title);
    const body = [
      `## Introduction`,
      `Organizations are under pressure to train people faster, keep evidence clean, and make recurring work easier to repeat. ${topic} is not only a learning problem; it is an operational discipline.`,
      ``,
      `## Why it matters now`,
      `Teams need simple access to approved guidance, visible progress, and reminders before issues become compliance gaps. A modern training portal gives managers one place to assign learning, track completion, and document readiness.`,
      ``,
      `## What to put in place`,
      `- A clear onboarding path for every role`,
      `- Short practice sheets for recurring tasks`,
      `- Official certification or assessment where proof matters`,
      `- Automated reminders for overdue training`,
      `- Reports that leaders can understand quickly`,
      ``,
      `## How Innovacare Training helps`,
      `Innovacare Training combines course delivery, policy acknowledgements, quick practice content, certification workflows, and manager evidence in one platform. The result is a more consistent way to prepare teams and prove that preparation.`,
      ``,
      `## Next step`,
      `Book a short demo to see how the platform can support your organization, whether you operate in healthcare, education, staffing, compliance, or another service business.`,
    ].join('\n\n');

    this.article.set({
      ...this.blankArticle(),
      title,
      slug,
      category: 'Training Operations',
      excerpt: `A ${tone} guide for ${audience} on using training systems to improve readiness, compliance and team consistency.`,
      bodyMarkdown: body,
      tags: ['training', 'compliance', 'onboarding', 'operations'],
      seoTitle: title.slice(0, 60),
      metaDescription: `Learn how ${audience} can use Innovacare Training to improve onboarding, compliance evidence, reminders and practical learning workflows.`.slice(0, 155),
      ogTitle: title,
      ogDescription: `A practical article for ${audience} about building better training and compliance workflows.`,
      heroImageAlt: `${audience} reviewing training progress in a digital learning platform`,
      canonicalPath: `/blog/${slug}`,
      readingMinutes: estimateReadingMinutes(body),
    });
    this.mode.set('article');
  }

  async saveArticle(status: MarketingArticle['status']): Promise<void> {
    this.busy.set(true);
    try {
      const current = this.article();
      const slug = await this.studio.saveArticle({
        ...current,
        status,
        slug: current.slug || slugify(current.title),
        readingMinutes: estimateReadingMinutes(current.bodyMarkdown),
      });
      this.selectedSlug.set(slug);
      this.setNotice(status === 'published' ? 'Article published.' : 'Article saved.');
    } finally {
      this.busy.set(false);
    }
  }

  async saveNewsletter(status: MarketingNewsletter['status'] = 'draft'): Promise<void> {
    this.busy.set(true);
    try {
      await this.studio.saveNewsletter({ ...this.newsletter(), status });
      this.setNotice(status === 'queued' ? 'Newsletter campaign queued.' : 'Newsletter saved.');
    } finally {
      this.busy.set(false);
    }
  }

  setArticleField<K extends keyof MarketingArticle>(key: K, value: MarketingArticle[K]): void {
    this.article.set({ ...this.article(), [key]: value });
  }

  setNewsletterField<K extends keyof MarketingNewsletter>(key: K, value: MarketingNewsletter[K]): void {
    this.newsletter.set({ ...this.newsletter(), [key]: value });
  }

  setTags(value: string): void {
    this.setArticleField('tags', value.split(',').map((item) => item.trim()).filter(Boolean));
  }

  setNewsletterTags(value: string): void {
    this.setNewsletterField('tags', value.split(',').map((item) => item.trim()).filter(Boolean));
  }

  markdownPreview(markdown: string): string {
    return markdown
      .split('\n')
      .map((line) => {
        if (line.startsWith('## ')) return `<h2>${this.escape(line.slice(3))}</h2>`;
        if (line.startsWith('- ')) return `<li>${this.escape(line.slice(2))}</li>`;
        if (!line.trim()) return '';
        return `<p>${this.escape(line)}</p>`;
      })
      .join('')
      .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  }

  private computeSeoScore(article: MarketingArticle): number {
    const checks = [
      article.title.length >= 20,
      article.seoTitle.length >= 45 && article.seoTitle.length <= 65,
      article.metaDescription.length >= 120 && article.metaDescription.length <= 160,
      article.slug.length >= 8,
      !!article.heroImageUrl,
      !!article.heroImageAlt && article.heroImageAlt.length >= 20,
      article.tags.length >= 3,
      article.bodyMarkdown.split(/\s+/).filter(Boolean).length >= 350,
      article.ogTitle.length >= 20,
      article.ogDescription.length >= 80,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }

  private blankArticle(): MarketingArticle {
    return {
      title: '',
      slug: '',
      status: 'draft',
      author: 'Innovacare Training',
      locale: 'en',
      category: 'Training Operations',
      excerpt: '',
      bodyMarkdown: '## Introduction\n\nWrite your article here.\n\n## Key points\n\n- First point\n- Second point\n\n## Next step\n\nInvite the reader to book a demo.',
      tags: [],
      heroImageUrl: '',
      heroImageAlt: '',
      videoUrl: '',
      seoTitle: '',
      metaDescription: '',
      canonicalPath: '',
      ogTitle: '',
      ogDescription: '',
      featured: false,
      readingMinutes: 1,
    };
  }

  private blankNewsletter(): MarketingNewsletter {
    return {
      subject: 'Your Innovacare Training update',
      previewText: 'New practical guidance for training, compliance and team readiness.',
      locale: 'en',
      audienceSegment: 'public_newsletter',
      tags: ['training', 'update'],
      linkedArticleSlug: '',
      heroImageUrl: '',
      bodyMarkdown: '## What is new\n\nShare your update here.\n\n## Useful resource\n\nLink readers to a published article.\n\n## Next step\n\nInvite readers to book a demo.',
      status: 'draft',
    };
  }

  private escape(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private setNotice(message: string): void {
    this.notice.set(message);
    window.setTimeout(() => {
      if (this.notice() === message) this.notice.set('');
    }, 3000);
  }
}
