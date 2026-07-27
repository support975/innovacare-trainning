export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSyD0yS0fEMccUQp8qlLqwk7FaThgOq0588Q',
    authDomain: 'innovacaretrainning-dev.firebaseapp.com',
    projectId: 'innovacaretrainning-dev',
    storageBucket: 'innovacaretrainning-dev.firebasestorage.app',
    messagingSenderId: '926620167420',
    appId: '1:926620167420:web:0428109b86102c78ecfb79',
    measurementId: 'G-Y1BBN45JM7',
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
    createEmployeeUrl: 'https://createemployee-926620167420.us-central1.run.app',
    createOrganizationAdminUrl: '/api/create-organization-admin',
    createManagedUserUrl: 'https://us-central1-innovacaretrainning-dev.cloudfunctions.net/createOrgUser',
  },
};
