# Fix — historique des transactions : montants USDC gonflés ×1e12

## Problème corrigé
Panneau "Transaction History" : les montants USDC natif (Shield/Withdraw)
s'affichaient avec un facteur ×1e12 (ex. `9970000000000.00 USDC` au lieu de
`9.97 USDC`). Les Withdraw/Bridge d'EURC ou cirBTC pouvaient aussi s'afficher
avec le mauvais symbole ("USDC" en dur).

## Cause racine (vérifiée jusque dans le contrat)
`PrivarShieldVault.deposit()` impose `msg.value == amount` pour l'USDC natif
— donc `amount`, et tout ce qu'émettent `Deposited`/`Withdrawn`, est en wei
18 décimales (cohérent avec `NATIVE_TO_ERC20` = 1e12 utilisé partout ailleurs
dans le code pour l'envoi de transactions). `buildTxHistoryFromChain()`
faisait `Number(amount)/1e6` sans distinction pour toutes les entrées —
correct pour l'EURC (vrai ERC20 6-dec) et pour le staking (voir nuance
ci-dessous), mais faux d'un facteur exact 1e12 pour l'USDC natif du vault.

Second bug, dans le même fichier : la boucle `Withdraw` ignorait
`topics[2]` (l'adresse du token, indexée dans l'event `Withdrawn`) et
affichait "USDC" en dur — contrairement à la boucle `Shield` juste
au-dessus qui la lisait déjà correctement. Même chose trouvée en
implémentant sur la boucle `Bridge`, qui affichait "EURC" en dur quel que
soit le token réellement pontté.

**Nuance importante** (à ne pas casser en corrigeant l'USDC natif du
vault) : `PrivarStaking` déplace ce même token USDC natif via une
interface ERC20 classique (`approve`/`safeTransferFrom`) à ses vraies
6 décimales — PAS l'échelle interne 18-dec du ShieldVault. Les montants
Stake/Unstake/Claim étaient déjà corrects avant ce patch et devaient le
rester.

## Solution
Deux fonctions pures, seule source de vérité, juste après l'objet `EV`
dans `src/DApp.jsx` :

- `decimalsForToken(tokenAddr, { nativeScaled })` — 18 pour l'USDC natif
  en contexte ShieldVault (`nativeScaled: true`, valeur par défaut), 6 en
  contexte PrivarStaking (`nativeScaled: false`), 6 pour EURC, 8 pour cirBTC.
- `symbolForToken(tokenAddr)` — symbole réel à partir de l'adresse, plus de
  libellé en dur.

Les 6 boucles (Shield/Withdraw/Bridge/Stake/Unstake/Claim) utilisent
désormais `formatToken(amount, decimalsForToken(...), precision)` — la
précision d'affichage (2, 2, 4 décimales selon le cas) est restée identique
à l'ancien comportement, seule l'échelle est corrigée.

## Test de non-régression
`scripts/test-tx-history-decimals.mjs` — script autonome (`node
scripts/test-tx-history-decimals.mjs`, aucune dépendance, aucun accès
réseau requis) qui verrouille les 4 catégories de montants (USDC natif
vault-scaled 18-dec, USDC natif staking 6-dec, EURC 6-dec, cirBTC 8-dec)
contre le cas exact du bug rapporté. Toute régression future (ex. un
nouveau `/1e6` codé en dur, ou une inversion du flag `nativeScaled` entre
les deux contextes USDC) fait échouer ce script au lieu de partir en
silence en production.

## Fichiers modifiés/ajoutés
- `src/DApp.jsx` — logique de formatage uniquement, aucun changement de
  contrat, aucun changement d'adresse déployée.
- `scripts/test-tx-history-decimals.mjs` — nouveau.

## Découverte annexe, NON corrigée dans ce patch
En vérifiant les topics d'events utilisés par `buildTxHistoryFromChain()`,
trois des constantes de l'objet `EV` ne correspondent à AUCUN event réel
des contrats fournis (recalculé et vérifié via keccak256 local) :

- `EV.SwapExecuted` ne correspond pas à `PrivateSwap(...)` (le vrai event
  émis par `PrivarShieldVault.sol`).
- `EV.BridgeInitiated` ne correspond pas à `Bridged(...)` (le vrai event
  émis par `LiFiPrivacyBridge.sol`).
- `EV.ShieldedTransferProcessed` ne correspond pas à `ShieldedSent(...)`
  (le vrai event émis par `PrivarShieldVault.sol`).
- `EV.Staked`/`EV.Unstaked`/`EV.RewardsClaimed` ne correspondent pas non
  plus aux signatures actuelles de `PrivarStaking.sol` telles que fournies
  dans l'archive contracts.

Conséquence probable : les entrées Swap, Send, Bridge (et peut-être
Stake/Unstake/Claim) ne remontent **jamais** dans l'historique, quel que
soit ce patch — le scan ne matche simplement aucun log. `EV.Deposited` et
`EV.Withdrawn`, eux, ont été vérifiés corrects (recalculés et comparés
octet pour octet).

Non corrigé ici car risqué à deviner sans le JSON d'ABI réellement déployé
(le contrat source fourni peut différer du bytecode déployé, ou une version
ultérieure du event peut avoir des champs additionnels). **À ré-générer
depuis l'ABI de build au moment du redéploiement complet** plutôt qu'à
recalculer à la main.
