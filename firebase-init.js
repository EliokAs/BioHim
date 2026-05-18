// firebase-init.js — загружается как type="module" ДО script.js
// Инициализирует Firebase и кладёт нужные функции в window

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, get, set, onValue } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

const _fbConfig = {
  apiKey: "AIzaSyAh_g-_X0bMd23YEh5r5dO3xLu4Awpb1ns",
  authDomain: "biohim-a36ce.firebaseapp.com",
  databaseURL: "https://biohim-a36ce-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "biohim-a36ce",
  storageBucket: "biohim-a36ce.firebasestorage.app",
  messagingSenderId: "797458613466",
  appId: "1:797458613466:web:f2e734a65e4e84b7ce51e3"
};

const _fbApp = initializeApp(_fbConfig);
const _db    = getDatabase(_fbApp);

// Кладём в window — чтобы script.js (обычный, не модуль) мог использовать
window._db     = _db;
window._fbRef  = ref;
window._fbGet  = get;
window._fbSet  = set;
window._fbOnValue = onValue;
