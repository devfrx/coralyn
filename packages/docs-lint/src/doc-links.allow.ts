/**
 * I link rotti **dichiarati**, con la ragione per cui restano rotti.
 *
 * Un'allow-list serve a rendere rosso un link rotto *nuovo* senza restare rossi per sempre su
 * quelli che non si possono chiudere. Ma un'allow-list e' anche il posto in cui il debito smette di
 * essere visibile, e questo repo ne ha gia' un esempio: `deferred.md`, ~74k caratteri con voci
 * chiuse ancora in tabella che nessuno rilegge. Da cui due regole, entrambe presidiate da
 * `doc-links.spec.ts`:
 *
 *   1. **niente voci inutili**: se un link dichiarato qui non risulta piu' rotto, il gate diventa
 *      rosso e la voce va cancellata. Un'allow-list che invecchia in silenzio non e' una difesa;
 *   2. **una ragione per voce**, non un elenco di path. La ragione dice perche' il link non e'
 *      riparabile, non che e' rotto — quello lo dice il checker.
 *
 * L'audit della Fase H (2026-07-26) contava 17 link rotti «storici» e prevedeva di dichiararli
 * tutti qui. Riesaminati caso per caso, **uno solo** lo e' davvero: 2 puntavano a ADR con un
 * filename che git dimostra non essere mai esistito (riparati), e 14 avevano il path come testo
 * visibile del link, quindi togliere il link e lasciare il path in `code` conserva la frase
 * *byte per byte* e non lascia un 404 dietro. Vedi ADR-0059.
 */
export interface AllowedBrokenLink {
  /** path del documento, relativo alla radice del repo */
  readonly file: string;
  /** il target **come scritto** nel markdown */
  readonly target: string;
  /** perche' non e' riparabile */
  readonly reason: string;
}

export const ALLOWED_BROKEN_LINKS: readonly AllowedBrokenLink[] = [
  {
    file: 'docs/architecture/decisions/0000-template.md',
    target: 'NNNN-....md',
    reason:
      "Placeholder del template ADR. La riga `Status` insegna la FORMA del rimando a un ADR che " +
      'sostituisce, e il segnaposto va copiato come link: renderlo testo insegnerebbe la forma ' +
      'sbagliata a tutti gli ADR futuri. Il file `NNNN-....md` non deve esistere.',
  },
];
