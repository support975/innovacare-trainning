import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class KioskService {
  private router = inject(Router);

  private isKioskMode = false;
  private sessionId = '';

  /** Enable kiosk mode for exam session */
  enableKiosk(sessionId: string): void {
    this.isKioskMode = true;
    this.sessionId = sessionId;
    this.setupKioskLocks();
  }

  /** Disable kiosk mode (exam ended) */
  disableKiosk(): void {
    this.isKioskMode = false;
    this.sessionId = '';
    this.removeKioskLocks();
  }

  isInKioskMode(): boolean {
    return this.isKioskMode;
  }

  private setupKioskLocks(): void {
    // Prevent back button
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', (e) => {
      if (this.isKioskMode) {
        e.preventDefault();
        window.history.pushState(null, '', window.location.href);
      }
    });

    // Prevent opening new tabs/windows
    document.addEventListener('keydown', (e) => {
      if (this.isKioskMode) {
        // Ctrl/Cmd + T (new tab)
        if ((e.ctrlKey || e.metaKey) && e.key === 't') {
          e.preventDefault();
        }
        // Ctrl/Cmd + N (new window)
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
          e.preventDefault();
        }
        // Ctrl/Cmd + W (close tab)
        if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
          e.preventDefault();
        }
        // F5 (refresh) - allow
        // Ctrl+Shift+Delete (clear history) - prevent
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Delete') {
          e.preventDefault();
        }
      }
    });

    // Prevent right-click context menu
    document.addEventListener(
      'contextmenu',
      (e) => {
        if (this.isKioskMode) {
          e.preventDefault();
        }
      },
      true
    );

    // Prevent drag & drop
    document.addEventListener(
      'dragover',
      (e) => {
        if (this.isKioskMode) {
          e.preventDefault();
        }
      },
      true
    );

    // Prevent text selection copy
    document.addEventListener(
      'copy',
      (e) => {
        if (this.isKioskMode) {
          e.preventDefault();
        }
      },
      true
    );

    // Hide browser UI elements
    this.hideBrowserUI();
  }

  private removeKioskLocks(): void {
    // Restore browser functionality
    document.removeEventListener('keydown', this.blockKeys);
    document.removeEventListener('contextmenu', this.blockContextMenu);
    this.showBrowserUI();
  }

  private hideBrowserUI(): void {
    // Hide scrollbars and disable selection
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    // Add CSS to hide scrollbars on exam pages
    const style = document.createElement('style');
    style.id = 'kiosk-style';
    style.textContent = `
      ::-webkit-scrollbar { display: none; }
      body { -ms-overflow-style: none; overflow-y: scroll; }
      input, textarea { -webkit-user-select: text; user-select: text; }
    `;
    document.head.appendChild(style);
  }

  private showBrowserUI(): void {
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';

    const style = document.getElementById('kiosk-style');
    if (style) style.remove();
  }

  private blockKeys = (e: KeyboardEvent) => {
    // Implement key blocking
  };

  private blockContextMenu = (e: MouseEvent) => {
    // Implement context menu blocking
  };

  /** Redirect to exam login after exam completes */
  returnToLogin(sessionId: string): void {
    this.disableKiosk();
    // Clear exam session token
    localStorage.removeItem('exam_session_token');
    // Redirect to login for next candidate
    void this.router.navigate(['/exam-session-login'], {
      queryParams: { sessionId },
      replaceUrl: true,
    });
  }
}
