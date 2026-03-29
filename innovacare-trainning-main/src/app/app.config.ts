// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { provideFunctions, getFunctions, connectFunctionsEmulator } from '@angular/fire/functions';

import { environment } from '../enviroments/enviroment';
import { enableIndexedDbPersistence } from 'firebase/firestore';

// IMPORTANT: setPersistence vient de firebase/auth (pas AngularFire)
import { browserLocalPersistence, setPersistence } from 'firebase/auth';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
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
    provideFunctions(() => getFunctions(undefined, 'us-central1')),
    provideFunctions(() => {
  const fns = getFunctions(undefined, "us-central1");
  connectFunctionsEmulator(fns, "localhost", 5001);
  return fns;
}),

    provideFirestore(() => {
      const db = getFirestore();
      enableIndexedDbPersistence(db).catch(() => {});
      return db;
    }),
  ],
};
