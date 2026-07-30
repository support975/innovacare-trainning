import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export type MarketingArticleStatus = 'draft' | 'published' | 'archived';

export interface MarketingArticle {
  id?: string;
  title: string;
  slug: string;
  status: MarketingArticleStatus;
  author: string;
  locale: 'en' | 'fr';
  category: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: string[];
  heroImageUrl?: string;
  heroImageAlt?: string;
  videoUrl?: string;
  seoTitle: string;
  metaDescription: string;
  canonicalPath: string;
  ogTitle: string;
  ogDescription: string;
  featured?: boolean;
  readingMinutes: number;
  views?: number;
  createdAt?: any;
  updatedAt?: any;
  publishedAt?: any;
}

export interface MarketingNewsletter {
  id?: string;
  subject: string;
  previewText: string;
  locale: 'en' | 'fr';
  audienceSegment: string;
  tags: string[];
  linkedArticleSlug?: string;
  heroImageUrl?: string;
  bodyMarkdown: string;
  status: 'draft' | 'queued' | 'sent' | 'archived';
  createdAt?: any;
  updatedAt?: any;
}

@Injectable({ providedIn: 'root' })
export class ContentStudioService {
  private readonly afs = inject(Firestore);

  listArticles(): Observable<MarketingArticle[]> {
    const q = query(collection(this.afs, 'marketingArticles'), orderBy('updatedAt', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<MarketingArticle[]>;
  }

  listNewsletters(): Observable<MarketingNewsletter[]> {
    const q = query(collection(this.afs, 'marketingNewsletters'), orderBy('updatedAt', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<MarketingNewsletter[]>;
  }

  async saveArticle(article: MarketingArticle): Promise<string> {
    const slug = article.slug || slugify(article.title);
    const payload = {
      ...article,
      slug,
      tags: article.tags || [],
      canonicalPath: article.canonicalPath || `/blog/${slug}`,
      readingMinutes: article.readingMinutes || estimateReadingMinutes(article.bodyMarkdown),
      updatedAt: serverTimestamp(),
      ...(article.status === 'published' ? { publishedAt: serverTimestamp() } : {}),
      ...(!article.id ? { createdAt: serverTimestamp(), views: 0 } : {}),
    };
    await setDoc(doc(this.afs, `marketingArticles/${slug}`), payload, { merge: true });
    return slug;
  }

  async saveNewsletter(newsletter: MarketingNewsletter): Promise<string> {
    const id = newsletter.id || slugify(newsletter.subject || `newsletter-${Date.now()}`);
    await setDoc(doc(this.afs, `marketingNewsletters/${id}`), {
      ...newsletter,
      tags: newsletter.tags || [],
      updatedAt: serverTimestamp(),
      ...(!newsletter.id ? { createdAt: serverTimestamp() } : {}),
    }, { merge: true });
    return id;
  }

  deleteArticle(slug: string): Promise<void> {
    return deleteDoc(doc(this.afs, `marketingArticles/${slug}`));
  }
}

export function slugify(value: string): string {
  return String(value || 'article')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || `article-${Date.now()}`;
}

export function estimateReadingMinutes(markdown: string): number {
  const words = String(markdown || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}
