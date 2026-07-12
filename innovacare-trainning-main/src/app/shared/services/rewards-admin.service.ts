import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

export type ManualRewardType = 'points' | 'badge' | 'credit_hours';

export interface GrantManualRewardRequest {
  learnerUid: string;
  type: ManualRewardType;
  title: string;
  note?: string;
  points?: number;
  badge?: string;
  hours?: number;
  creditUnit?: string;
  licenseId?: string;
}

export interface GrantManualRewardResponse {
  rewardId: string;
  awarded: boolean;
}

@Injectable({ providedIn: 'root' })
export class RewardsAdminService {
  private functions = inject(Functions);

  async grantManualReward(request: GrantManualRewardRequest): Promise<GrantManualRewardResponse> {
    const callable = httpsCallable<GrantManualRewardRequest, GrantManualRewardResponse>(
      this.functions,
      'grantManualReward'
    );

    try {
      const result = await callable(request);
      return result.data;
    } catch (error: any) {
      const message = error?.message || error?.details || 'Unable to grant reward.';
      throw new Error(message);
    }
  }
}
