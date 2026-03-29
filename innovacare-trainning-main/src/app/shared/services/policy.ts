import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  deleteDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  where,
  serverTimestamp,
  limit,
  setDoc,
} from '@angular/fire/firestore';

import { getAuth } from 'firebase/auth';
import { Policy, PolicyAcknowledgement } from '../../features/learner/policy/model/policy.model';

@Injectable({ providedIn: 'root' })
export class PolicyService {
  private db = inject(Firestore);

  private policiesCol = 'policies';
  private acksCol = 'policy_acknowledgements';

  /**
   * IMPORTANT:
   * On force un token prêt AVANT Firestore.
   * Sinon: "Missing or insufficient permissions" (request.auth == null côté rules)
   * surtout au 1er chargement ou après refresh.
   */
  private async ensureAuthTokenReady(): Promise<void> {
    const u = getAuth().currentUser;
    if (!u) return; // laisser la règle Firestore refuser si pas connecté
    try {
      await u.getIdToken(); // pas besoin true à chaque fois
    } catch {
      // ignore; Firestore retournera permission-denied si vraiment pas auth
    }
  }

  // ---------------------------
  // POLICIES CRUD
  // ---------------------------

  async createPolicy(payload: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    await this.ensureAuthTokenReady();

    // Évite TS2783: ne redéclare pas "status" si payload le contient déjà.
    const data = stripUndefined({
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const docRef = await addDoc(collection(this.db, this.policiesCol), data as any);
    return docRef.id;
  }

  async updatePolicy(policyId: string, patch: Partial<Policy>): Promise<void> {
    await this.ensureAuthTokenReady();

    const data = stripUndefined({
      ...patch,
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(this.db, this.policiesCol, policyId), data as any);
  }

  async deletePolicy(policyId: string): Promise<void> {
    await this.ensureAuthTokenReady();
    await deleteDoc(doc(this.db, this.policiesCol, policyId));
  }

  async getPolicy(policyId: string): Promise<Policy | null> {
    await this.ensureAuthTokenReady();

    const snap = await getDoc(doc(this.db, this.policiesCol, policyId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as any) } as Policy;
  }

  



  async listPolicies(opts?: { includeArchived?: boolean; latest?: boolean; limit?: number }): Promise<Policy[]> {
    const ref = collection(this.db, 'policies');

    const constraints: any[] = [];

    if (!opts?.includeArchived) {
      constraints.push(where('status', '!=', 'archived')); // ou where('archived','==',false) selon ton schema
    }

    // latest = orderBy(createdAt desc) + limit
    if (opts?.latest) {
      constraints.push(orderBy('createdAt', 'desc'));
      constraints.push(limit(opts?.limit ?? 5));
    } else {
      // tri normal pour list complète
      constraints.push(orderBy('category', 'asc'));
      constraints.push(orderBy('title', 'asc'));
      if (opts?.limit) constraints.push(limit(opts.limit));
    }

    const snap = await getDocs(query(ref, ...constraints));

    return snap.docs.map(d => {
      const data: any = d.data();
      return {
        id: d.id,
        status: data.status ?? 'active',
        title: data.title ?? '',
        category: data.category ?? '',
        language: data.language ?? 'en',
        area: data.area ?? '',
        version: data.version ?? '',
        effectiveDate: data.effectiveDate ?? '',
        lastRevised: data.lastRevised ?? '',
        lastApproved: data.lastApproved ?? '',
        requiresAcknowledgement: !!data.requiresAcknowledgement,
        blocking: !!data.blocking,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        contentHtml: data.contentHtml ?? '',
      } as Policy;
    });
  }




  // ---------------------------
  // ACKNOWLEDGEMENTS
  // ---------------------------

  ackId(policyId: string, uid: string) {
    return `${policyId}_${uid}`;
  }

  async ackExists(policyId: string, uid: string): Promise<boolean> {
    await this.ensureAuthTokenReady();

    const id = this.ackId(policyId, uid);
    const snap = await getDoc(doc(this.db, this.acksCol, id));
    return snap.exists();
  }

  async acknowledge(opts: { policyId: string; policyVersion: string; userId: string }): Promise<void> {
    await this.ensureAuthTokenReady();

    const id = this.ackId(opts.policyId, opts.userId);
    const ref = doc(this.db, this.acksCol, id);

    const snap = await getDoc(ref);
    if (snap.exists()) return;

    const data = stripUndefined({
      policyId: opts.policyId,
      policyVersion: opts.policyVersion,
      userId: opts.userId,
      acknowledgedAt: serverTimestamp(), // sentinel OK
    });

    await setDoc(ref, data as any, { merge: false });
  }

  async listAcknowledgementsForPolicy(policyId: string): Promise<PolicyAcknowledgement[]> {
    await this.ensureAuthTokenReady();

    const ref = collection(this.db, this.acksCol);
    const q = query(ref, where('policyId', '==', policyId), orderBy('acknowledgedAt', 'desc'), limit(500));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as PolicyAcknowledgement));
  }
}

function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: any = {};
  for (const k of Object.keys(obj)) {
    const v = (obj as any)[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}
