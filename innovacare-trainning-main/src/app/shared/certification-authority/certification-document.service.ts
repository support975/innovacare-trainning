import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  doc,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { AuthService } from '../../core/auth';
import { ApplicationDocument } from './certification.models';
import { CertificationAuditService } from './certification-audit.service';
import { cleanObject } from './certification-utils';

@Injectable({ providedIn: 'root' })
export class CertificationDocumentService {
  private readonly db = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly audit = inject(CertificationAuditService);

  list(applicationId: string): Observable<ApplicationDocument[]> {
    return collectionData(
      collection(this.db, `candidateApplications/${applicationId}/documents`),
      { idField: 'id' }
    ) as Observable<ApplicationDocument[]>;
  }

  async add(applicationId: string, document: Partial<ApplicationDocument> & { organizationId?: string }): Promise<string> {
    if (!applicationId) throw new Error('Application id is required.');
    if (!document.type) throw new Error('Document type is required.');
    const ref = await addDoc(
      collection(this.db, `candidateApplications/${applicationId}/documents`),
      cleanObject({
        applicationId,
        type: document.type,
        fileUrl: document.fileUrl,
        fileId: document.fileId,
        status: document.status || 'pending',
        uploadedAt: serverTimestamp(),
      })
    );
    if (document.organizationId) {
      await this.audit.write({
        organizationId: document.organizationId,
        action: 'certification.document.upload',
        targetType: 'applicationDocument',
        targetId: ref.id,
        actorUid: this.auth.currentUid,
        meta: { applicationId },
      });
    }
    return ref.id;
  }

  async review(applicationId: string, documentId: string, patch: Partial<ApplicationDocument> & { organizationId: string }): Promise<void> {
    await updateDoc(doc(this.db, `candidateApplications/${applicationId}/documents/${documentId}`), {
      ...cleanObject(patch),
      reviewedBy: this.auth.currentUid,
      reviewedAt: serverTimestamp(),
    } as any);
    await this.audit.write({
      organizationId: patch.organizationId,
      action: 'certification.documents.review',
      targetType: 'applicationDocument',
      targetId: documentId,
      meta: { applicationId, status: patch.status },
    });
  }
}
