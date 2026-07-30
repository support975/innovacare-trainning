import { Injectable } from '@angular/core';
import { orderBy } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { CommunicationCenterRepository } from './communication-center.repository';
import { CommunicationApprovalDoc, CommunicationRepositoryState } from '../contracts/communication.models';

@Injectable({ providedIn: 'root' })
export class CommunicationApprovalRepository extends CommunicationCenterRepository {
  listApprovals(orgId: string | null): Observable<CommunicationRepositoryState<CommunicationApprovalDoc>> {
    return this.listOrgScoped<CommunicationApprovalDoc>('communication_approvals', orgId, orderBy('createdAt', 'asc'));
  }
}
