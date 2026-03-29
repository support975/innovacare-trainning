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
  orderBy,
  serverTimestamp
} from '@angular/fire/firestore';

import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { WoundType } from '../wound.model';


@Injectable({ providedIn: 'root' })
export class WoundService {
  private db = inject(Firestore);
  private storage = inject(Storage);
  private colName = 'woundLibrary';

  /** Add a wound type and optionally upload images. Returns the new doc id. */
  async addWoundType(wound: WoundType, imageFiles?: File[]): Promise<string> {
    // Prepare the payload; use provided wound.images (urls) if present
    const data = {
      ...wound,
      images: Array.isArray(wound.images) ? wound.images : [],
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
    const snap = await getDoc(doc(this.db, this.colName, woundId));
    if (!snap.exists()) return null;
    return { woundId: snap.id, ...(snap.data() as any) } as WoundType;
  }

  /** Get all wound types (ordered by created date desc) */
  async listWoundTypes(): Promise<WoundType[]> {
    const q = query(collection(this.db, this.colName), orderBy('createdAt', 'desc'));
    const snaps = await getDocs(q);
    return snaps.docs.map(d => ({ woundId: d.id, ...(d.data() as any) } as WoundType));
  }
}
