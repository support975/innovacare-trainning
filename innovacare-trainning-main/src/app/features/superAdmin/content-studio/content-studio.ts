import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { QuillModule, QuillModules } from 'ngx-quill';
import Quill, { Range } from 'quill';
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
  imports: [CommonModule, FormsModule, QuillModule],
  templateUrl: './content-studio.html',
  styleUrl: './content-studio.css',
})
export class ContentStudioComponent {
  private readonly studio = inject(ContentStudioService);
  private readonly storage = inject(Storage);
  private readonly sanitizer = inject(DomSanitizer);

  private articleQuill: Quill | null = null;
  private newsletterQuill: Quill | null = null;
  readonly uploadingImage = signal(false);

  readonly quillModules: QuillModules = {
    toolbar: {
      container: [
        [{ header: [2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['blockquote'],
        ['link', 'image', 'video'],
        ['clean'],
      ],
      handlers: {
        image: () => this.pickAndUploadImage('article'),
      },
    },
  };

  readonly newsletterQuillModules: QuillModules = {
    toolbar: {
      container: [
        [{ header: [2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['blockquote'],
        ['link', 'image'],
        ['clean'],
      ],
      handlers: {
        image: () => this.pickAndUploadImage('newsletter'),
      },
    },
  };

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
      const nextReading = estimateReadingMinutes(current.bodyHtml);
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

  onArticleEditorCreated(editor: Quill): void {
    this.articleQuill = editor;
  }

  onNewsletterEditorCreated(editor: Quill): void {
    this.newsletterQuill = editor;
  }

  sanitizedPreview(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html || '');
  }

  private pickAndUploadImage(target: 'article' | 'newsletter'): void {
    const editor = target === 'article' ? this.articleQuill : this.newsletterQuill;
    if (!editor) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      const range: Range = editor.getSelection(true) ?? { index: editor.getLength(), length: 0 };
      this.uploadingImage.set(true);
      try {
        const pathId = target === 'article' ? (this.article().slug || 'draft') : 'newsletters';
        const filePath = `marketingArticles/${pathId}/${Date.now()}_${file.name}`;
        const storageRef = ref(this.storage, filePath);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        editor.insertEmbed(range.index, 'image', url, 'user');
        editor.setSelection(range.index + 1, 0, 'user');
      } catch (err: any) {
        this.setNotice(err?.message || 'Image upload failed.');
      } finally {
        this.uploadingImage.set(false);
      }
    };
    input.click();
  }

  generateDraftPack(): void {
    const topic = this.draftTopic().trim() || 'Training compliance';
    const audience = this.draftAudience().trim() || 'business leaders';
    const tone = this.draftTone().trim() || 'clear and practical';
    const title = `${topic}: a practical guide for ${audience}`;
    const slug = slugify(title);
    const body = [
      `<h2>Introduction</h2>`,
      `<p>Organizations are under pressure to train people faster, keep evidence clean, and make recurring work easier to repeat. ${topic} is not only a learning problem; it is an operational discipline.</p>`,
      `<h2>Why it matters now</h2>`,
      `<p>Teams need simple access to approved guidance, visible progress, and reminders before issues become compliance gaps. A modern training portal gives managers one place to assign learning, track completion, and document readiness.</p>`,
      `<h2>What to put in place</h2>`,
      `<ul>`,
      `<li>A clear onboarding path for every role</li>`,
      `<li>Short practice sheets for recurring tasks</li>`,
      `<li>Official certification or assessment where proof matters</li>`,
      `<li>Automated reminders for overdue training</li>`,
      `<li>Reports that leaders can understand quickly</li>`,
      `</ul>`,
      `<h2>How Innovacare Training helps</h2>`,
      `<p>Innovacare Training combines course delivery, policy acknowledgements, quick practice content, certification workflows, and manager evidence in one platform. The result is a more consistent way to prepare teams and prove that preparation.</p>`,
      `<h2>Next step</h2>`,
      `<p>Book a short demo to see how the platform can support your organization, whether you operate in healthcare, education, staffing, compliance, or another service business.</p>`,
    ].join('\n');

    this.article.set({
      ...this.blankArticle(),
      title,
      slug,
      category: 'Training Operations',
      excerpt: `A ${tone} guide for ${audience} on using training systems to improve readiness, compliance and team consistency.`,
      bodyHtml: body,
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
        readingMinutes: estimateReadingMinutes(current.bodyHtml),
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

  private computeSeoScore(article: MarketingArticle): number {
    const checks = [
      article.title.length >= 20,
      article.seoTitle.length >= 45 && article.seoTitle.length <= 65,
      article.metaDescription.length >= 120 && article.metaDescription.length <= 160,
      article.slug.length >= 8,
      !!article.heroImageUrl,
      !!article.heroImageAlt && article.heroImageAlt.length >= 20,
      article.tags.length >= 3,
      article.bodyHtml.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length >= 350,
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
      bodyHtml: '<h2>Introduction</h2><p>Write your article here.</p><h2>Key points</h2><ul><li>First point</li><li>Second point</li></ul><h2>Next step</h2><p>Invite the reader to book a demo.</p>',
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
      bodyHtml: '<h2>What is new</h2><p>Share your update here.</p><h2>Useful resource</h2><p>Link readers to a published article.</p><h2>Next step</h2><p>Invite readers to book a demo.</p>',
      status: 'draft',
    };
  }

  private setNotice(message: string): void {
    this.notice.set(message);
    window.setTimeout(() => {
      if (this.notice() === message) this.notice.set('');
    }, 3000);
  }
}
