// UUID in forma canonica 8-4-4-4-12, SENZA vincolo di versione/variante RFC-4122: il seed di
// sviluppo e l'id del tenant usano UUID sintetici che Postgres accetta come `uuid` ma che @IsUUID()
// rifiuterebbe. Validiamo la *forma* e lasciamo alla FK il controllo di esistenza nel tenant.
export const UUID_SHAPE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
