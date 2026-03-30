import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { SuperAdminLog } from '../models/super-admin.models';


@Injectable({ providedIn: 'root' })
export class SuperAdminLogsService {
  private afs = inject(Firestore);
  private colRef = collection(this.afs, 'adminLogs');

  listRecent(max = 50): Observable<SuperAdminLog[]> {
    const q = query(this.colRef, orderBy('createdAt', 'desc'), limit(max));
    return collectionData(q, { idField: 'id' }) as Observable<SuperAdminLog[]>;
  }

  async write(log: SuperAdminLog): Promise<string> {
    const ref = await addDoc(this.colRef, {
      ...log,
      severity: log.severity ?? 'info',
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  async audit(params: {
    action: string;
    targetType: string;
    targetId?: string;
    actorUid?: string;
    actorEmail?: string;
    message?: string;
    severity?: 'info' | 'warning' | 'critical';
    meta?: Record<string, any>;
  }): Promise<string> {
    return this.write({
      type: 'AUDIT',
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      actorUid: params.actorUid,
      actorEmail: params.actorEmail,
      message: params.message,
      severity: params.severity ?? 'info',
      meta: params.meta ?? {},
    });
  }
}