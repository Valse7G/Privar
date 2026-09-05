# Fix — détection cross-device des notes dépensées (swap/send/bridge) + topics d'events corrompus

## Contexte

Session d'audit sur `privar-frontend-v19_2_0-noteengine.zip` /
`privar-contracts-v5_3_0-noteengine.zip`, faisant suite aux changelogs
précédents (`CHANGELOG-note-lifecycle-fix.md`,
`CHANGELOG-tx-history-decimals-fix.md`, `NOTE-ENGINE-PROGRESS.md`). Ces
changelogs affirmaient que la ledger `pendingOps`
(`lockNotesForOp`/`finalizeOp`/`watchPendingOps`) couvrait entièrement la
détection des dépenses via swap/send/bridge (en complément de
`reconcileAndVerifyNotes()`, qui ne vérifiait que `Withdrawn`). Cette
affirmation était vraie **uniquement sur l'appareil qui a effectué
l'opération** — un écart resté non détecté jusqu'à cette session.

## Problème 1 (racine, notes privées) — solde fantôme cross-device

`pendingOps` est un registre `localStorage`, donc strictement local à
l'appareil qui a créé l'opération via `lockNotesForOp()`. Si une note est
dépensée via swap/send/bridge sur l'appareil A, puis réapparaît sur
l'appareil B (par `scanStealthNotes()`, `scanNoteRelay()`, ou un resync
CloudVault qui redécode la même entrée on-chain immuable), l'appareil B
n'a **aucun** enregistrement `pendingOps` pour cette opération — elle n'y
a jamais été créée. `watchPendingOps()` n'a donc rien à résoudre, et
`reconcileAndVerifyNotes()` ne vérifiait que les events `Withdrawn`
— jamais `PrivateSwap`/`ShieldedSent`/`PrivateBridged`/`Bridged`.

**Effet concret** : une note légitimement dépensée sur un appareil pouvait
rester indéfiniment comme solde disponible fantôme sur tout autre
appareil — exactement le symptôme "solde local > TVL" / "un token
disparaît sans que l'autre n'apparaisse" rapporté dans les sessions
précédentes, jamais totalement refermé malgré le fix du cycle de vie des
notes (qui, lui, couvre correctement le cas mono-appareil).

## Problème 2 (affichage) — topics d'events corrompus dans la table `EV`

En vérifiant les hashs utilisés par `buildTxHistoryFromChain()`, six des
neuf constantes ne correspondaient à **aucun** event réel des contrats
fournis (recalculées et vérifiées octet pour octet avec une implémentation
Keccak-256 pure Python, elle-même validée contre le sélecteur ERC20
`transfer(address,uint256)` = `0xa9059cbb` avant usage) :

- `EV.SwapExecuted` ≠ `PrivateSwap(...)` — alors que `EV2.PrivateSwap`
  (autre table du même fichier, utilisée pour les stats protocolaires)
  avait, lui, la bonne valeur. Preuve d'une dérive silencieuse entre deux
  tables cencées être identiques.
- `EV.BridgeInitiated` ≠ `PrivateBridged(...)` (nouveau chemin adaptateur,
  sur `PrivarShieldVault`) ni `Bridged(...)` (ancien chemin, sur
  `LiFiPrivacyBridge` — contrat différent, jamais interrogé du tout).
- `EV.ShieldedTransferProcessed` ≠ `ShieldedSent(...)`.
- `EV.Staked` / `EV.Unstaked` / `EV.RewardsClaimed` ne correspondaient à
  aucune des signatures réelles de `PrivarStaking.sol` (l'ancien
  commentaire du code citait même une signature `Staked` à 6 paramètres —
  la vraie n'en a que 5).

**Effet concret** : ces six types d'entrées (Swap, Bridge, Send, Stake,
Unstake, Claim Rewards) ne pouvaient **jamais** apparaître dans
l'historique des transactions, quel que soit le volume d'activité réel —
le scan ne matchait tout simplement aucun log.

## Piège évité en corrigeant le problème 2

`PrivateSwap`/`ShieldedSent`/`PrivateBridged` n'indexent PAS l'adresse de
l'utilisateur on-chain (par conception — c'est tout l'intérêt d'un
protocole shielded : seuls le nullifier et le commitment sont publics).
Corriger uniquement le hash sans rien d'autre aurait fait remonter, dans
l'historique de **chaque** utilisateur, les swaps/sends/bridges de **tous
les autres utilisateurs** du contrat — une régression de confidentialité,
pas un correctif.

## Solution

### `reconcileAndVerifyNotes()` (`src/DApp.jsx`)
Le set de nullifiers "dépensés" est maintenant construit à partir de
**cinq** scans au lieu d'un seul : `Withdrawn` (inchangé) +
`PrivateSwap` + `ShieldedSent` + `PrivateBridged` (tous trois sur
`PrivarShieldVault`) + `Bridged` legacy (sur `LiFiPrivacyBridge`, si
déployé). Le nullifier est toujours à `topics[1]` pour ces cinq events —
même technique de recalcul déterministe `Poseidon(secret, commitment)`
déjà en place pour `Withdrawn`, simplement étendue aux trois autres
chemins de dépense. C'est cette fonction — et non `watchPendingOps` —
qui est désormais le mécanisme réellement device-agnostique.

### `buildTxHistoryFromChain()` (`src/DApp.jsx`)
- Table `EV` : les six hashs corrigés et renommés d'après les vrais noms
  d'events (`PrivateSwap`, `ShieldedSent`, `PrivateBridged`, `Bridged`,
  `Staked`, `Unstaked`, `RewardsClaimed`) pour qu'une future dérive soit
  visible à l'inspection plutôt que de matcher silencieusement zéro log.
- Shield/Withdraw/Stake/Unstake/Claim : scan on-chain inchangé dans son
  principe (ces events indexent bien une adresse), profite simplement des
  hashs corrigés.
- Swap/Send/Bridge : **plus jamais scannés on-chain** (pour la raison de
  confidentialité ci-dessus). Nouvelle fonction `buildLocalOpTxEntries()`
  qui les reconstruit depuis le registre local `pendingOps`
  (`getPendingOps`), déjà tenu à jour par `lockNotesForOp`/`finalizeOp`
  avec un vrai `txHash` et un vrai horodatage local dès qu'une opération
  est confirmée. Limite assumée et documentée : ces trois types
  d'entrées restent **par appareil** (un swap fait sur téléphone
  n'apparaît pas dans l'historique du poste de travail) — même
  compromis structurel déjà accepté ailleurs dans ce fichier pour le coût
  de scan O(n) du relais de notes.
- Tri final : passé de `blockNumber` à l'horodatage réel (`tsRaw`), qui
  existe maintenant pour les deux sources (timestamp de bloc pour les
  events on-chain, `createdAt` local pour les entrées `pendingOps`) — le
  tri par bloc aurait envoyé toutes les entrées Swap/Send/Bridge tout en
  bas de la liste, quelle que soit leur date réelle.

## Non couvert par ce patch

- Le montant affiché pour Swap/Send/Bridge reste "—", comme c'était déjà
  le cas pour Swap/Send avant ce patch (Bridge affichait un montant réel
  auparavant, mais via un scan on-chain non filtré par adresse — donc
  potentiellement le montant d'un tout autre utilisateur). Le registre
  `pendingOps` ne conserve localement que la note de monnaie rendue
  (change), pas le montant brut réellement sorti du pool — l'afficher
  aurait nécessité soit d'inventer un chiffre, soit d'élargir la ledger
  elle-même (hors périmètre de cette session).
- Récupération cross-device de l'historique Swap/Send/Bridge lui-même
  (pas juste la détection de dépense, déjà corrigée) : reste par
  construction impossible sans qu'un contrat indexe une adresse sur ces
  events — limitation structurelle du design privacy-first, pas un bug.

## Fichiers modifiés
- `src/DApp.jsx` uniquement. Aucun changement de contrat, aucun
  changement d'adresse déployée.
