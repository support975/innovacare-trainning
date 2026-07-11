import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SafeStorageService {
  private readonly platformId = inject(PLATFORM_ID);

  getItem(key: string): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;

    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;

    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}
