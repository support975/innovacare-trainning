import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { AuthService } from '../../core/auth';
import { CertificationDecision } from './certification.models';
import { CertificationAuditService } from './certification-audit.service';
import { cleanObject } from './certification-utils';

@Injectable({ providedIn: 'root' })
export class CertificationDecisionService {
  private readonly db = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly audit = inject(CertificationAuditService);

  list(applicationId: string): Observable<CertificationDecision[]> {
    return collectionData(
      collection(this.db, `candidateApplications/${applicationId}/decisions`),
      { idField: 'id' }
    ) as Observable<CertificationDecision[]>;
  }

  async record(decision: Partial<CertificationDecision> & { organizationId: string }): Promise<string> {
    if (!decision.applicationId) throw new Error('Application id is required.');
    if (!decision.sessionId) throw new Error('Session id is required.');
    if (!decision.finalDecision) throw new Error('Final decision is required.');

    const id = `${decision.applicationId}_final`;
    await setDoc(
      doc(this.db, `candidateApplications/${decision.applicationId}/decisions/${id}`),
      cleanObject({
        applicationId: decision.applicationId,
        sessionId: decision.sessionId,
        finalDecision: decision.finalDecision,
        decisionReason: decision.decisionReason || '',
        remediationProgramId: decision.remediationProgramId ?? null,
        authorizedForRegistry: decision.authorizedForRegistry === true,
        decidedBy: decision.decidedBy || this.auth.currentUid,
        decidedAt: serverTimestamp(),
        publishedAt: decision.publishedAt ?? null,
      })
    );
    await this.audit.write({
      organizationId: decision.organizationId,
      action: 'certification.application.decide',
      targetType: 'certificationDecision',
      targetId: id,
      meta: { applicationId: decision.applicationId, finalDecision: decision.finalDecision },
    });
    return id;
  }
}
