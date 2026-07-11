export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSyBPdPmD8m9JqFf4v7tKUg71l79obSSzD-E',
    authDomain: 'innovacare-training.firebaseapp.com',
    databaseURL: 'https://innovacare-training-default-rtdb.firebaseio.com',
    projectId: 'innovacare-training',
    storageBucket: 'innovacare-training.firebasestorage.app',
    messagingSenderId: '355807336211',
    appId: '1:355807336211:web:1dc5e0916ff67f95ce2ce6',
    measurementId: 'G-K80VVT2J6P',
  },
  functions: {
    region: 'us-central1',
    emulator: {
      enabled: false,
      host: '127.0.0.1',
      port: 5001,
    },
  },
  api: {
    createEmployeeUrl: 'https://createemployee-355807336211.us-central1.run.app',
    createOrganizationAdminUrl: '/api/create-organization-admin',
    createManagedUserUrl: 'https://us-central1-innovacare-training.cloudfunctions.net/createOrgUser',
  },
};
