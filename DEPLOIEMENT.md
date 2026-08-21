# Mise en ligne — DJ Carl Events

Cette application est un **site Node.js** (pas des fichiers HTML statiques).  
Elle ne peut pas être uploadée sur un hébergement web classique « FTP seulement ».  
Il faut un hébergeur qui exécute **Node.js**, ou un petit serveur / VPS.

## Option 1 — Archive ZIP (la plus simple pour démarrer)

Sur votre Mac, dans le dossier `events` :

```bash
npm run package
```

Cela crée `dist/dj-carl-events-deploy.zip` (~500 Ko, sans `node_modules`).

Sur le serveur :

```bash
unzip dj-carl-events-deploy.zip -d dj-carl-events
cd dj-carl-events
npm install
cp .env.example .env
# Éditez .env : PUBLIC_URL=https://votre-domaine.ca
npm start
```

Le site écoute sur le port **3000**. Configurez un reverse proxy (Nginx, Caddy) ou ouvrez ce port.

## Option 2 — Docker

```bash
docker build -t dj-carl-events .
docker run -d \
  -p 3000:3000 \
  -v dj-carl-data:/app/data \
  -e PUBLIC_URL=https://events.djcarl.ca \
  -e GOOGLE_MAPS_API_KEY=votre_cle \
  --name dj-carl-events \
  dj-carl-events
```

## Option 3 — Render.com (gratuit / payant)

1. Créez un compte sur [render.com](https://render.com)
2. **New → Blueprint** et connectez ce dépôt (fichier `render.yaml` inclus)
3. Définissez `PUBLIC_URL` = l’URL Render (ex. `https://dj-carl-events.onrender.com`)
4. Le disque persistant garde la base SQLite dans `/var/data`

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `PUBLIC_URL` | URL publique du site (liens portail client) |
| `PORT` | Port d'écoute (défaut 3000) |
| `DATA_DIR` | Dossier de la base SQLite |
| `GOOGLE_MAPS_API_KEY` | Clé Google Maps (temps de route, optionnel) |
| `NODE_ENV` | `production` en ligne |
| `TRUST_PROXY` | `1` derrière Nginx / Render / Cloudflare |

Copiez `.env.example` vers `.env` en local.

## Sauvegarde des données

Toutes les données sont dans **un fichier SQLite** :

```
data/djcarl.db
```

Copiez ce fichier régulièrement. En Docker / Render, il est dans le volume monté.

## Sécurité

- L’**administration** (tableau de bord, notes DJ) n’a **pas de mot de passe** pour l’instant.
- En ligne, limitez l’accès (VPN, mot de passe Nginx, IP autorisées) ou déployez sur une URL non publique.
- Le **portail client** reste privé via son lien unique (`/portal/…`).

## Hébergement classique (OVH, Hostinger, etc.)

Fonctionne **seulement** si votre offre inclut **Node.js** (VPS ou hébergement applicatif).  
Sinon, utilisez Render, Railway, Fly.io ou un VPS (~5 $/mois).

## Domaine personnalisé

1. Pointez `events.votredomaine.ca` vers votre serveur (DNS A ou CNAME)
2. Configurez HTTPS (Let’s Encrypt / Caddy / Cloudflare)
3. Mettez `PUBLIC_URL=https://events.votredomaine.ca` dans `.env`

## Test local avant mise en ligne

```bash
npm install
cp .env.example .env
npm start
```

→ http://localhost:3000

## Importer vos données locales sur Render

**Important :** sans disque persistant, chaque déploiement (Push GitHub) **efface** vos événements en ligne.
Configurez d'abord le disque ci-dessous, puis importez une fois.

### Disque persistant Render (obligatoire en production)

1. Render → **dj-carl-events** → **Disks** → **Add Disk**
   - **Name** : `data`
   - **Mount Path** : `/var/data`
   - **Size** : 1 GB
2. **Environment** → ajoutez `DATA_DIR` = `/var/data` (optionnel — détecté auto si le disque existe)
3. **Save** → attendez le redéploiement
4. Importez vos données **une dernière fois** (section suivante)

Vérification : `https://votre-site.onrender.com/api/health` doit afficher  
`"persistent": true` et `"database": "/var/data/djcarl.db"`.

Après ça, vos Push GitHub **ne effaceront plus** les événements.

### Importer depuis votre Mac

Dans le Terminal :

```bash
cd /Users/djcarl/Documents/DJ/Concepts/DJ-Carl-Quiz/events
npm run export-db
```

→ Crée `dist/djcarl-upload.db` (copie propre avec vos événements).

### 2. Vérifier le disque sur Render

Render → **dj-carl-events** → **Disks** : un disque monté sur `/var/data`  
Environment → `DATA_DIR` = `/var/data`

(Sans disque, les données en ligne ne persistent pas correctement.)

### 3. Envoyer le fichier via SSH (plan Starter)

1. Render → **dj-carl-events** → **Connect** → **SSH**
2. Copiez la commande SSH affichée (ex. `ssh srv-xxxxx@ssh.oregon.render.com`)
3. Sur votre Mac, dans un **nouveau** Terminal :

```bash
cd /Users/djcarl/Documents/DJ/Concepts/DJ-Carl-Quiz/events
scp dist/djcarl-upload.db VOTRE_COMMANDE_SSH:/var/data/djcarl.db
```

Remplacez `VOTRE_COMMANDE_SSH` par la partie après `scp`, par exemple :
`srv-da3prh0n74is73fef5u0@ssh.oregon.render.com`

4. Render → **Manual Deploy** → **Deploy latest commit** (ou attendez le redémarrage)

### 4. Vérifier

Ouvrez **https://dj-carl-events.onrender.com** — votre mariage du 22 août devrait apparaître.

**Note :** cela **remplace** la base en ligne par votre copie locale. Si vous aviez créé des événements directement sur Render, ils seront écrasés.
