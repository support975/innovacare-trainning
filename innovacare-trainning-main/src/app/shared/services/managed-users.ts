import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../enviroments/enviroment';

export type ManagedUserRole = 'admin' | 'manager' | 'learner';

export interface CreateManagedUserInput {
  email: string;
  displayName?: string;
  role: ManagedUserRole;
  orgId: string;
}

export interface CreateManagedUserResult extends CreateManagedUserInput {
  uid: string;
  displayName: string;
  temporaryPassword: string;
}

@Injectable({ providedIn: 'root' })
export class ManagedUsersService {
  private http = inject(HttpClient);
  private auth = inject(Auth);

  async create(input: CreateManagedUserInput): Promise<CreateManagedUserResult> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) throw new Error('Sign in required.');

    const idToken = await currentUser.getIdToken();

    try {
      const response = await firstValueFrom(
        this.http.post<{ result: CreateManagedUserResult }>(
          environment.api.createManagedUserUrl,
          {
            data: {
              ...input,
              operation: 'createManagedUser',
            },
          },
          {
            headers: new HttpHeaders({
              Authorization: `Bearer ${idToken}`,
            }),
          }
        )
      );
      return response.result;
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        const message = error.error?.error?.message || error.error?.message;
        if (message) throw new Error(message);
      }
      throw error;
    }
  }
}
