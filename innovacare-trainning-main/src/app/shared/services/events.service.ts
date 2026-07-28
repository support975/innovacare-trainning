import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, docData,
  addDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp,
  DocumentReference,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable } from 'rxjs';
import { WebinarEvent, EventRegistration } from '../../data/models';

interface CreateEventCheckoutSessionResponse {
  sessionId: string;
  url: string | null;
}

@Injectable({ providedIn: 'root' })
export class EventsService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  private eventsCollection = collection(this.firestore, 'events');
  private registrationsCollection = collection(this.firestore, 'eventRegistrations');

  /** Superadmin/staff-only — every event regardless of active/isPublic, for authoring. */
  listAllForAdmin(): Observable<WebinarEvent[]> {
    const q = query(this.eventsCollection, orderBy('schedule.date', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<WebinarEvent[]>;
  }

  /** Public catalog — active + isPublic events, visible to anonymous/individual visitors. */
  listPublicEvents(): Observable<WebinarEvent[]> {
    const q = query(
      this.eventsCollection,
      where('active', '==', true),
      where('isPublic', '==', true),
      orderBy('schedule.date', 'asc'),
    );
    return collectionData(q, { idField: 'id' }) as Observable<WebinarEvent[]>;
  }

  /** Org-scoped catalog — events assigned to this org (member pricing applies). */
  listForOrg(orgId: string): Observable<WebinarEvent[]> {
    const q = query(
      this.eventsCollection,
      where('active', '==', true),
      where('assignedOrgIds', 'array-contains', orgId),
      orderBy('schedule.date', 'asc'),
    );
    return collectionData(q, { idField: 'id' }) as Observable<WebinarEvent[]>;
  }

  getById(id: string): Observable<WebinarEvent | undefined> {
    const ref = doc(this.firestore, `events/${id}`);
    return docData(ref, { idField: 'id' }) as Observable<WebinarEvent | undefined>;
  }

  async create(event: Omit<WebinarEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const ref = await addDoc(this.eventsCollection, {
      ...event,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async update(id: string, changes: Partial<WebinarEvent>): Promise<void> {
    const ref = doc(this.firestore, `events/${id}`);
    await updateDoc(ref as unknown as DocumentReference, {
      ...changes,
      updatedAt: serverTimestamp(),
    });
  }

  async delete(id: string): Promise<void> {
    const ref = doc(this.firestore, `events/${id}`);
    await deleteDoc(ref as unknown as DocumentReference);
  }

  // ── Registrations ──────────────────────────────────────────────────────

  myRegistrationsForEvent(eventId: string, uid: string): Observable<EventRegistration[]> {
    const q = query(
      this.registrationsCollection,
      where('eventId', '==', eventId),
      where('uid', '==', uid),
    );
    return collectionData(q, { idField: 'id' }) as Observable<EventRegistration[]>;
  }

  /**
   * Self-registration. orgId/tier are derived by the caller from the
   * signed-in user's own profile — firestore.rules' isSelfEventRegistrationCreate
   * independently re-checks regData.orgId == myOrgId(), so a mismatched value
   * here is rejected server-side, not just trusted from the client.
   */
  async register(params: {
    eventId: string;
    uid: string;
    orgId: string | null;
    tier: 'member' | 'guest';
    paymentStatus: 'free' | 'pending';
  }): Promise<string> {
    const ref = await addDoc(this.registrationsCollection, {
      eventId: params.eventId,
      uid: params.uid,
      orgId: params.orgId,
      tier: params.tier,
      paymentStatus: params.paymentStatus,
      attended: null,
      evaluationSubmitted: false,
      certificateId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  /**
   * Creates a one-time Stripe Checkout session for a paid registration.
   * The registration must already exist (paymentStatus: 'pending', from
   * register()) — the Cloud Function re-derives the price from the event's
   * pricing and the registration's tier, so the amount is never trusted
   * from the client.
   */
  async createCheckoutSession(eventId: string, registrationId: string): Promise<CreateEventCheckoutSessionResponse> {
    const callable = httpsCallable<{ eventId: string; registrationId: string }, CreateEventCheckoutSessionResponse>(
      this.functions,
      'createEventCheckoutSession',
    );
    const result = await callable({ eventId, registrationId });
    return result.data;
  }
}
