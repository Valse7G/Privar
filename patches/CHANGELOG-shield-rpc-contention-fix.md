# Fix — régression Shield/Swap/Send/Withdraw/Bridge causée par le fix cross-device (surcharge RPC)

## Rapport initial

Après déploiement du fix "cross-device spend detection" (voir
`CHANGELOG-cross-device-spend-detection-fix.md`), le Shield (et
potentiellement toute autre opération) s'est mis à échouer
systématiquement avec, dans l'ordre :
1. `Deposit — Could not verify token support — proceeding anyway.`
2. `Shield — Could not read current fees (slow network) — please retry.`
3. `Shield USDC Failed — Transaction failed`

L'écran affichait un débit très faible (13,4 Ko/s), d'abord attribué au
réseau — écarté par l'utilisateur, qui a confirmé que ces trois messages
n'apparaissaient jamais avec les versions précédentes, sur la même
connexion, avant ce fix précis.

## Diagnostic — cause racine confirmée, pas une hypothèse

Le fix cross-device a fait passer `reconcileAndVerifyNotes()` de **2**
scans d'events (`Withdrawn`, `Deposited`) à **6**
(`Withdrawn`, `Deposited`, `PrivateSwap`, `ShieldedSent`,
`PrivateBridged`, `Bridged` legacy), tous lancés **en parallèle** via
`Promise.all([...])`.

Deux faits, vérifiés directement dans le code existant, expliquent
pourquoi cela suffit à provoquer exactement ces symptômes :

1. **`getScanProgress()`** (définie plus haut dans le fichier) retombe
   sur `fromBlock` (c'est-à-dire le début de la fenêtre de scan, ~5M
   blocs en arrière) dès que la clé de checkpoint `localStorage` n'a
   jamais existé. Les 4 nouveaux scans utilisent des clés **inédites**
   (`privar_reconcile_scanprogress_swap`, `_sent`, `_bridged`,
   `_legacybridge`) — contrairement à `Withdrawn`/`Deposited`, qui ont
   déjà des mois de progression sauvegardée proche du sommet de la
   chaîne. Résultat : au premier chargement après déploiement, ces 4
   scans repartent de (quasi) zéro, sur **chaque** compte, **à chaque
   fois** — donc de façon reproductible, pas intermittente.
2. **`fetchLogsPaginated()`** contient déjà, dans son propre
   commentaire, l'avertissement `"be a good citizen — this RPC is
   easily overwhelmed"`. `window.ethereum.request(...)` (utilisé par
   `rpcCall`) passe par le pont RPC unique exposé par le wallet — il n'y
   a pas de canal séparé "premier plan" / "arrière-plan". Lancer 6
   scans (au lieu de 2) en même temps, dont 4 "à froid", au moment
   précis où `runChecks()` tourne (au montage de la page ET toutes les
   120s), sature ce canal unique — exactement au moment où l'utilisateur
   clique sur Shield et où l'app a besoin de ce même canal pour son
   `eth_call` de pré-vérification, sa lecture des frais, puis
   `eth_sendTransaction`.

Ce n'est donc pas la connexion internet de l'utilisateur : c'est le
fix précédent qui a multiplié par 3 la charge RPC d'arrière-plan
concurrente, sur un canal déjà documenté comme fragile.

## Correctif

### 1. `reconcileAndVerifyNotes()` — scans séquentiels, plus en parallèle
Les 6 `fetchLogsPaginated(...)` sont maintenant exécutés un par un
(`await` séquentiels) au lieu de `Promise.all([...])`. Le passage complet
prend plus de temps (acceptable — il tourne en arrière-plan, l'utilisateur
n'attend pas dessus), mais la pression de pointe sur le canal RPC partagé
revient à son niveau d'avant le fix cross-device, quel que soit le nombre
de types d'events désormais surveillés. Une fois les 4 nouveaux
checkpoints rattrapés (une seule fois, définitivement, par compte), les
passages suivants redeviennent aussi légers qu'avant.

### 2. Garde-fou premier plan / arrière-plan
Nouveau compteur global `__privarForegroundOpsInFlight`, incrémenté à
l'entrée de `sendRealTx()` (partagé par Shield/Swap/Send/Withdraw/Bridge,
couvre `buildTx → eth_sendTransaction → waitForReceipt`) et décrémenté
dans un `finally`. `runChecks()` (déclenché au montage, toutes les 120s,
et au retour de focus de l'onglet) ignore purement et simplement son
passage si ce compteur est non nul — reporté, pas perdu : le prochain
déclenchement (120s ou retour de focus) reprendra normalement. Ne couvre
pas encore la toute première invocation de `runChecks()` au montage (qui
précède toute action utilisateur), mais élimine la compétition pour les
opérations suivantes et les rechargements ultérieurs de la page.

## Fichiers modifiés
- `src/DApp.jsx` uniquement.
