import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

export type CheckoutPlanId = 'starter' | 'growth';
export type CheckoutBillingInterval = 'monthly' | 'yearly';

export interface CreateCheckoutSessionRequest {
  planId: CheckoutPlanId;
  billingInterval: CheckoutBillingInterval;
  customerEmail?: string;
  organizationName?: string;
}

interface CreateCheckoutSessionResponse {
  sessionId: string;
  url: string | null;
}

@Injectable({ providedIn: 'root' })
export class StripeCheckoutService {
  private readonly functions = inject(Functions);

  async createCheckoutSession(payload: CreateCheckoutSessionRequest): Promise<CreateCheckoutSessionResponse> {
    const callable = httpsCallable<CreateCheckoutSessionRequest, CreateCheckoutSessionResponse>(
      this.functions,
      'createStripeCheckoutSession',
    );

    const result = await callable(payload);
    return result.data;
  }
}
