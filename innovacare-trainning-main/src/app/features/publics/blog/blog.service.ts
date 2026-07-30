import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  query,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
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
}
