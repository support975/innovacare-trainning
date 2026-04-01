import { Injectable, inject, Injector } from '@angular/core';
import { Firestore, addDoc, collection, serverTimestamp } from '@angular/fire/firestore';
import { from, Observable } from 'rxjs';

export interface DemoRequestPayload {
  fullName: string;
  workEmail: string;
  phone: string;
  organizationName: string;
  organizationType: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class DemoRequestService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(Injector);

  createDemoRequest(payload: DemoRequestPayload): Observable<void> {
    return from(this.addDemoRequestToFirestore(payload));
  }

  private addDemoRequestToFirestore(payload: DemoRequestPayload): Promise<void> {
    const ref = collection(this.firestore, 'demoRequests');
    return addDoc(ref, {
      ...payload,
      source: 'landing-page',
      status: 'new',
      createdAt: serverTimestamp(),
    }).then(() => {});
  }
}