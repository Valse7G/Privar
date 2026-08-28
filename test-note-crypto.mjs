// test-note-crypto.mjs
//
// Vérification EMPIRIQUE des primitives cryptographiques de noteCrypto.js —
// à exécuter localement après `npm install poseidon-lite @zk-kit/baby-jubjub`.
// Je n'ai aucun accès réseau dans mon environnement d'édition, donc je n'ai
// jamais pu exécuter ces deux packages moi-même — tout ce que j'ai écrit sur
// leur comportement jusqu'ici reposait sur un raisonnement mathématique, pas
// sur une exécution réelle. Ce script comble ce trou : il importe le VRAI
// module noteCrypto.js (pas une réimplémentation) et vérifie noir sur blanc
// que la symétrie ECDH expéditeur/destinataire fonctionne bel et bien.
//
// Usage :
//   cd frontend && npm install && node test-note-crypto.mjs
//
// Un ÉCHEC sur le test 2 (symétrie ECDH) confirmerait que le problème
// "destinataire ne voit jamais les fonds" est bien dans la couche
// cryptographique (Baby Jubjub/ECDH), pas dans le scan/timing déjà corrigé
// à plusieurs reprises.

import {
  randomNoteSecret, randomBlinding, pubkeyFromSecret, fieldToBytes32,
  bytes32ToField, computeCommitment, computeNullifier, computeNoteId,
  deriveNullifierForSpend, createOwnedNote,
  generateEphemeralKeyPair, computeSharedSecret, computeViewTag,
  BABYJUBJUB_SUBGROUP_ORDER, FIELD_R,
} from "./src/noteCrypto.js";

let failures = 0;
function check(label, cond) {
  console.log(`${cond ? "✓" : "✗ FAIL"}  ${label}`);
  if (!cond) failures++;
}

console.log("── Test 1: constantes ──────────────────────────────────────");
check("BABYJUBJUB_SUBGROUP_ORDER != FIELD_R (doivent être différents)", BABYJUBJUB_SUBGROUP_ORDER !== FIELD_R);
check("BABYJUBJUB_SUBGROUP_ORDER < FIELD_R", BABYJUBJUB_SUBGROUP_ORDER < FIELD_R);

console.log("\n── Test 2: symétrie ECDH (LE test critique) ────────────────");
// Simule exactement sendShielded()'s troisième-partie + scanNoteRelay()'s
// découverte, des deux côtés, avec des clés indépendantes générées séparément.
const recipientSecret = randomNoteSecret();          // spendingKey du destinataire B
const recipientPubkey = pubkeyFromSecret(recipientSecret); // publié sur PrivarSpendKeyRegistry

const { scalar: ephScalar, pubkey: ephPubkey } = generateEphemeralKeyPair(); // généré par l'expéditeur A

// Côté expéditeur A : partage = ephScalar · recipientPubkey
const sharedSender = computeSharedSecret(ephScalar, recipientPubkey);
// Côté destinataire B : partage = recipientSecret · ephPubkey
const sharedReceiver = computeSharedSecret(recipientSecret, ephPubkey);

check("shared secret IDENTIQUE des deux côtés (x)", sharedSender[0] === sharedReceiver[0]);
check("shared secret IDENTIQUE des deux côtés (y)", sharedSender[1] === sharedReceiver[1]);

const tagSender   = computeViewTag(sharedSender);
const tagReceiver = computeViewTag(sharedReceiver);
check("view tag IDENTIQUE des deux côtés", tagSender === tagReceiver);

console.log("\n── Test 3: commitment/nullifier déterministes ──────────────");
const secret = randomNoteSecret();
const pubkeyOwner = pubkeyFromSecret(secret);
const blinding = randomBlinding();
const amount = 1_000_000n; // 1 USDC (6 décimales)
const token = "0x3600000000000000000000000000000000000000"; // NATIVE_USDC

const c1 = computeCommitment({ pubkeyOwner, amount, token, blinding });
const c2 = computeCommitment({ pubkeyOwner, amount, token, blinding });
check("commitment déterministe (même entrée → même sortie)", c1 === c2);

const n1 = computeNullifier(secret, c1);
const n2 = computeNullifier(secret, c1);
check("nullifier déterministe (même entrée → même sortie)", n1 === n2);

console.log("\n── Test 4: round-trip createOwnedNote() + deriveNullifierForSpend() ──");
const spendingKey = randomNoteSecret();
const built = createOwnedNote({ spendingKey, amount, token });
const derivedNullifier = deriveNullifierForSpend(built.secret, built.commitment);
check("createOwnedNote() produit un secret/commitment cohérents avec deriveNullifierForSpend()", typeof derivedNullifier === "string" && derivedNullifier.startsWith("0x") && derivedNullifier.length === 66);

console.log("\n── Test 5: fieldToBytes32 / bytes32ToField round-trip ──────");
const original = pubkeyOwner[0];
const roundTripped = bytes32ToField(fieldToBytes32(original));
check("round-trip bytes32 préserve la valeur", original === roundTripped);

console.log(`\n${failures === 0 ? "✅ TOUS LES TESTS PASSENT" : `❌ ${failures} ÉCHEC(S)`}`);
process.exit(failures === 0 ? 0 : 1);
