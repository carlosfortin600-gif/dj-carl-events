# DJ Carl — Gestion des événements

Application Node.js + Express + SQLite pour gérer vos événements, questionnaires clients et plan de soirée.

## Démarrage local

```bash
cd events
npm install
npm start
```

→ **http://localhost:3000**

## Mise en ligne

Voir **[DEPLOIEMENT.md](./DEPLOIEMENT.md)** pour héberger le site (ZIP, Docker, Render).

Créer une archive prête à uploader :

```bash
npm run package
```

→ `dist/dj-carl-events-deploy.zip`

## Fonctionnalités

- [x] Tableau de bord
- [x] Création d'événements + dossier client
- [x] Questionnaire mariage / party
- [x] Portail client (lien privé)
- [x] Plan de soirée (timeline)
- [x] Musique
- [x] Notes DJ (privées)
- [x] Calendrier mensuel

## Portail client

Dossier événement → Résumé → **Lien client — portail privé**

En production, définissez `PUBLIC_URL` pour que les liens pointent vers votre domaine.

## Calendrier

`/calendar` — navigation mensuelle, codes couleur par statut.
