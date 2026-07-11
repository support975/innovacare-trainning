// src/app/services/wound-library.service.ts
import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp
} from '@angular/fire/firestore';
import { firstValueFrom, filter, take } from 'rxjs';

import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { WoundType } from '../wound.model';
import { AppProfile, AuthService } from '../../../core/auth';


@Injectable({ providedIn: 'root' })
export class WoundService {
  private db = inject(Firestore);
  private storage = inject(Storage);
  private auth = inject(AuthService);
  private colName = 'woundLibrary';

  /** Add a wound type and optionally upload images. Returns the new doc id. */
  async addWoundType(wound: WoundType, imageFiles?: File[]): Promise<string> {
    const profile = await this.currentProfile();
    const orgId = profile.orgId || wound.orgId || null;

    if (!orgId) {
      throw new Error('Quick practice sheets must be linked to an organization.');
    }

    // Prepare the payload; use provided wound.images (urls) if present
    const data = {
      ...wound,
      orgId,
      resourceKind: wound.resourceKind || 'quick_sheet',
      images: Array.isArray(wound.images) ? wound.images : [],
      createdBy: this.auth.currentUid || undefined,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    } as any;
  
    const docRef = await addDoc(collection(this.db, this.colName), data);
    const id = docRef.id;
  
    // If caller provided files, upload them and update doc.images
    if (imageFiles && imageFiles.length) {
      const urls: string[] = [];
      for (const file of imageFiles) {
        const path = `woundLibrary/${id}/${Date.now()}_${file.name}`;
        const sRef = ref(this.storage, path);
        await uploadBytes(sRef, file);
        const url = await getDownloadURL(sRef);
        urls.push(url);
      }
      await updateDoc(doc(this.db, this.colName, id), { images: urls, updatedAt: serverTimestamp() } as any);
    }
  
    return id;
  }

  /** Update partial fields of a wound type */
  async updateWoundType(woundId: string, partial: Partial<WoundType>): Promise<void> {
    await updateDoc(doc(this.db, this.colName, woundId), {
      ...partial,
      updatedAt: serverTimestamp()
    } as any);
  }

  /** Upload files to storage path woundLibrary/{woundId}/... and return URLs */
  async uploadFilesForWoundType(woundId: string, files: File[]): Promise<string[]> {
    const urls: string[] = [];
    for (const file of files) {
      const path = `woundLibrary/${woundId}/${Date.now()}_${file.name}`;
      const sRef = ref(this.storage, path);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      urls.push(url);
    }
    return urls;
  }

  /** Get a single wound type */
  async getWoundType(woundId: string): Promise<WoundType | null> {
    const profile = await this.currentProfile();
    const snap = await getDoc(doc(this.db, this.colName, woundId));
    if (!snap.exists()) return null;
    const data = { woundId: snap.id, ...(snap.data() as any) } as WoundType;
    if (!this.canReadProfileResource(profile, data)) return null;
    return data;
  }

  /** Get all wound types (ordered by created date desc) */
  async listWoundTypes(): Promise<WoundType[]> {
    const profile = await this.currentProfile();
    if (!profile.orgId && !this.isSuperAdmin(profile)) return [];

    const q = this.isSuperAdmin(profile) && !profile.orgId
      ? query(collection(this.db, this.colName))
      : query(collection(this.db, this.colName), where('orgId', '==', profile.orgId));

    const snaps = await getDocs(q);
    return snaps.docs
      .map(d => ({ woundId: d.id, ...(d.data() as any) } as WoundType))
      .filter(item => item.isActive !== false)
      .sort((a, b) => this.timestampMs(b.createdAt) - this.timestampMs(a.createdAt));
  }

  private currentProfile(): Promise<AppProfile> {
    return firstValueFrom(
      this.auth.profile$.pipe(
        filter((profile): profile is AppProfile => !!profile),
        take(1)
      )
    );
  }

  private canReadProfileResource(profile: AppProfile, resource: WoundType): boolean {
    return this.isSuperAdmin(profile) || (!!profile.orgId && resource.orgId === profile.orgId);
  }

  private isSuperAdmin(profile: AppProfile): boolean {
    return profile.role === 'super_admin';
  }

  private timestampMs(value: any): number {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
