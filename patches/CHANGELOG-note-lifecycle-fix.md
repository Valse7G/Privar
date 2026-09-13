# Fix — cycle de vie des notes privées (swap / send / withdraw / bridge)

## Problème corrigé
- Notes privées inutilisables après un swap (succès ou échec) alors qu'elles restent visibles.
- USDC qui disparaît sans que l'EURC correspondant n'apparaisse.
- Désync TVL on-chain vs solde local ("local balance is Higher than TVL balance").
- Confirmation de transaction figée sans résolution.

## Cause racine
1. `reconcileAndVerifyNotes()` ne pouvait détecter que les `withdraw()` explicites
   (event `Withdrawn`). Les dépenses via swap/send/bridge passent par
   `withdrawManager.processWithdrawal()` (event `WithdrawalProcessed`, autre contrat)
   — jamais scanné.
2. Plus profond : le `nullifier` utilisé pour dépenser une note n'est **jamais
   persisté** sur l'objet note (généré à la volée au moment de la dépense). Aucun
   scan d'event, même corrigé, ne peut donc faire la correspondance a posteriori.
3. Race read-modify-write : `swap()`/`send()`/`withdraw()`/`bridge()` lisaient
   `notes` au tout début de la fonction et réécrivaient ce snapshot à la fin,
   après plusieurs secondes (jusqu'à 60s) d'opérations async — tout changement
   local survenu entre-temps (réconciliation en arrière-plan, resync CloudVault)
   était silencieusement écrasé.
4. Aucun état persistant du cycle de vie de la transaction — un timeout de
   `waitForReceipt()` (60s) était traité comme un échec définitif sans jamais
   revérifier si la transaction avait fini par confirmer plus tard.

## Solution
Nouveau registre "pending ops" (voir le bloc de commentaires en tête de
`src/DApp.jsx`, juste après `getNotes`/`saveNotes`) :

- `lockNotesForOp()` — verrouille les notes d'entrée **avant** l'envoi de la
  transaction (lecture fraîche systématique, jamais un snapshot périmé).
- `markOpSubmitted()` — capture le `txHash` dès qu'il existe, via le nouveau
  paramètre optionnel `onHash` de `sendRealTx` (100% rétrocompatible — tous les
  autres appelants ne le passent pas).
- `finalizeOp()` — idempotent. SUCCESS crée les notes de sortie et supprime les
  entrées ; REVERTED/ABANDONED restaure les entrées en `available` ; `unknown`
  ne touche jamais aux notes (invariant : PENDING ≠ SUCCESS, PENDING ≠ ÉCHEC).
- `checkReceiptOutcome()` + `watchPendingOps()` — distingue un revert confirmé
  (safe à restaurer) d'un timeout/RPC (on laisse verrouillé) ; le watcher est
  branché sur le même cycle de 2 min que `reconcileAndVerifyNotes` et résout
  toute opération laissée en suspens par un onglet fermé ou une déconnexion.

Appliqué identiquement à `swap()`, `sendShielded()`, `withdraw()` (note unique
et batch), `bridge()`. La sélection de note exclut désormais les notes
`status === "locked"` pour empêcher un double-usage local pendant qu'une
opération est en vol.

## Fichier modifié
- `src/DApp.jsx` uniquement. Aucun changement de contrat, aucun changement
  d'adresse déployée.

## Non couvert par ce patch (hors périmètre demandé)
- Affichage UI distinct "verrouillé / disponible" dans le solde shieldé — les
  notes verrouillées comptent toujours dans le total affiché, seule la
  sélection pour dépense les exclut.
- Nettoyage de la branche morte de correspondance par nullifier dans
  `reconcileAndVerifyNotes()` (laissée en l'état, commentée, pour un diff
  minimal — elle ne fait jamais rien mais ne casse rien non plus).
