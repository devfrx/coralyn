import { Global, Module } from '@nestjs/common';
import { PasswordHasher } from './password-hasher';

/**
 * `PasswordHasher` come singleton di processo (radice R-D: «l'API del modulo condiviso è troppo
 * stretta: violarla costa meno che estenderla»).
 *
 * Prima di questo modulo lo ri-provvedevano CINQUE moduli — identity, credential, customer-auth,
 * establishment, platform — ciascuno con la propria istanza. Due di essi lo motivavano con «per non
 * creare una dipendenza circolare Identity↔Credential»: la giustificazione è vera **solo** per
 * `CredentialModule`, che `IdentityModule` importa davvero. Per platform, establishment e
 * customer-auth il ciclo non esiste e non è mai esistito — il commento è stato copiato.
 *
 * `@Global` scioglie il nodo per tutti insieme, cicli compresi: un modulo globale non va importato,
 * quindi non può chiudere un anello. È la stessa scelta già fatta per `PrismaService`.
 */
@Global()
@Module({
  providers: [PasswordHasher],
  exports: [PasswordHasher],
})
export class CryptoModule {}
