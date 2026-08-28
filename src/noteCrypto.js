// ═══════════════════════════════════════════════════════════════════════
//  NOTE ENGINE — spec de note figée + dérivation déterministe
//  Réf. Analyse-Private-Send-Privar.md §7.6, §8.3, §17.2
//
//  Décisions figées (validées avec l'équipe, 2026-08) :
//    - Fonction de hash  : Poseidon (BN254 scalar field), PAS keccak256.
//      Choisi dès le départ pour être circuit-natif (coût en contraintes
//      R1CS très inférieur à keccak à l'intérieur d'un futur circuit
//      Groth16) — évite une migration ultérieure coûteuse.
//    - Modèle de secret  : un secret aléatoire PAR NOTE (pas de dérivation
//      HD racine+index).
//    - Courbe pour pubkey_owner / ECDH : Baby Jubjub (Twisted Edwards sur le
//      même corps que Poseidon) — cohérent avec le choix Poseidon ci-dessus,
//      et nécessaire pour que "connaissance de secret tel que
//      pubkey_owner = secret·G" soit prouvable en circuit à coût raisonnable.
//
//  Dépendances externes (à ajouter à package.json, absentes du zero-dep
//  actuel du frontend — voir note en bas de fichier) :
//    - "poseidon-lite"        : Poseidon compatible circomlib, pur JS, zéro
//                                dépendance native, mêmes constantes que ce
//                                qu'un circuit circom généré utiliserait.
//    - "@zk-kit/baby-jubjub"  : opérations sur courbe Baby Jubjub, pur JS.
//
//  ── Spec de note (§8.3, formalisée) ──────────────────────────────────
//  Note {
//    secret          // scalaire privé, local uniquement, jamais transmis
//    blinding        // aléa de masquage, local uniquement
//    pubkeyOwner = secret · G                                   (Baby Jubjub)
//    commitment  = Poseidon(pubkeyOwner.x, pubkeyOwner.y,
//                           amount, token, blinding)             // public
//    nullifier   = Poseidon(secret, commitment)          // public au spend
//    noteId      = Poseidon(secret)                // local uniquement, jamais publié
//  }
//  Ce que le réseau connaît : commitment, nullifier, root, encryptedNote.
//  Ce que le réseau ne connaît jamais : noteId, owner address, secret.
//
//  ── Preuve de possession (§17.2) ─────────────────────────────────────
//  Le futur circuit verifyTransferProof() prouvera :
//    (a) connaissance de `secret` tel que pubkeyOwner = secret·G
//    (b) commitment ∈ arbre au root donné
//    (c) nullifier correctement dérivé de ce secret
//  — triplet standard commitment/nullifier/spend-authority (Zcash Sapling).
// ═══════════════════════════════════════════════════════════════════════

import { poseidon1, poseidon2, poseidon5 } from "poseidon-lite";
import { Base8, mulPointEscalar } from "@zk-kit/baby-jubjub";

// Ordre du sous-groupe Baby Jubjub == ordre scalaire de BN254 (alt_bn128) —
// même corps que Poseidon-lite, condition nécessaire pour que pubkeyOwner
// (un point Baby Jubjub) et le résultat de Poseidon (un élément de F_r)
// vivent dans un espace cohérent pour un futur circuit.
export const FIELD_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// BUG FIX (2026-08-28) — the scalar-multiplication subgroup order for Baby
// Jubjub is NOT the same number as FIELD_R above, despite both floating
// around this codebase as "the Baby Jubjub modulus". FIELD_R is BN254's
// scalar field (Fr) — the BASE field Baby Jubjub's own x/y COORDINATES live
// in (correct for Poseidon inputs/outputs and for encoding point
// coordinates as bytes32). But Baby Jubjub's own point group has a
// DIFFERENT, smaller (~251-bit) prime order — this is what a SCALAR must
// be reduced against before scalar multiplication (`mulPointEscalar`),
// confirmed directly against EIP-2494 (the Baby Jubjub spec) and multiple
// independent implementations (sapling-crypto, zkBob): "Baby Jubjub has
// s = 2736030358979909402780800718157159386076813972158567259200215660948447373041
// as the prime subgroup order, with cofactor 8" — a different, smaller
// number than FIELD_R (~2^251 vs ~2^254).
//
// Mathematically, k·P = (k mod BABYJUBJUB_SUBGROUP_ORDER)·P is always true
// in a group of that order regardless of which modulus (if any) a caller
// pre-reduces k against — a correct double-and-add implementation handles
// ANY integer scalar correctly on its own. This fix closes a real
// correctness risk this codebase had NO way to rule out otherwise (no
// network access here to install and empirically test
// @zk-kit/baby-jubjub's actual tolerance for a scalar larger than its own
// group order), by aligning with the documented, standard modulus instead
// of relying on a specific library implementation detail. Used ONLY where
// a scalar feeds into mulPointEscalar (pubkeyFromSecret,
// computeSharedSecret below) — every other use of FIELD_R in this file
// (Poseidon inputs/outputs, encoded point coordinates) is correctly
// FIELD_R and unchanged.
export const BABYJUBJUB_SUBGROUP_ORDER = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;

// ── Helpers hex/bytes (module autonome, pas d'import croisé avec DApp.jsx) ──
function hexToBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
function bytesToBigInt(bytes) {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}
// bytes32 hex, toujours 32 octets — c'est le format attendu par les
// paramètres bytes32 des fonctions du contrat (nullifier, commitment, root).
export function fieldToBytes32(x) {
  const v = ((x % FIELD_R) + FIELD_R) % FIELD_R;
  return "0x" + v.toString(16).padStart(64, "0");
}
export function bytes32ToField(hex) {
  return bytesToBigInt(hexToBytes(hex)) % FIELD_R;
}
function reduceMod(bytes) {
  return bytesToBigInt(bytes) % FIELD_R;
}

// ── Dérivation du scalaire à partir d'octets d'entropie ────────────────
// Utilisé à la fois pour le secret de note (aléa local, §7.6) et pour le
// spendingKey de portefeuille (dérivé d'une signature, voir DApp.jsx —
// ensureSpendKeyReady). Un simple modulo FIELD_R introduit un biais
// négligeable (~2^-128 sur 32 octets) — acceptable ici, standard dans les
// implémentations JS de ce type (ex. MACI formatPrivKeyForBabyJub fait de même).
export function scalarFromEntropy(bytesOrHex) {
  const bytes = typeof bytesOrHex === "string" ? hexToBytes(bytesOrHex) : bytesOrHex;
  return reduceMod(bytes);
}

// ── Génération d'un secret de note (aléatoire, un secret par note — §8.3.2) ──
export function randomNoteSecret() {
  return scalarFromEntropy(crypto.getRandomValues(new Uint8Array(32)));
}
export function randomBlinding() {
  return scalarFromEntropy(crypto.getRandomValues(new Uint8Array(32)));
}

// ── pubkeyOwner = secret · G (Baby Jubjub) ──────────────────────────────
export function pubkeyFromSecret(secret) {
  // BUG FIX (2026-08-28) — reduce mod the curve's own subgroup order for
  // the scalar multiplication, NOT FIELD_R. See BABYJUBJUB_SUBGROUP_ORDER's
  // doc comment above.
  const [x, y] = mulPointEscalar(Base8, secret % BABYJUBJUB_SUBGROUP_ORDER);
  return [x, y];
}

// ── token address (20 octets) → élément de corps (tient largement dans
//    les 254 bits du corps BN254) ───────────────────────────────────────
export function tokenToField(tokenAddress) {
  return bytesToBigInt(hexToBytes(tokenAddress)) % FIELD_R;
}

// ── commitment = Poseidon(pubkeyOwner.x, pubkeyOwner.y, amount, token, blinding) ──
// amount attendu en unités on-chain (BigInt), déjà < FIELD_R dans tous les
// cas réalistes (USDC/EURC 6 décimales, cirBTC 8 décimales).
export function computeCommitment({ pubkeyOwner, amount, token, blinding }) {
  const amt = BigInt(amount) % FIELD_R;
  const tok = typeof token === "string" ? tokenToField(token) : BigInt(token) % FIELD_R;
  return poseidon5([pubkeyOwner[0], pubkeyOwner[1], amt, tok, blinding]);
}

// ── nullifier = Poseidon(secret, commitment) ────────────────────────────
// Lien cryptographique manquant identifié dans l'analyse (§2, §17.2) :
// remplace nullifier = randomBytes32().
export function computeNullifier(secret, commitment) {
  return poseidon2([secret, commitment]);
}

// ── noteId = Poseidon(secret) — référence locale uniquement, jamais publiée ──
export function computeNoteId(secret) {
  return poseidon1([secret]);
}

// ═══════════════════════════════════════════════════════════════════════
//  Construction d'une note complète (façade pratique pour DApp.jsx)
// ═══════════════════════════════════════════════════════════════════════
//
// createOwnedNote(): pour une note dont LE PORTEFEUILLE LOCAL est le
// propriétaire (deposit, monnaie/change d'un send). pubkeyOwner est dérivé
// du spendingKey du portefeuille courant.
//
// Pour une note envoyée à un tiers (§7.5/§8.4 point 4, pas encore câblé
// dans cette étape), le commitment devra être construit avec le
// pubkeyOwner DU DESTINATAIRE — nécessite que celui-ci publie sa clé
// Baby Jubjub quelque part (ViewKeyRegistry actuel = P-256, incompatible
// en l'état ; voir TODO_THIRD_PARTY_PUBKEY plus bas). Non couvert par
// cette fonction.
export function createOwnedNote({ spendingKey, amount, token, blinding }) {
  const secret = spendingKey;
  const pubkeyOwner = pubkeyFromSecret(secret);
  const b = blinding ?? randomBlinding();
  const commitment = computeCommitment({ pubkeyOwner, amount, token, blinding: b });
  const noteId = computeNoteId(secret);
  return {
    secret: fieldToBytes32(secret),
    blinding: fieldToBytes32(b),
    pubkeyOwner: [fieldToBytes32(pubkeyOwner[0]), fieldToBytes32(pubkeyOwner[1])],
    commitment: fieldToBytes32(commitment),
    noteId: fieldToBytes32(noteId),
  };
}

// Calcule le nullifier d'une note existante au moment de la dépenser.
// `secretHex`/`commitmentHex` sont les champs bytes32 stockés sur la note
// locale (voir createOwnedNote ci-dessus / getNotes()).
export function deriveNullifierForSpend(secretHex, commitmentHex) {
  const secret = bytes32ToField(secretHex);
  const commitment = bytes32ToField(commitmentHex);
  return fieldToBytes32(computeNullifier(secret, commitment));
}

// TODO_THIRD_PARTY_PUBKEY (§7.5, §8.4 point 4) : RÉSOLU — voir
// contracts/core/PrivarSpendKeyRegistry.sol (nouveau contrat) et
// DApp.jsx's ensureSpendKeyRegistered()/getRecipientSpendPubKey(). Pour
// construire le commitment de sortie d'un shieldedSend vers un tiers B, le
// pubkeyOwner Baby Jubjub de B est maintenant disponible via ce registre
// une fois que B s'y est enregistré (self-registration, comme
// ViewKeyRegistry) — falls back à un commitment aléatoire si B ne s'est
// pas encore enregistré (dégradation gracieuse, comme partout ailleurs
// dans ce fichier).

// ═══════════════════════════════════════════════════════════════════════
//  ECDH / view tag (§7.5) — même courbe Baby Jubjub que pubkeyOwner
// ═══════════════════════════════════════════════════════════════════════
//
// Objectif du plan (§7.5) : remplacer la découverte par "adresse du
// destinataire en clair" par un view tag dérivé d'un secret partagé ECDH —
// seul le destinataire (qui connaît son propre secret) peut retrouver ses
// notes en scannant les view tags publiés, sans que quiconque d'autre ne
// puisse relier un tag à une adresse.
//
// Limite assumée : ViewKeyRegistry.sol (le relais actuel de emitNote())
// n'est PAS dans ce package — impossible d'en changer la signature
// (recipient address toujours en paramètre public de emitNote()). Les
// primitives ci-dessous sont prêtes à l'emploi mais ne sont pas encore
// câblées dans le flux emitNote() existant ; ça nécessiterait soit une
// extension de ViewKeyRegistry (hors périmètre), soit un nouveau relais
// dédié — décision à prendre à la prochaine étape, pas encore tranchée ici.

// Génère une paire éphémère locale (scalaire + point), à usage unique par envoi.
export function generateEphemeralKeyPair() {
  const scalar = randomNoteSecret();
  const pubkey = pubkeyFromSecret(scalar);
  return { scalar, pubkey };
}

// Secret partagé ECDH : scalar · otherPubkey (Diffie-Hellman standard sur
// courbe elliptique). Utilisable dans les deux sens — expéditeur avec
// (ephemeralScalar, pubkeyOwnerDestinataire), destinataire avec
// (spendingKey, ephemeralPubkey) — donnent le même point par commutativité
// de la multiplication scalaire.
// BUG FIX (2026-08-28) — same subgroup-order fix as pubkeyFromSecret above.
export function computeSharedSecret(scalar, otherPubkey) {
  const [x, y] = mulPointEscalar(otherPubkey, scalar % BABYJUBJUB_SUBGROUP_ORDER);
  return [x, y];
}

// viewTag = Poseidon(sharedSecret.x) — valeur publique courte, publiable
// sans révéler ni l'expéditeur ni le destinataire à un observateur tiers
// qui ne connaît pas le secret partagé.
export function computeViewTag(sharedSecretPoint) {
  return poseidon1([sharedSecretPoint[0]]);
}

/*
  ── package.json — dépendances à ajouter ────────────────────────────────
  "dependencies": {
    "poseidon-lite": "^0.3.0",
    "@zk-kit/baby-jubjub": "^1.0.3"
  }
  Le frontend est actuellement zero-dep (seul react/react-dom sont listés,
  tout le reste — RLP/ABI encoding, keccak selectors — est fait main). Ces
  deux libs sont pures JS, sans dépendance native ni WASM, cohérentes avec
  cette contrainte : `npm install poseidon-lite @zk-kit/baby-jubjub` avant
  le prochain build.
*/
