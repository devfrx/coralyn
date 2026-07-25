import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';

/**
 * Hash civetta, a livello di modulo. Da quando `PasswordHasher` è provveduto una volta sola da
 * CryptoModule (@Global, Fase F) l'istanza è già unica; resta qui perché il costo va pagato una
 * volta per PROCESSO e non per istanza, che è la garanzia più forte delle due. Generato da un
 * valore casuale: nessuno conosce la password che lo produce, e la verifica fallisce sempre.
 * Pigro: chi non tocca mai il ramo non lo paga.
 */
let decoyHash: Promise<string> | undefined;

/** Hashing/verifica password con argon2id (ADR-0025). */
@Injectable()
export class PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }

  /**
   * Verifica contro l'hash civetta: ritorna **sempre** `false`, al costo di una verifica vera.
   *
   * Pareggia il ramo «email inesistente» con il ramo «password errata». Senza, `verify` viene
   * eseguito solo se l'utente esiste, e il tempo di risposta distingue un'email registrata da una
   * no: oracolo di enumerazione (D-029). Stessi parametri argon2 degli hash reali, perché è il
   * costo di quei parametri che si sta pareggiando.
   */
  async verifyDecoy(plain: string): Promise<boolean> {
    decoyHash ??= this.hash(randomBytes(32).toString('hex'));
    return this.verify(await decoyHash, plain);
  }
}
