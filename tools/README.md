# Fabriquer et publier Tea Time English

## Où sont les choses

- `src/tea-time-english.html` : la **source** de l'appli. C'est le seul fichier qu'on modifie.
- `tools/build.py` : fabrique le site à la racine du dépôt (`index.html`, `sw.js`, `manifest.webmanifest`, `icons/`, `tts.json`), puis lance les tests.
- `tools/run_tests.js` et `tools/tests/bank.json` : la **banque de tests**.
- `worker/` : le petit serveur Cloudflare (statistiques, voix, ligue, rappel, code de transfert). Il se redéploie tout seul à chaque push.

## La règle

On ne publie **que si tous les tests passent**.

```
cd tools && npm install        # la première fois seulement
cd .. && python3 tools/build.py
```

La dernière ligne doit dire « Tous les tests passent : prêt à publier ». Sinon, on corrige d'abord.

## Ce que vérifient les tests

1. Sur **toutes** les questions :
   - chaque réponse officielle est acceptée, même avec une majuscule et un point ;
   - une réponse absurde est refusée ;
   - aucun QCM n'a deux choix identiques ;
   - aucun texte cassé : « 1 years », double point, « a seven o'clock », « ton tante »…
2. La **banque de réponses réalistes** (`bank.json`) : des réponses justes et fausses, comme celles de vrais élèves. L'appli doit les trancher correctement, avec la bonne explication.
3. **Les voix** : chaque phrase des leçons doit être dans la liste du serveur de voix.

## Quand une fausse correction est signalée

1. Ajouter une ligne dans `tools/tests/bank.json` avec la réponse et la décision attendue.
2. Lancer les tests : la nouvelle ligne doit échouer.
3. Corriger la source jusqu'à ce que tous les tests passent.

Comme ça, la même erreur ne peut plus jamais revenir.
