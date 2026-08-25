# Note Engine — spec figée & suivi d'implémentation

Réf. `Analyse-Private-Send-Privar.md`. Décisions prises (2026-08, validées) :
- Hash : **Poseidon** (BN254 scalar field) dès le départ — pas de keccak256 transitoire.
- Secret : **un secret aléatoire par note** — pas de dérivation HD racine+index.
- Périmètre : implémentation complète, livrée étape par étape, packaging final seulement en fin de chantier.

## Spec de note (§8.3, figée)

```
secret          — scalaire privé, local uniquement, jamais transmis
blinding        — aléa de masquage, local uniquement
pubkeyOwner     = secret · G                                          (Baby Jubjub)
commitment      = Poseidon(pubkeyOwner.x, pubkeyOwner.y, amount, token, blinding)   // public
nullifier       = Poseidon(secret, commitment)                        // public au spend
noteId          = Poseidon(secret)                     // local uniquement, jamais publié
```

Implémentée dans `src/noteCrypto.js`.

## Roadmap (§8.4) — statut

| # | Étape | Statut |
|---|---|---|
| 0 | Spec de note figée | ✅ fait — `src/noteCrypto.js` |
| 1 | Dérivation déterministe côté client (§7.6) | ✅ **fait** — deposit/send/swap/withdraw(+batch)/bridge, tous migrés |
| 2 | View tag au lieu d'adresse en clair (§7.5) | ✅ **fait** — nouveau relais `PrivarNoteRelay`, voir détail |
| 3 | `PrivarTransferEngine` interne + `privateSend()` façade (contrat) | ✅ **déjà en place dans le zip fourni** — voir note ci-dessous |
| 4 | `deposit()` avec destinataire tiers | ✅ fait — voir détail ci-dessous |
| 9.4 | Bridge multi-adaptateurs (`IPrivarBridgeAdapter` + whitelist) | ✅ **fait, UI câblée** — voir détail ci-dessous |

### ⚠️ Découverte importante (session 2)

Le zip `privar-contracts-v5_2_0-security-audit.zip` fourni contient **déjà** le fix décrit en §3/§6 du document d'analyse pour `shieldedSend()` : la fonction délègue à `withdrawManager.processShieldedSend()`, qui appelle le verifier — exactement le pattern "Option A" proposé par le plan. Ce n'est donc plus un écart de sécurité ouvert (seul le verifier reste un mock, comme pour `withdraw()` — non spécifique à send). Le document d'analyse initial semble avoir été écrit sur une version antérieure du contrat.

### Étape 9.4 — Private Bridge multi-adaptateurs — ✅ fait

- `contracts/interfaces/IPrivarBridgeAdapter.sol` (nouveau) — même pattern que `IPrivarSwapRouter`.
- `contracts/adapters/LiFiBridgeAdapter.sol` (nouveau) — adaptateur LI.FI conforme, généralise `LiFiPrivacyBridge` (qui reste déployé tel quel, inchangé, pour compat ascendante).
- `PrivarShieldVault.sol` — ajout de `bridgeAdapterWhitelist`, `setBridgeAdapterWhitelist()`, `getWhitelistedBridgeAdapters()`, et `privateBridgeWithAdapter()` (miroir exact de `privateSwapWithRouter()` : unshield → adaptateur whitelisté → fonds quittent le pool, atomique).
- `contracts/test/PrivarMockBridgeAdapter.sol` (nouveau, tests) + suite de tests dans `test/PrivarShieldVault.test.js` (whitelist, push-then-call, NullifierSpent, revert bubbling).
- `scripts/deploy-lifi-bridge-adapter.js` (nouveau) — déploiement incrémental, pas de redeploy complet nécessaire.
- **Pas encore exécuté** : `npx hardhat test` (pas de `node_modules`/réseau dans cet environnement d'édition) — à lancer côté utilisateur avant merge. Vérifications manuelles faites : équilibre accolades/parenthèses sur tous les fichiers touchés, cohérence des imports/signatures avec le code existant (`SafeERC20.safeApprove`, constante `USDC`).

### Détail étape 1 (frontend, `DApp.jsx`) — session 4, complet

- ✅ `ShieldPanel.submit()` (deposit) — commitment déterministe.
- ✅ `SendPanel.sendShielded()` — nullifier + commitmentOut (self ET tiers via `PrivarSpendKeyRegistry`) + change, tous déterministes.
- ✅ `swap()` — nullifier de la note dépensée déterministe ; `commitmentOut` (output du swap, toujours auto-détenu) calculé APRÈS `noteAmountOut` (montant net de frais réellement crédité on-chain, pas `outAmountBig` brut — sinon le commitment aurait embarqué le mauvais montant) ; change déterministe.
- ✅ `withdraw()` — chemin single-note ET chemin `withdrawBatch()` (fragmentation) : nullifier(s) déterministe(s) par note dépensée, change toujours auto-détenu donc toujours déterministe (indépendamment du `target` de paiement, qui peut être un tiers).
- ✅ `bridge()` (UI legacy `LiFiPrivacyBridge`) — même traitement : nullifier + change déterministes.

Partout : fallback `randomBytes32()` conservé mais **seulement** pour (a) notes legacy sans champ `secret`, ou (b) `spendingKey` indisponible (signature wallet pas encore mise en cache) — dégradation gracieuse, jamais un chemin par défaut silencieux.

**Non fait** : le flux UI `bridge()` actuel cible toujours `LiFiPrivacyBridge` (l'ancien contrat standalone), pas le nouveau `privateBridgeWithAdapter()`/`bridgeAdapterWhitelist` construit en session 3. Câbler l'UI dessus (choix d'adaptateur, sémantique `destChainId` par adaptateur) est un chantier UI séparé, pas encore fait.

### Session 5 — UI bridge câblée sur le nouveau chemin multi-adaptateurs

- `contracts.js` : sélecteur + builder `buildPrivateBridgeWithAdapterCalldata` (12 params, 2 `bytes` dynamiques — tête/queue vérifiées à la main), `CONTRACTS.LiFiBridgeAdapter` (zero-address par défaut, dégradation gracieuse).
- `DApp.jsx` `bridge()` : bascule automatique — utilise `privateBridgeWithAdapter()` sur `PrivarShieldVault` quand `LiFiBridgeAdapter` est déployé (`VITE_LIFI_BRIDGE_ADAPTER` défini), sinon retombe sur l'ancien chemin `LiFiPrivacyBridge` inchangé. Le `fromAddress` de la requête de route LI.FI est ajusté en conséquence (`LiFiBridgeAdapter` détient et transmet les fonds sur ce nouveau chemin, pas `LiFiPrivacyBridge`) — point de correction important, sinon LI.FI aurait pu construire un calldata avec la mauvaise adresse comme détentrice des fonds côté Arc.
- Sélecteur `privateBridgeWithAdapter` recalculé et vérifié avec la même implémentation Keccak-256 pure Python que la session précédente.

### Session 6 — `deposit()` avec destinataire tiers (§8.4 point 4)

`PrivarShieldVault.deposit()` lui-même n'a nécessité **aucune modification contrat** : il prend déjà un `commitment` opaque en paramètre, sans savoir/se soucier de quel `pubkeyOwner` y est embarqué — donc n'importe qui pouvait déjà déposer pour n'importe quel commitment. Le travail restant était entièrement côté frontend : construire ce commitment de façon déterministe pour un tiers, et le lui transmettre.

- `ShieldPanel` : nouveau champ optionnel `DEPOSIT TO` (0x address, vide = comportement inchangé = soi-même).
- **Garde-fou critique, différent de `sendShielded()`** : si le destinataire n'a pas enregistré de clé sur `PrivarSpendKeyRegistry`, le dépôt est **bloqué** (pas de repli sur un commitment aléatoire). Contrairement à un send (où le pire cas est juste "pas de garantie de déterminisme"), un dépôt tiers avec un commitment aléatoire créerait des fonds que **personne** ne pourrait jamais prouver posséder ni dépenser — perte définitive, pas juste une dégradation.
- Une fois le destinataire vérifié : `blinding` généré côté déposant, commitment calculé contre le `pubkeyOwner` du destinataire, transmis via le même relais chiffré `ViewKeyRegistry.emitNote()` que `sendShielded()` (tx séparée, non bloquante, après confirmation du dépôt).
- Aucune note locale sauvegardée côté déposant (ce n'est pas sa note) ; aucun journal `NoteJournal` propre émis dans ce cas (rien à ajouter à son propre journal).

### Session 7 — Résolution du dernier point ouvert (§7.5, relais sans adresse en clair)

Décision prise : plutôt que d'étendre `ViewKeyRegistry` (impossible, pas le code source) ou d'y renoncer, nouveau contrat dédié.

- **`PrivarNoteRelay.sol`** (nouveau, standalone, permissionless) : `relayNote(bytes32 viewTag, bytes encryptedNote, bytes ephemeralPubKey)` — **aucun paramètre destinataire**, contrairement à `ViewKeyRegistry.emitNote(address recipient, ...)`. Chaque entrée est diffusée identiquement à tout le monde ; seul le destinataire qui refait l'ECDH avec sa propre clé peut savoir qu'une entrée lui est adressée.
- **Compromis assumé et documenté dans le contrat** : pas de topic indexé par destinataire possible (c'est précisément la fuite qu'on supprime) → chaque wallet doit scanner **tout** le flux de notes et tenter l'ECDH+comparaison de `viewTag` sur chaque entrée, au lieu de filtrer côté serveur par son adresse. Coût O(total des notes relayées) au lieu de O(notes qui me sont adressées) — même compromis fondamental que Monero / silent payments BIP-352. Acceptable au volume actuel/attendu sur testnet ; non résolu : un futur bucketing par tag tronqué pourrait réduire ce coût sans réintroduire de fuite — hors périmètre ici.
- `test/PrivarNoteRelay.test.js` + `scripts/deploy-note-relay.js`.
- Frontend : `buildNoteRelayCalldata()` (émission) et `scanNoteRelay()` (scan, même pattern de pagination/backoff que `scanStealthNotes()`, réutilise `hkdf`/`aesEncrypt`/`aesDecrypt` déjà existants pour le chiffrement symétrique dérivé du secret partagé ECDH Baby Jubjub).
- `sendShielded()` et le dépôt tiers de `ShieldPanel` préfèrent maintenant `PrivarNoteRelay` quand disponible (déployé + `pubkeyOwner` du destinataire connu via `PrivarSpendKeyRegistry`), et retombent sur `ViewKeyRegistry.emitNote()` sinon — additif, aucune régression.
- `ViewKeyRegistry.sol` reste totalement inchangé et continue de fonctionner comme avant pour tout le reste (chiffrement ECIES hors-circuit).

**Tous les points ouverts identifiés au fil des sessions sont maintenant traités.** Restent uniquement des actions côté utilisateur (voir en tête de fichier) : `npm install`, `npx hardhat test`, déploiement des nouveaux contrats (`PrivarSpendKeyRegistry`, `LiFiBridgeAdapter`, `PrivarNoteRelay`) et configuration des variables d'environnement correspondantes avant la livraison finale des archives.

### Étape 2 (§7.5) — mise à jour session 3

**`PrivarSpendKeyRegistry.sol`** (nouveau contrat, standalone, sans lien avec le vault) : registre de clés Baby Jubjub pour la découverte de `pubkeyOwner` de tiers — même pattern self-registration que `ViewKeyRegistry`, mais sur une courbe circuit-native, séparée de la clé de vue P-256 existante (raison détaillée en commentaire du contrat). Débloque `commitmentOut` déterministe pour un **vrai envoi à un tiers** dans `sendShielded()` (avant : déterministe seulement en self-send).

- `contracts/core/PrivarSpendKeyRegistry.sol` + `test/PrivarSpendKeyRegistry.test.js` + `scripts/deploy-spend-key-registry.js`.
- `contracts.js` : sélecteurs `registerSpendKey/removeSpendKey/hasSpendKey/getSpendKey` (calculés via une implémentation Keccak-256 pure Python écrite et validée en session contre les 5 sélecteurs déjà connus du fichier, avant d'être utilisés), + builders de calldata.
- `DApp.jsx` : `ensureSpendKeyRegistered()` (miroir de `ensureViewKeyRegistered()`, appelée à la connexion), `getRecipientSpendPubKey()` (lookup), et `sendShielded()` mis à jour — pour un envoi à un tiers ayant enregistré sa clé, le `blinding` est généré côté expéditeur et transmis dans le payload chiffré existant (`noteJson`) ; côté destinataire, `scanStealthNotes()` complète la note reçue avec son propre `secret`/`pubkeyOwner` dès que `blinding` est présent, la rendant dépensable comme une note auto-créée.
- Fallback random inchangé si le destinataire n'a pas encore enregistré de clé (dégradation gracieuse).

**Limite assumée, non résolue cette session** : le paramètre `recipient` de `ViewKeyRegistry.emitNote()` (relais actuel des notes chiffrées) reste en clair on-chain — `ViewKeyRegistry.sol` n'est pas dans ce package, impossible d'en changer la signature. Les primitives `computeViewTag`/`computeSharedSecret`/`generateEphemeralKeyPair` sont prêtes dans `noteCrypto.js` mais pas câblées dans le flux `emitNote()`. Vraie résolution : soit étendre `ViewKeyRegistry` (hors périmètre, pas le code source), soit un nouveau contrat de relais dédié utilisant le view tag à la place de l'adresse — **décision à prendre à la prochaine étape**, pas tranchée ici.

## Dépendances ajoutées (`package.json`)

```json
"poseidon-lite": "^0.3.0",
"@zk-kit/baby-jubjub": "^1.0.3"
```
Pures JS, zéro dépendance native — cohérent avec le frontend zero-dep actuel. `npm install` requis avant le prochain build (pas de réseau dans cet environnement d'édition).
