import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST || process.env.GCLOUD_PROJECT !== 'demo-tokyo-together') {
  throw new Error('This seed script runs only with the demo Firebase emulators.');
}
const app=initializeApp({projectId:'demo-tokyo-together'});
const auth=getAuth(app),db=getFirestore(app);
for(const [key,name] of [['jinhyeok','진혁'],['yeonhwa','연화'],['minseong','민성'],['sophie','Sophie']]){
  const email=`demo-${key}@example.test`;
  let user;
  try { user=await auth.createUser({email,password:'demo-password-123'}); }
  catch(error){ if(error.code!=='auth/email-already-exists')throw error; user=await auth.getUserByEmail(email); }
  await db.doc(`members/${user.uid}`).set({nameKey:key,displayName:name,email});
}
console.log('Demo emulator members ready. Login: demo-jinhyeok@example.test / demo-password-123');
