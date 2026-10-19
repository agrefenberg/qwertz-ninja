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
    state.me.schoolActive === false
      ? h('p.notice', 'Eure Schule ist noch nicht freigeschaltet. Lehrkräfte und Schüler können sich erst anmelden, wenn der unterschriebene AVV beim Betreiber vorliegt. ', h('a', { href: '#/einstellungen' }, 'Zum AVV'))
      : null,
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
  append(app, h('h1', 'Einstellungen'), h('p', 'Nächste automatische Löschung: ', next), s.mode === 'multi' ? avvCard(s) : null, form, await demoSection());
}

// Im Mehrschulbetrieb: Vertrag zur Auftragsverarbeitung mit dem Betreiber
function avvCard(s) {
  return h(
    'section.card',
    h('h2', 'Vertrag zur Auftragsverarbeitung (AVV)'),
    s.avvSignedAt
      ? h('p', h('span.tag.tag-ok', 'Unterschrieben'), ` am ${new Date(s.avvSignedAt).toLocaleDateString('de-DE')}. Lehrkräfte und Schüler können sich anmelden.`)
      : h(
          'p',
          h('span.tag.tag-test', 'Noch nicht unterschrieben'),
          ' Bis der unterschriebene AVV beim Betreiber vorliegt, können sich nur Admins anmelden. Bitte den Vertrag herunterladen, von der Schulleitung unterschreiben lassen und an den Betreiber schicken.'
        ),
    s.schoolCode ? h('p.muted.small', 'Schulkennung für die Anmeldung über VIDIS: ', h('b.mono', s.schoolCode)) : null,
    h('a.button', { href: '/api/admin/avv.pdf', download: '' }, 'AVV als PDF herunterladen')
  );
}

async function demoSection() {
  const box = h('section.card');
  const render = (demo, info = null) => {
    const run = (action, msg) => async (e) => {
      if (action === 'remove' && !confirm('Alle Demo-Lehrkräfte mit ihren Klassen, Schülerkonten und Ergebnissen löschen?')) return;
      e.target.disabled = true;
      e.target.textContent = action === 'create' ? 'Wird angelegt …' : 'Wird entfernt …';
      try {
        const res = await post('/api/admin/demo', { action });
        render({ ...demo, present: res.present }, action === 'create' ? res : null);
        toast(msg);
      } catch (err) {
        toast(err.message, 'error');
        e.target.disabled = false;
      }
    };
    box.replaceChildren(
      h('h2', 'Demodaten'),
      h(
        'p.muted.small',
        'Legt vier Demo-Lehrkräfte mit sieben Klassen, rund 170 Schülerkonten und mehreren Wochen Übungs- und Testergebnissen an. Echte Konten bleiben unberührt. Demodaten lassen sich jederzeit wieder entfernen.'
      ),
      demo.present
        ? h(
            'div',
            h(
              'p',
              'Demodaten sind vorhanden. Anmelden zum Beispiel als ',
              ['huber', 'maier', 'yilmaz', 'schmid'].map((n, i) => [i ? (i === 3 ? ' oder ' : ', ') : '', h('b.mono', (demo.prefix || 'demo-') + n)]),
              '. Passwort für alle Demo-Konten, auch die der Schüler: ',
              h('b.mono', demo.password),
              '.'
            ),
            info?.sampleStudents?.length ? h('p', 'Beispiel-Schülerkonten: ', info.sampleStudents.map((u, i) => [i ? ', ' : '', h('b.mono', u)])) : null,
            info ? h('p.muted.small', `${info.classes} Klassen, ${info.students} Schülerkonten, ${info.results} Ergebnisse angelegt.`) : null,
            h('div.toolbar', h('button', { onclick: run('create', 'Demodaten neu angelegt') }, 'Neu erzeugen'), h('button.danger', { onclick: run('remove', 'Demodaten entfernt') }, 'Demodaten entfernen'))
          )
        : h('button.primary', { onclick: run('create', 'Demodaten angelegt') }, 'Demodaten anlegen')
    );
  };
  render(await get('/api/admin/demo'));
  return box;
}
