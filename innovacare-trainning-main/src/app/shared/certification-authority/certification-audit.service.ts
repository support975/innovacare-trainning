import { Injectable, inject } from '@angular/core';
import { Firestore, addDoc, collection, serverTimestamp } from '@angular/fire/firestore';
import { AuthService } from '../../core/auth';
import { CertificationAuditLog } from './certification.models';
import { cleanObject } from './certification-utils';

@Injectable({ providedIn: 'root' })
export class CertificationAuditService {
  private readonly db = inject(Firestore);
  private readonly auth = inject(AuthService);

  async write(log: Omit<CertificationAuditLog, 'id' | 'createdAt' | 'actorUid'> & { actorUid?: string | null }): Promise<string> {
    const ref = await addDoc(
      collection(this.db, 'certificationAuditLogs'),
      cleanObject({
        ...log,
        actorUid: log.actorUid ?? this.auth.currentUid ?? null,
        createdAt: serverTimestamp(),
      })
    );
    return ref.id;
  }
}
