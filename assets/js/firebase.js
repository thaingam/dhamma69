// การเชื่อมต่อ Firebase — ใช้ร่วมกันทั้งหน้า landing และหน้า admin
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyDqdTKa19cD8ApUBuoUdGM-2AW_zG_CPa8',
  authDomain: 'sportday69-c54a4.firebaseapp.com',
  projectId: 'sportday69-c54a4',
  storageBucket: 'sportday69-c54a4.firebasestorage.app',
  messagingSenderId: '209083969462',
  appId: '1:209083969462:web:8449f8011865e4bd501b17',
};

// ต้องตรงกับ isAdmin() ใน firestore.rules
export const ADMIN_EMAIL = 'waroon01@gmail.com';

// collection ของระบบนี้ (ขึ้นต้น dhamma_ เพื่อไม่ปนกับระบบกีฬาสี/ประชุมผู้ปกครอง)
export const COL_ROOMS = 'dhamma_rooms';
export const COL_SITE = 'dhamma_site';

export const app = initializeApp(firebaseConfig);

// เก็บแคชในเครื่อง → เปิดซ้ำเร็ว และยังดูข้อมูลได้แม้สัญญาณหลุดในวันสอบ
let firestore;
try {
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (err) {
  console.warn('ใช้แคชในเครื่องไม่ได้ ใช้โหมดปกติแทน', err);
  firestore = getFirestore(app);
}
export const db = firestore;
