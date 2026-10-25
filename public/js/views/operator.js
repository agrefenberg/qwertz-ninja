// Betreiber im Mehrschulbetrieb: Schulen anlegen, AVV verwalten, Admin-Konten der Schulen.
import { append, del, errorBox, fmtDate, formData, get, h, post, put, swapView, toast } from '../ui.js';
import { state } from '../app.js';

const dateInput = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));

function credentialBox(title, { username, password }) {
  return h(
    'section.card.highlight-card',
    h('h2', title),
    h('p', 'Benutzername: ', h('b.mono', username)),
    h('p', 'Startpasswort: ', h('b.mono', password)),
    h('p.muted.small', 'Das Passwort wird nicht gespeichert und ist nur jetzt sichtbar. Bitte sicher an die Schule weitergeben.')
  );
}

function schoolFields(s = {}) {
  return [
    h(
      'div.grid2',
      h('label', 'Name der Schule', h('input', { name: 'name', required: true, maxlength: 120, value: s.name || '', placeholder: 'z. B. Realschule Musterstadt' })),
      h(
        'label',
        'Schulkennung (für VIDIS)',
        h('input', { name: 'schoolCode', maxlength: 40, value: s.school_code || '', autocapitalize: 'characters', placeholder: 'z. B. DE-BY-12345' })
      )
    ),
    h('label', 'Anschrift', h('input', { name: 'address', maxlength: 300, value: s.address || '', placeholder: 'Straße, PLZ Ort' })),
    h(
      'div.grid2',
      h('label', 'Schulleitung', h('input', { name: 'head', maxlength: 120, value: s.head || '' })),
      h('label', 'Ansprechperson / E-Mail', h('input', { name: 'contact', maxlength: 200, value: s.contact || '' }))
    ),
  ];
}

export async function schoolsView(app) {
  const o = await get('/api/operator/overview');
  const reload = (keep) => swapView(app, (c) => schoolsView(c), keep);
  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const showError = errorBox(form);
        try {
          const res = await post('/api/operator/schools', formData(form));
          reload(credentialBox('Schule angelegt. Zugang für den Schul-Admin:', res.admin));
        } catch (err) {
          showError(err.message);
        }
      },
    },
    h('h2', 'Schule anlegen'),
    schoolFields(),
    h(
      'div.grid2',
      h('label', 'Benutzername des Schul-Admins', h('input', { name: 'adminUsername', required: true, minlength: 3, maxlength: 40, autocapitalize: 'off', placeholder: 'z. B. admin-rs-musterstadt' })),
      h('label', 'Name des Schul-Admins (optional)', h('input', { name: 'adminName', maxlength: 80 }))
    ),
    h('button.primary', { type: 'submit' }, 'Schule anlegen')
  );
  const missing = !o.operator.address || !o.operator.contact;
  append(
    app,
    h('h1', 'Schulen'),
    missing
      ? h('p.notice', 'Bitte zuerst unter ', h('a', { href: '#/einstellungen' }, 'Einstellungen'), ' Anschrift und Kontakt des Betreibers eintragen. Sie stehen im AVV.')
      : null,
    o.schools.length
      ? h('div.table-wrap', h(
          'table.table',
          h('thead', h('tr', h('th', 'Schule'), h('th', 'Schulkennung'), h('th', 'AVV'), h('th', 'Lehrkräfte'), h('th', 'Schüler'))),
          h(
            'tbody',
            o.schools.map((s) =>
              h(
                'tr',
                h('td', h('a', { href: `#/schule/${s.id}` }, s.name)),
                h('td.mono', s.school_code || '–'),
                h('td', s.avv_signed_at ? h('span.tag.tag-ok', `seit ${fmtDate(s.avv_signed_at, false)}`) : h('span.tag.tag-test', 'fehlt')),
                h('td', s.teachers),
                h('td', s.students)
              )
            )
          )
        ))
      : h('p.muted', 'Noch keine Schulen angelegt.'),
    h('section.card', form)
  );
}

export async function schoolView(app, { id }) {
  const s = await get(`/api/operator/schools/${id}`);
  const reload = (keep) => swapView(app, (c) => schoolView(c, { id }), keep);
  const act = (fn) => async (e) => {
    try {
      await fn(e);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const edit = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const showError = errorBox(edit);
        try {
          await put(`/api/operator/schools/${id}`, formData(edit));
          toast('Gespeichert');
          reload();
        } catch (err) {
          showError(err.message);
        }
      },
    },
    h('h2', 'Angaben zur Schule'),
    schoolFields(s),
    h('p.muted.small', 'Diese Angaben stehen im AVV. Die Schulkennung muss genau so eingetragen sein, wie VIDIS sie für diese Schule liefert.'),
    h('button.primary', { type: 'submit' }, 'Speichern')
  );

  const signedDate = h('input', { type: 'date', value: dateInput(s.avv_signed_at), max: dateInput() });
  const avv = h(
    'section.card',
    h('h2', 'Vertrag zur Auftragsverarbeitung'),
    s.avv_signed_at
      ? h('p', h('span.tag.tag-ok', 'Unterschrieben'), ` am ${fmtDate(s.avv_signed_at, false)}. Lehrkräfte und Schüler dieser Schule können sich anmelden.`)
      : h('p', h('span.tag.tag-test', 'Noch nicht unterschrieben'), ' Bis dahin können sich nur die Admins dieser Schule anmelden.'),
    h(
      'ol.small',
      h('li', 'AVV als PDF herunterladen und an die Schule schicken.'),
      h('li', 'Die Schulleitung prüft ihn mit der oder dem Datenschutzbeauftragten und unterschreibt.'),
      h('li', 'Du unterschreibst ebenfalls und trägst hier das Datum ein. Damit ist die Schule freigeschaltet.')
    ),
    h(
      'div.toolbar',
      h('a.button', { href: `/api/operator/schools/${id}/avv.pdf`, download: '' }, 'AVV als PDF'),
      h('label.inline', 'Unterschrieben am ', signedDate),
      h('button.primary', { onclick: act(async () => { await post(`/api/operator/schools/${id}/avv`, { signedAt: signedDate.value }); toast('Schule freigeschaltet'); reload(); }) }, s.avv_signed_at ? 'Datum ändern' : 'Als unterschrieben markieren'),
      s.avv_signed_at
        ? h(
            'button.danger',
            {
              onclick: act(async () => {
                if (!confirm('Freischaltung zurücknehmen? Lehrkräfte und Schüler dieser Schule werden sofort abgemeldet und können sich nicht mehr anmelden.')) return;
                await post(`/api/operator/schools/${id}/avv`, { signedAt: null });
                reload();
              }),
            },
            'Freischaltung zurücknehmen'
          )
        : null
    )
  );

  const adminForm = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const showError = errorBox(adminForm);
        try {
          reload(credentialBox('Neues Admin-Konto', await post(`/api/operator/schools/${id}/admins`, formData(adminForm))));
        } catch (err) {
          showError(err.message);
        }
      },
    },
    h(
      'div.grid2',
      h('input', { name: 'adminUsername', required: true, minlength: 3, maxlength: 40, autocapitalize: 'off', placeholder: 'Benutzername', 'aria-label': 'Benutzername' }),
      h('input', { name: 'adminName', maxlength: 80, placeholder: 'Name (optional)', 'aria-label': 'Name' })
    ),
    h('button', { type: 'submit' }, 'Admin hinzufügen')
  );
  const admins = h(
    'section.card',
    h('h2', 'Admin-Konten der Schule'),
    h('div.table-wrap', h(
      'table.table',
      h(
        'tbody',
        s.admins.map((a) =>
          h(
            'tr',
            h('td', a.display_name),
            h('td.mono', a.username),
            h(
              'td.actions',
              h(
                'button.small',
                {
                  onclick: act(async () => {
                    if (!confirm(`Passwort für ${a.username} zurücksetzen?`)) return;
                    reload(credentialBox('Neues Passwort', await post(`/api/operator/schools/${id}/admins/${a.id}/reset-password`)));
                  }),
                },
                'Passwort neu'
              ),
              s.admins.length > 1
                ? h(
                    'button.small.danger',
                    {
                      onclick: act(async () => {
                        if (!confirm(`Admin-Konto ${a.username} löschen?`)) return;
                        await del(`/api/operator/schools/${id}/admins/${a.id}`);
                        reload();
                      }),
                    },
                    'Löschen'
                  )
                : null
            )
          )
        )
      )
    )),
    adminForm
  );

  const danger = h(
    'section.card',
    h('h2', 'Schule löschen'),
    h('p.muted.small', 'Löscht die Schule mit allen Konten, Klassen und Ergebnissen, z. B. am Ende des Vertrags. Das lässt sich nicht rückgängig machen. Die Schule sollte ihre Ergebnisse vorher exportieren.'),
    h(
      'button.danger',
      {
        onclick: act(async () => {
          const name = prompt(`Zum Bestätigen bitte den Namen der Schule eingeben: ${s.name}`);
          if (!name) return;
          await del(`/api/operator/schools/${id}?confirm=${encodeURIComponent(name)}`);
          toast('Schule gelöscht');
          location.hash = '#/';
        }),
      },
      'Schule mit allen Daten löschen'
    )
  );

  append(app, h('p', h('a', { href: '#/' }, '← Alle Schulen')), h('h1', s.name), avv, h('section.card', edit), admins, danger);
}

export async function operatorSettingsView(app) {
  const o = await get('/api/operator/overview');
  const op = o.operator;
  const form = h(
    'form.card',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const showError = errorBox(form);
        try {
          await put('/api/operator/settings', formData(form));
          showError('');
          state.setup = null;
          toast('Gespeichert');
        } catch (err) {
          showError(err.message);
        }
      },
    },
    h('h2', 'Angaben zum Betreiber'),
    h('p.muted.small', 'Diese Angaben stehen als Auftragsverarbeiter im AVV jeder Schule.'),
    h('label', 'Name des Angebots bzw. Betreibers', h('input', { name: 'name', required: true, maxlength: 120, value: op.name })),
    h('label', 'Anschrift', h('input', { name: 'address', maxlength: 300, value: op.address, placeholder: 'Name, Straße, PLZ Ort' })),
    h('div.grid2', h('label', 'Kontakt (E-Mail)', h('input', { name: 'contact', maxlength: 200, value: op.contact })), h('label', 'Datenschutzkontakt (optional)', h('input', { name: 'dpo', maxlength: 200, value: op.dpo }))),
    h(
      'label',
      'Ort der Verarbeitung',
      h('input', { name: 'location', maxlength: 300, value: op.location, placeholder: 'z. B. auf einem Raspberry Pi in den Räumen des Betreibers in Musterstadt (Deutschland)' })
    ),
    h('p.muted.small', 'Wird im AVV so eingesetzt: „Die Verarbeitung erfolgt …“.'),
    h('label', 'Unterauftragsverarbeiter', h('textarea', { name: 'subprocessors', rows: 3, maxlength: 1000, placeholder: 'Leer lassen, wenn es keine gibt (eigene Hardware).' }, op.subprocessors)),
    h('h2', 'Impressum und Datenschutz'),
    h('p.muted.small', 'Beides wird auf der Anmeldeseite verlinkt und ist für den Betrieb im Internet Pflicht. Die Schulen ergänzen ihren eigenen Datenschutzhinweis in ihren Einstellungen; ihn sehen die Nutzer nach der Anmeldung.'),
    !op.imprint ? h('p.form-error', 'Es ist noch kein Impressum hinterlegt.') : null,
    h('label', 'Impressum', h('textarea', { name: 'imprint', rows: 6, maxlength: 3000, placeholder: 'Name, Anschrift, Kontakt, Verantwortlicher nach § 18 MStV' }, op.imprint)),
    h('label', 'Datenschutzerklärung des Angebots', h('textarea', { name: 'privacy', rows: 8, maxlength: 10000 }, op.privacy)),
    h('button.primary', { type: 'submit' }, 'Speichern')
  );
  const vidis = h(
    'section.card',
    h('h2', 'Anmeldung über VIDIS'),
    o.vidis.configured
      ? [
          h('p', h('span.tag.tag-ok', 'Eingerichtet'), ' Konfiguriert für ', h('span.mono', o.vidis.issuer), '. Ob die Verbindung klappt, zeigt die erste Anmeldung.'),
          h('p.muted.small', 'Rückleitungsadresse (Redirect-URI) für die FWU: ', h('b.mono', o.vidis.redirectUri)),
        ]
      : [
          h('p', h('span.tag.tag-test', 'Nicht eingerichtet')),
          h(
            'p.muted.small',
            'Für die Anmeldung über VIDIS muss das Angebot bei der FWU registriert werden (vidis@fwu.de). Danach die Zugangsdaten in der Datei .env eintragen und neu starten: QN_VIDIS_ISSUER, QN_VIDIS_CLIENT_ID, QN_VIDIS_CLIENT_SECRET und QN_PUBLIC_URL (bzw. QN_DOMAIN).'
          ),
        ]
  );
  append(app, h('h1', 'Einstellungen'), form, vidis);
}
