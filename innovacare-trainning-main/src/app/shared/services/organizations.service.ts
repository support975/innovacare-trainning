import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, query, where, orderBy } from '@angular/fire/firestore';
import { Observable, map, startWith } from 'rxjs';

export interface PublicOrganization {
  id: string;
  name: string;
  type: 'health' | 'IT' | 'school';
  code?: string;
  active: boolean;
  plan: 'free' | 'pro' | 'enterprise';
}

@Injectable({ providedIn: 'root' })
export class OrganizationsService {
  private firestore = inject(Firestore);
  private orgCollection = collection(this.firestore, 'organizations');

  getOrganizations(): Observable<PublicOrganization[]> {
    const q = query(this.orgCollection, where('active', '==', true), orderBy('name', 'asc'));
    return collectionData(q, { idField: 'id' }) as Observable<PublicOrganization[]>;
  }

  searchOrganizations(term: string): Observable<PublicOrganization[]> {
    return this.getOrganizations().pipe(
      map((orgs) => {
        if (!term.trim()) return orgs;
        const lowerTerm = term.toLowerCase();
        return orgs.filter(
          (org) =>
            org.name.toLowerCase().includes(lowerTerm) ||
            org.code?.toLowerCase().includes(lowerTerm) ||
            org.id.toLowerCase().includes(lowerTerm)
        );
      })
    );
  }

  getOrganizationById(id: string): Observable<PublicOrganization | null> {
    return this.getOrganizations().pipe(
      map((orgs) => orgs.find((org) => org.id === id) || null)
    );
  }
}
