import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  query,
  where,
} from '@angular/fire/firestore';
import { Observable, catchError, map, of } from 'rxjs';
import { MarketingArticle } from '../../superAdmin/services/content-studio.service';

@Injectable({ providedIn: 'root' })
export class PublicBlogService {
  private readonly afs = inject(Firestore);

  listPublished(): Observable<MarketingArticle[]> {
    const q = query(
      collection(this.afs, 'marketingArticles'),
      where('status', '==', 'published')
    );
    return collectionData(q, { idField: 'id' }) as Observable<MarketingArticle[]>;
  }

  /**
   * The article's document ID equals its slug (see content-studio.service.ts's
   * saveArticle). A nonexistent/unpublished slug denies the Firestore rule
   * (resource.data on a missing doc), which the client surfaces as an error
   * rather than empty data — caught here and treated the same as "not found".
   */
  getBySlug(slug: string): Observable<MarketingArticle | undefined> {
    return (docData(doc(this.afs, `marketingArticles/${slug}`), { idField: 'id' }) as Observable<
      MarketingArticle | undefined
    >).pipe(
      map((article) => (article?.status === 'published' ? article : undefined)),
      catchError(() => of(undefined))
    );
  }
}
