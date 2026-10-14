import { append, del, errorBox, formData, get, h, post, put, toast } from '../ui.js';
import { state } from '../app.js';

function credentialBox(title, { username, password }) {
  return h(
    'section.card.highlight-card',
    h('h2', title),
    h('p', 'Benutzername: ', h('b.mono', username)),
    h('p', 'Startpasswort: ', h('b.mono', password)),
    h('p.muted.small', 'Das Passwort wird nicht gespeichert und ist nur jetzt sichtbar. Die Lehrkraft sollte es nach der ersten Anmeldung unter „Konto“ ändern.')
  );
}

export async function teachersView(app) {
  const teachers = await get('/api/admin/teachers');
  const reload = (keep) => {
    app.replaceChildren();
    teachersView(app).then(() => keep && app.prepend(keep));
  };
  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const showError = errorBox(form);
        try {
          const res = await post('/api/admin/teachers', formData(form));
          reload(credentialBox('Lehrkraft angelegt', res));
        } catch (err) {
          showError(err.message);
        }
      },
    },
    h('h2', 'Lehrkraft anlegen'),
    h(
      'div.grid2',
      h('label', 'Anzeigename', h('input', { name: 'displayName', required: true, maxlength: 80, placeholder: 'z. B. Frau Huber' })),
      h('label', 'Benutzername', h('input', { name: 'username', required: true, minlength: 3, maxlength: 40, autocapitalize: 'off', placeholder: 'z. B. huber' }))
    ),
    h('button.primary', { type: 'submit' }, 'Anlegen')
  );
  append(app, 
    h('h1', 'Lehrkräfte'),
    teachers.length
      ? h(
          'table.table',
          h('thead', h('tr', h('th', 'Name'), h('th', 'Benutzername'), h('th', 'Klassen'), h('th', ''))),
          h(
            'tbody',
            teachers.map((t) =>
              h(
                'tr',
                h('td', t.display_name),
                h('td.mono', t.username),
                h('td', t.classes),
                h(
                  'td.actions',
                  h(
                    'button.small',
                    {
                      onclick: async () => {
                        if (!confirm(`Passwort für ${t.display_name} zurücksetzen?`)) return;
                        reload(credentialBox('Neues Passwort', await post(`/api/admin/teachers/${t.id}/reset-password`)));
                      },
                    },
                    'Passwort neu'
                  ),
                  h(
                    'button.small.danger',
                    {
                      onclick: async () => {
                        if (!confirm(`${t.display_name} löschen? Alle Klassen, Schülerkonten und Ergebnisse dieser Lehrkraft werden ebenfalls gelöscht.`)) return;
                        try {
                          await del(`/api/admin/teachers/${t.id}`);
                          reload();
                        } catch (e) {
                          toast(e.message, 'error');
                        }
                      },
                    },
                    'Löschen'
                  )
                )
              )
            )
          )
        )
      : h('p.muted', 'Noch keine Lehrkräfte angelegt.'),
    h('section.card', form)
  );
}

export async function settingsView(app) {
  const s = await get('/api/admin/settings');
  const form = h(
    'form.card',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const showError = errorBox(form);
        try {
          const res = await put('/api/admin/settings', formData(form));
          showError('');
          next.textContent = new Date(res.nextPurge).toLocaleDateString('de-DE');
          state.setup = null;
          toast('Einstellungen gespeichert');
        } catch (err) {
          showError(err.message);
        }
      },
    },
    h('label', 'Name der Schule', h('input', { name: 'schoolName', required: true, maxlength: 120, value: s.schoolName })),
    h('label', 'Schuljahresende (MM-TT)', h('input', { name: 'yearEnd', required: true, pattern: '\\d{2}-\\d{2}', value: s.yearEnd })),
    h('p.muted.small', 'Am Tag danach werden alle Ergebnisse, Aufgaben, Abzeichen und Punkte automatisch gelöscht. Konten und Klassen bleiben bestehen.'),
    h('label', 'Datenschutzhinweis (wird auf der Anmeldeseite verlinkt)', h('textarea', { name: 'privacyNote', rows: 8, maxlength: 5000 }, s.privacyNote)),
    h('button.primary', { type: 'submit' }, 'Speichern')
  );
  const next = h('strong', new Date(s.nextPurge).toLocaleDateString('de-DE'));
  append(app, h('h1', 'Einstellungen'), h('p', 'Nächste automatische Löschung: ', next), form);
}
