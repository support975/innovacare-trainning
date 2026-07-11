import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { AuthService } from '../../core/auth';
import { JuryReview } from './certification.models';
import { CertificationAuditService } from './certification-audit.service';
import { cleanObject } from './certification-utils';

@Injectable({ providedIn: 'root' })
export class JuryReviewService {
  private readonly db = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly audit = inject(CertificationAuditService);

  list(applicationId: string): Observable<JuryReview[]> {
    return collectionData(
      collection(this.db, `candidateApplications/${applicationId}/juryReviews`),
      { idField: 'id' }
    ) as Observable<JuryReview[]>;
  }

  async create(review: Partial<JuryReview> & { organizationId: string }): Promise<string> {
    if (!review.applicationId) throw new Error('Application id is required.');
    if (!review.sessionId) throw new Error('Session id is required.');
    const ref = await addDoc(
      collection(this.db, `candidateApplications/${review.applicationId}/juryReviews`),
      cleanObject({
        applicationId: review.applicationId,
        sessionId: review.sessionId,
        juryMemberId: review.juryMemberId || this.auth.currentUid,
        decision: review.decision || 'pending',
        scoreSummary: review.scoreSummary || {},
        comments: review.comments || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    await this.audit.write({
      organizationId: review.organizationId,
      action: 'certification.jury.review',
      targetType: 'juryReview',
      targetId: ref.id,
      meta: { applicationId: review.applicationId, decision: review.decision },
    });
    return ref.id;
  }
}
