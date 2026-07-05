import type { CredentialTokenPurpose } from '@coralyn/contracts';

export interface CredentialSetupEmailModel {
  to: string;
  rawToken: string;
  purpose: CredentialTokenPurpose;
  expiresAt: Date;
  webStaffUrl: string;
}

const DATE_FMT = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
});

/** Costruisce l'email di set-password (invito o reset). Puro: nessun side-effect, nessuna password. */
export function buildCredentialSetupEmail(m: CredentialSetupEmailModel): { subject: string; text: string; html: string } {
  const link = `${m.webStaffUrl}/imposta-password?token=${m.rawToken}`;
  const scad = DATE_FMT.format(m.expiresAt);
  const isReset = m.purpose === 'reset';
  const subject = isReset ? 'Reimposta la tua password Coralyn' : 'Attiva il tuo accesso a Coralyn';
  const intro = isReset
    ? 'Abbiamo ricevuto una richiesta di reimpostazione della password del tuo account Coralyn.'
    : 'Il tuo account Coralyn è stato creato. Imposta la password per iniziare a usare il gestionale.';
  const text = [
    intro,
    '',
    `Imposta la password da questo link (valido fino al ${scad}, utilizzabile una sola volta):`,
    link,
    '',
    'Se non hai richiesto questa email, puoi ignorarla: senza impostare la password, l’accesso non è attivo.',
  ].join('\n');
  const html = `<p>${intro}</p>
<p>Imposta la password da questo link (valido fino al <strong>${scad}</strong>, utilizzabile una sola volta):</p>
<p><a href="${link}">${link}</a></p>
<p style="color:#666;font-size:13px">Se non hai richiesto questa email, puoi ignorarla: senza impostare la password, l’accesso non è attivo.</p>`;
  return { subject, text, html };
}
