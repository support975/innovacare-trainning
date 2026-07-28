export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSyDE0eUeb7yFzZj_HVztwnuQI421Lo_Z2KE',
    authDomain: 'innovacaretrainninng-staging.firebaseapp.com',
    projectId: 'innovacaretrainninng-staging',
    storageBucket: 'innovacaretrainninng-staging.firebasestorage.app',
    messagingSenderId: '1061214593774',
    appId: '1:1061214593774:web:b83710a61eb8b6e410c9ff',
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
    createEmployeeUrl: 'https://createemployee-1061214593774.us-central1.run.app',
    createOrganizationAdminUrl: '/api/create-organization-admin',
    createManagedUserUrl: 'https://us-central1-innovacaretrainninng-staging.cloudfunctions.net/createOrgUser',
  },
};
