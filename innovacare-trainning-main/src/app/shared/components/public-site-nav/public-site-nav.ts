import { CommonModule } from '@angular/common';
import { Component, HostListener, Input, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterModule } from '@angular/router';

import { DemoRequestDialog } from '../../../features/publics/demo-request-dialog/demo-request-dialog';
import { AppLanguage, LanguageService } from '../../services/language';

type PublicNavPage = 'home' | 'features' | 'industries' | 'catalogue' | 'pricing' | 'ordre';

@Component({
  selector: 'app-public-site-nav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <header class="public-nav" [class.scrolled]="headerScrolled">
      <div class="container header-inner">
        <a class="brand" routerLink="/home" (click)="closeMobileMenu()" aria-label="Aller à l'accueil Innovacare Training">
          <img class="brand-mark brand-mark--logo" src="/logo.png" alt="Innovacare Training" />
          <span class="brand-copy">
            <span>Innovacare</span>
            <strong>Training</strong>
          </span>
        </a>

        <button
          class="menu-toggle"
          type="button"
          (click)="toggleMobileMenu()"
          [attr.aria-expanded]="mobileMenuOpen"
          aria-label="Ouvrir le menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <div class="nav-context desktop-only" aria-label="Résumé de la page">
            <span class="nav-context__label">{{ publicText(contextLabel) }}</span>
            <strong>{{ publicText(contextValue) }}</strong>
        </div>

        <nav class="nav" [class.open]="mobileMenuOpen" aria-label="Navigation publique">
          <a routerLink="/home" [class.is-active]="isActive('home')" (click)="closeMobileMenu()">{{ t('public.nav.home') }}</a>
          <a routerLink="/fonctionnalites" [class.is-active]="isActive('solutions')" (click)="closeMobileMenu()">{{ t('public.nav.solutions') }}</a>
          <a routerLink="/industries" [class.is-active]="isActive('industries')" (click)="closeMobileMenu()">{{ t('public.nav.industries') }}</a>
          <a routerLink="/catalogue" [class.is-active]="isActive('catalogue')" (click)="closeMobileMenu()">{{ t('public.nav.catalogue') }}</a>
          <a routerLink="/pricing" [class.is-active]="isActive('pricing')" (click)="closeMobileMenu()">{{ t('public.nav.pricing') }}</a>
          <a routerLink="/ordre-professionnel" [class.is-active]="isActive('ordre')" (click)="closeMobileMenu()">{{ t('public.nav.ordre') }}</a>
          <a [routerLink]="['/home']" fragment="faq" [class.is-active]="isActive('faq')" (click)="closeMobileMenu()">{{ t('public.nav.faq') }}</a>

          <div class="nav-mobile-meta mobile-only">
            <span>{{ publicText(mobileMetaLabel) }}</span>
            <strong>{{ publicText(mobileMetaValue) }}</strong>
          </div>

          <div class="language-switch language-switch--mobile mobile-only" role="group" [attr.aria-label]="t('public.nav.language')">
            <button type="button" [class.active]="languageCode() === 'en'" (click)="setLanguage('en')">
              {{ t('language.english') }}
            </button>
            <button type="button" [class.active]="languageCode() === 'fr'" (click)="setLanguage('fr')">
              {{ t('language.french') }}
            </button>
          </div>

          <button class="nav-cta nav-cta--ghost mobile-only" type="button" (click)="login()">
            {{ t('public.nav.login') }}
          </button>
          <button class="nav-cta nav-cta--accent mobile-only" type="button" (click)="openDemoDialog()">
            {{ t('public.nav.demo') }}
          </button>
        </nav>

        <div class="nav-actions desktop-only">
          <div class="language-switch" role="group" [attr.aria-label]="t('public.nav.language')">
            <button
              type="button"
              [class.active]="languageCode() === 'en'"
              (click)="setLanguage('en')"
            >
              {{ t('language.english') }}
            </button>
            <button
              type="button"
              [class.active]="languageCode() === 'fr'"
              (click)="setLanguage('fr')"
            >
              {{ t('language.french') }}
            </button>
          </div>
          <button class="nav-cta nav-cta--ghost" type="button" (click)="login()">
            {{ t('public.nav.login') }}
          </button>
          <button class="nav-cta nav-cta--accent" type="button" (click)="openDemoDialog()">
            {{ t('public.nav.demo') }}
          </button>
        </div>
      </div>
    </header>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      * {
        box-sizing: border-box;
      }

      .public-nav {
        position: sticky;
        top: 0;
        z-index: 200;
        background: rgba(255, 255, 255, 0.94);
        border-bottom: 1px solid rgba(214, 224, 238, 0.9);
        backdrop-filter: blur(14px);
        transition: box-shadow 0.25s ease, background 0.25s ease;
      }

      .public-nav.scrolled {
        box-shadow: 0 2px 16px rgba(26, 63, 111, 0.12);
        background: rgba(255, 255, 255, 0.98);
      }

      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 0 2rem;
      }

      .header-inner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.8rem 0;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        color: #1a3f6f;
        text-decoration: none;
        cursor: pointer;
        letter-spacing: -0.3px;
      }

      .brand-mark {
        width: 42px;
        height: 42px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 14px;
        background: linear-gradient(135deg, #0d2240 0%, #1b4f7b 100%);
        color: #ffffff;
        font-size: 0.95rem;
        letter-spacing: 0.08em;
        box-shadow: 0 10px 20px rgba(13, 34, 64, 0.2);
      }

      .brand-mark--logo {
        background: #ffffff;
        object-fit: contain;
        padding: 3px;
        box-shadow: 0 4px 12px rgba(13, 34, 64, 0.14);
      }

      .brand-copy {
        display: flex;
        flex-direction: column;
        line-height: 1;
      }

      .brand-copy span {
        color: #00a79d;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .brand-copy strong {
        color: #1a3f6f;
        font-size: 1.1rem;
        font-weight: 800;
      }

      .menu-toggle {
        display: none;
        flex-direction: column;
        gap: 5px;
        padding: 6px;
        background: none;
        border: none;
        cursor: pointer;
      }

      .menu-toggle span {
        width: 24px;
        height: 2px;
        background: #1a3f6f;
        border-radius: 2px;
      }

      .nav-context {
        display: flex;
        flex-direction: column;
        gap: 0.12rem;
        min-width: 190px;
        padding: 0.55rem 0.9rem;
      }

      .nav-context__label {
        color: #5a6a7e;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }

      .nav-context strong {
        color: #1a3f6f;
        font-size: 0.92rem;
      }

      .nav {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        margin: 0 auto;
        padding: 0.4rem;
        border: 1px solid rgba(214, 224, 238, 0.9);
        border-radius: 999px;
        background: rgba(244, 247, 251, 0.95);
      }

      .nav a {
        padding: 0.7rem 1rem;
        border-radius: 999px;
        color: #1a2b4a;
        font-size: 0.92rem;
        font-weight: 600;
        text-decoration: none;
        transition: color 0.2s, background 0.2s, transform 0.2s;
      }

      .nav a:hover {
        color: #0d2240;
        background: rgba(0, 167, 157, 0.12);
        transform: translateY(-1px);
      }

      .nav a.is-active {
        color: #0d2240;
        background: rgba(0, 167, 157, 0.18);
        box-shadow: inset 0 0 0 1px rgba(0, 167, 157, 0.12);
      }

      .nav-actions {
        display: flex;
        align-items: center;
        gap: 0.65rem;
      }

      .language-switch {
        display: grid;
        grid-template-columns: repeat(2, minmax(38px, 1fr));
        padding: 0.2rem;
        border: 1px solid rgba(26, 63, 111, 0.16);
        border-radius: 999px;
        background: #ffffff;
      }

      .language-switch button {
        min-width: 38px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: #5a6a7e;
        font-size: 0.78rem;
        font-weight: 800;
        cursor: pointer;
        padding: 0.48rem 0.55rem;
      }

      .language-switch button.active {
        background: #0d2240;
        color: #ffffff;
      }

      .language-switch--mobile {
        width: 100%;
      }

      .nav-cta {
        padding: 0.7rem 1.15rem;
        border: 1px solid transparent;
        border-radius: 999px;
        font-size: 0.88rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.2s, transform 0.15s, border-color 0.2s, color 0.2s, box-shadow 0.2s;
        white-space: nowrap;
      }

      .nav-cta:hover {
        transform: translateY(-1px);
      }

      .nav-cta--accent {
        background: linear-gradient(135deg, #f26b21 0%, #ff8c42 100%);
        color: #ffffff;
        box-shadow: 0 10px 20px rgba(242, 107, 33, 0.24);
      }

      .nav-cta--ghost {
        background: #ffffff;
        color: #1a3f6f;
        border-color: rgba(26, 63, 111, 0.16);
      }

      .nav-mobile-meta {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.75rem 0.15rem 0.25rem;
        color: #5a6a7e;
      }

      .nav-mobile-meta span {
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .nav-mobile-meta strong {
        color: #1a3f6f;
        font-size: 0.96rem;
      }

      .mobile-only {
        display: none;
      }

      .desktop-only {
        display: flex;
      }

      @media (max-width: 1024px) {
        .header-inner {
          flex-wrap: wrap;
        }

        .nav-context {
          order: 3;
          width: 100%;
          padding: 0;
        }
      }

      @media (max-width: 768px) {
        .container {
          padding: 0 1.25rem;
        }

        .menu-toggle {
          display: flex;
        }

        .header-inner {
          position: relative;
          flex-wrap: nowrap;
        }

        .nav {
          position: fixed;
          top: 72px;
          left: 1rem;
          right: 1rem;
          z-index: 199;
          max-height: 0;
          overflow: hidden;
          flex-direction: column;
          align-items: stretch;
          gap: 0.35rem;
          padding: 0;
          border-width: 0;
          border-radius: 24px;
          background: #ffffff;
          box-shadow: none;
          opacity: 0;
          pointer-events: none;
          transition: max-height 0.3s ease, padding 0.3s ease, opacity 0.2s ease, box-shadow 0.2s ease;
        }

        .nav.open {
          max-height: 620px;
          padding: 1rem;
          border-width: 1px;
          box-shadow: 0 16px 40px rgba(13, 34, 64, 0.18);
          opacity: 1;
          pointer-events: auto;
        }

        .nav a {
          padding: 0.9rem 1rem;
          border-radius: 16px;
        }

        .nav .language-switch {
          margin: 0.25rem 0;
        }

        .nav a.is-active {
          box-shadow: none;
        }

        .mobile-only {
          display: block;
        }

        .language-switch.mobile-only {
          display: grid;
        }

        .desktop-only {
          display: none;
        }
      }

      @media (max-width: 480px) {
        .header-inner {
          gap: 1rem;
        }

        .brand-mark {
          width: 38px;
          height: 38px;
        }

        .brand-copy strong {
          font-size: 1rem;
        }
      }
    `,
  ],
})
export class PublicSiteNavComponent {
  @Input() page: PublicNavPage = 'home';
  @Input() contextLabel = 'Navigation publique';
  @Input() contextValue = 'Découvrir Innovacare Training';
  @Input() mobileMetaLabel = 'Plateforme LMS santé';
  @Input() mobileMetaValue = 'Navigation claire entre les pages publiques';

  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);

  mobileMenuOpen = false;
  headerScrolled = false;

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.headerScrolled = typeof window !== 'undefined' && window.scrollY > 10;
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (typeof window !== 'undefined' && window.innerWidth > 768 && this.mobileMenuOpen) {
      this.closeMobileMenu();
    }
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  login(): void {
    this.closeMobileMenu();
    void this.router.navigate(['/login']);
  }

  t(key: string): string {
    return this.language.t(key);
  }

  publicText(value: string | number): string {
    return this.language.publicText(String(value));
  }

  languageCode(): AppLanguage {
    return this.language.language();
  }

  setLanguage(language: AppLanguage): void {
    this.language.setLanguage(language);
  }

  openDemoDialog(): void {
    this.closeMobileMenu();
    this.dialog.open(DemoRequestDialog, {
      width: '100%',
      maxWidth: '720px',
      autoFocus: false,
      panelClass: 'demo-request-dialog-panel',
      backdropClass: 'demo-request-dialog-backdrop',
      data: {
        source: `public-nav-${this.page}`,
      },
    });
  }

  isActive(item: 'home' | 'solutions' | 'industries' | 'catalogue' | 'pricing' | 'ordre' | 'faq'): boolean {
    const currentPath = this.currentPath();
    const currentFragment = this.currentFragment();

    switch (item) {
      case 'home':
        return currentPath === '/home' && currentFragment !== 'faq';
      case 'solutions':
        return currentPath === '/fonctionnalites';
      case 'industries':
        return currentPath === '/industries';
      case 'catalogue':
        return currentPath === '/catalogue' || currentPath.startsWith('/catalogue/');
      case 'pricing':
        return currentPath === '/pricing';
      case 'ordre':
        return currentPath === '/ordre-professionnel';
      case 'faq':
        return currentPath === '/home' && currentFragment === 'faq';
    }
  }

  private currentPath(): string {
    return this.router.url.split('#')[0].split('?')[0] || '/';
  }

  private currentFragment(): string | null {
    return this.router.parseUrl(this.router.url).fragment ?? null;
  }
}
