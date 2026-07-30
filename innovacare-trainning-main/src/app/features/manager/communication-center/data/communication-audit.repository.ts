import { Injectable } from '@angular/core';
import { orderBy } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { CommunicationCenterRepository } from './communication-center.repository';
import { CommunicationAuditDoc, CommunicationRepositoryState } from '../contracts/communication.models';

@Injectable({ providedIn: 'root' })
export class CommunicationAuditRepository extends CommunicationCenterRepository {
  listAudits(orgId: string | null): Observable<CommunicationRepositoryState<CommunicationAuditDoc>> {
    return this.listOrgScoped<CommunicationAuditDoc>('communication_audits', orgId, orderBy('createdAt', 'desc'));
  }
}
