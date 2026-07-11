// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';

import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { provideFunctions, getFunctions, connectFunctionsEmulator } from '@angular/fire/functions';
import { getApp } from 'firebase/app';

import { environment } from '../enviroments/enviroment';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// IMPORTANT: setPersistence vient de firebase/auth (pas AngularFire)
import { browserLocalPersistence, setPersistence } from 'firebase/auth';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled',
      })
    ),
    provideHttpClient(withInterceptorsFromDi()),

    // 1 seule initialisation de l'app Firebase
    provideFirebaseApp(() => initializeApp(environment.firebase)),

    // Auth: utiliser la même app + persistence locale
    provideAuth(() => {
      const auth = getAuth();
      // pas besoin d'await ici
      setPersistence(auth, browserLocalPersistence).catch(() => {});
      return auth;
    }),

    provideStorage(() => getStorage()),
    provideFunctions(() => {
      const fns = getFunctions(undefined, environment.functions.region);
      const emulator = environment.functions.emulator;

      if (emulator.enabled) {
        connectFunctionsEmulator(fns, emulator.host, emulator.port);
      }

      return fns;
    }),

    provideFirestore(() => {
      try {
        return initializeFirestore(getApp(), {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        });
      } catch {
        return getFirestore();
      }
    }),
  ],
};
