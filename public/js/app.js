import { get, h, post } from './ui.js';
import { loginView, setupView, privacyView } from './views/auth.js';
import * as student from './views/student.js';
import { basicsView } from './views/basics.js';
import * as teacher from './views/teacher.js';
import * as admin from './views/admin.js';
import { plnSheetNtaView, plnSheetView, plnView, studentPlnView } from './views/pln.js';
import * as operator from './views/operator.js';

export const state = { me: null, setup: null, cleanup: null };

const ROUTES = {
  student: [
    ['/', student.homeView],
    ['/ueben/:kind', student.practiceView],
    ['/ueben/text/:id', student.practiceTextView],
    ['/ueben/fokus/:chars', student.focusView],
    ['/ueben/verwechslung/:pair', student.contrastView],
    ['/ueben/fehlerwoerter', student.errorWordsView],
    ['/kurs', student.courseView],
    ['/kurs/:id', student.lessonView],
    ['/fehler', student.errorsView],
    ['/aufgabe/:id', student.assignmentView],
    ['/pln/:id', studentPlnView],
    ['/grundstellung', basicsView],
    ['/rangliste', student.leaderboardView],
    ['/verlauf', student.historyView],
    ['/einstellungen', student.settingsView],
  ],
  teacher: [
    ['/', teacher.classesView],
    ['/klasse/:id', teacher.classView],
    ['/aufgabe/:id', teacher.assignmentResultsView],
    ['/pln/:id', plnView],
    ['/pln/:id/vorlage', plnSheetView],
    ['/pln/:id/vorlage-nta', plnSheetNtaView],
    ['/schueler/:id', teacher.studentView],
    ['/texte', teacher.textsView],
    ['/notenschluessel', teacher.schemesView],
    ['/konto', teacher.accountView],
  ],
  admin: [
    ['/', admin.teachersView],
    ['/einstellungen', admin.settingsView],
    ['/konto', teacher.accountView],
  ],
  operator: [
    ['/', operator.schoolsView],
    ['/schule/:id', operator.schoolView],
    ['/einstellungen', operator.operatorSettingsView],
    ['/konto', teacher.accountView],
  ],
};

const NAV = {
  student: [
    ['#/', 'Start'],
    ['#/kurs', 'Kurs'],
    ['#/fehler', 'Fehler'],
    ['#/verlauf', 'Verlauf'],
    ['#/rangliste', 'Rangliste'],
    ['#/einstellungen', 'Einstellungen'],
  ],
  teacher: [
    ['#/', 'Klassen'],
    ['#/texte', 'Texte'],
    ['#/notenschluessel', 'Notenschlüssel'],
    ['#/konto', 'Konto'],
  ],
  admin: [
    ['#/', 'Lehrkräfte'],
    ['#/einstellungen', 'Einstellungen'],
    ['#/konto', 'Konto'],
  ],
  operator: [
    ['#/', 'Schulen'],
    ['#/einstellungen', 'Einstellungen'],
    ['#/konto', 'Konto'],
  ],
};

function match(pattern, path) {
  const p = pattern.split('/');
  const a = path.split('/');
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

export async function refreshMe() {
  try {
    state.me = await get('/api/me');
  } catch (e) {
    if (e.status !== 401) throw e;
    state.me = null;
  }
}

function renderNav() {
  const nav = document.getElementById('nav');
  nav.replaceChildren();
  const name = state.me?.schoolName || state.setup?.schoolName || '';
  document.querySelector('.brand-name').textContent = !name || name.includes('QWERTZ Ninja') ? name || 'QWERTZ Ninja' : `QWERTZ Ninja · ${name}`;
  if (!state.me) return;
  const current = location.hash || '#/';
  const section = NAV[state.me.role].filter(([href]) => href !== '#/' && current.startsWith(href)).at(-1)?.[0] || (current === '#/' ? '#/' : null);
  // Schüler ohne Klasse sehen nur die Beitrittsseite, also kein Menü.
  const showMenu = !(state.me.role === 'student' && !state.me.class);
  nav.append(
    showMenu ? h('span.nav-pill', NAV[state.me.role].map(([href, label]) => h('a', { href, class: section === href ? 'active' : null }, label))) : '',
    h('span.nav-user', h('span.avatar', state.me.displayName.slice(0, 1)), state.me.displayName),
    h('button.link', {
      onclick: async () => {
        const res = await post('/api/logout');
        state.me = null;
        // Nach einer Anmeldung über VIDIS auch dort abmelden.
        if (res.redirect) return location.assign(res.redirect);
        location.hash = '#/';
        route();
      },
    }, 'Abmelden')
  );
}

export async function route() {
  state.cleanup?.();
  state.cleanup = null;
  const app = document.getElementById('app');
  const path = (location.hash || '#/').slice(1) || '/';
  try {
    if (!state.setup) state.setup = await get('/api/setup');
    renderNav();
    if (path === '/datenschutz') return privacyView(app);
    if (state.setup.needsSetup) return setupView(app);
    if (!state.me) await refreshMe();
    renderNav();
    if (!state.me) return loginView(app);
    // Über VIDIS angemeldete Schüler treten zuerst mit dem Code ihrer Lehrkraft einer Klasse bei.
    if (state.me.role === 'student' && !state.me.class) return student.joinClassView(app);
    // Lernende wiederholen beim ersten Anmelden die Grundstellung.
    if (state.me.role === 'student' && !state.me.onboardingDone && path !== '/grundstellung') {
      location.hash = '#/grundstellung';
      return;
    }
    for (const [pattern, view] of ROUTES[state.me.role]) {
      const params = match(pattern, path);
      if (params) {
        // Jede Ansicht bekommt einen eigenen Container. Startet währenddessen eine neuere
        // Navigation, hängt die alte Ansicht nur noch in einem abgelösten Container.
        const container = h('div');
        app.replaceChildren(container);
        window.scrollTo(0, 0);
        return await view(container, params);
      }
    }
    app.replaceChildren(h('h1', 'Seite nicht gefunden'), h('p', h('a', { href: '#/' }, 'Zur Startseite')));
  } catch (e) {
    if (e.status === 401) {
      state.me = null;
      return route();
    }
    console.error(e);
    app.replaceChildren(h('h1', 'Da ist etwas schiefgelaufen'), h('p.form-error', e.message), h('p', h('a', { href: '#/' }, 'Zur Startseite')));
  }
}

window.addEventListener('hashchange', () => {
  // Während eines PLN ist keine Navigation möglich: Die Adresse springt zurück.
  if (state.examLock) {
    if (location.hash !== state.examLock) history.replaceState(null, '', state.examLock);
    return;
  }
  route();
});
route();
