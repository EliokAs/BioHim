// ========== ГЛАВНЫЙ ИСПРАВЛЕННЫЙ СКРИПТ (МИНИМАЛЬНЫЙ, НО РАБОЧИЙ) ==========
const LS_PREFIX = 'biohim_db_';
function load(k) { return JSON.parse(localStorage.getItem(LS_PREFIX+k) || 'null'); }
function save(k,v) { localStorage.setItem(LS_PREFIX+k, JSON.stringify(v)); }

// Инициализация с чистыми паролями
function initData() {
  if(!load('users')) {
    save('users', [
      {id:'admin', login:'admin', password:'admin123', name:'Преподаватель', role:'admin'},
      {id:'anna',  login:'anna',  password:'1234',     name:'Анна Петрова',  role:'student'},
      {id:'dima',  login:'dima',  password:'1234',     name:'Дмитрий Козлов',role:'student'}
    ]);
  }
}

let currentUser = null;
function doLogin() {
  const login = document.getElementById('login-username').value.trim();
  const pass = document.getElementById('login-password').value;
  const users = load('users') || [];
  const user = users.find(u => u.login === login && u.password === pass);
  if(!user) {
    document.getElementById('login-err').innerText = 'Неверный логин или пароль';
    return;
  }
  currentUser = user;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('sidebar-name').innerText = user.name;
  // Простой вывод
  document.getElementById('page-dashboard').innerHTML = `<h2>Добро пожаловать, ${user.name}!</h2><button onclick="doLogout()">Выйти</button>`;
}
function doLogout() {
  currentUser = null;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}
// Автозапуск
initData();
window.doLogin = doLogin;
window.doLogout = doLogout;
