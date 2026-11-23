# Gérer le site Façon Degremont — mode d'emploi

## Se connecter
1. Ouvrir **https://www.VOTRE-DOMAINE.fr/admin** (téléphone ou ordinateur).
2. Taper votre **identifiant** et votre **mot de passe** → **Me connecter**.
3. Sur votre téléphone ou votre ordinateur personnel, cochez **Rester connecté sur cet appareil** pour ne plus avoir à le retaper.

## Comment ça marche
- L'accueil propose 5 grandes cases : **Mes chantiers**, **Mes métiers**, **Nos conseils**, **Avis clients**, **Coordonnées et textes**, plus trois raccourcis (ajouter un chantier, écrire un conseil, ajouter un avis).
- À droite (ou avec le bouton **Voir l'aperçu** sur téléphone), l'**aperçu** montre la vraie page du site avec vos changements, **avant même de publier**. Les boutons **Ordinateur / Téléphone** changent la taille d'écran.
- Quand vous modifiez quelque chose, une barre apparaît en bas : **Publier sur le site** envoie tout d'un coup. **Le site se met à jour en 1 à 2 minutes.** **Annuler** efface ce qui n'est pas encore publié.
- Les photos sont réduites automatiquement : prenez-les directement avec le téléphone, sans retouche.

## Ajouter un chantier
**Ajouter un chantier** → photo **AVANT**, photo **APRÈS** → titre, type de travaux, ville → **Publier sur le site**.
- Prendre la photo avant et la photo après **du même endroit, avec le même cadrage** : l'effet du curseur est bien plus fort. Vous pouvez tester le curseur directement dans l'espace de gestion.
- Les 3 premiers chantiers s'affichent sur l'accueil : changez l'ordre avec les flèches ↑ ↓.
- Pour cacher un chantier sans le supprimer : décocher **Afficher sur le site**.

## Ajouter une photo à un métier
**Mes métiers** → choisir le métier → **Ajouter des photos** (plusieurs d'un coup) → écrire une **légende courte** sous chaque photo (« Douche à l'italienne en mosaïque ») → **Publier**. Les flèches ← → changent l'ordre, ✕ retire une photo.

## Écrire un conseil (article)
**Écrire un conseil** → titre, résumé, photo de couverture, texte → **Publier**. L'article apparaît dans « Nos conseils » et sur l'accueil.
- Un bon titre est une **question que se pose un client** : « Combien de temps dure une rénovation de salle de bain ? ».
- Le résumé (1 ou 2 phrases) est ce que Google affiche sous le titre.
- **Photo de couverture** : pour un conseil général, prendre une image **libre de droits** (par exemple sur **pixabay.com**, usage commercial autorisé). Gardez vos photos de chantier pour « Mes chantiers ».
- Les boutons au-dessus du texte ajoutent un **intertitre**, du **gras**, une **liste**, un **lien** ou une **photo**. Le bouton « Demander mon devis » s'ajoute tout seul à la fin de l'article.
- Pour garder un brouillon : décocher **Visible sur le site**.
- Trois articles d'exemple sont en place : relisez-les, adaptez-les ou supprimez-les.

## Ajouter un avis
**Ajouter un avis** → prénom, ville (facultatif), texte de l'avis tel que la personne l'a dit → **Publier**.
Uniquement des avis réels, avec l'accord de la personne. Les guillemets s'ajoutent tout seuls. La section « avis » apparaît sur le site dès qu'un avis est affiché.

## Faire arriver les demandes de devis par e-mail (Gmail)
Le formulaire envoie un e-mail bien présenté (nom, téléphone, travaux, message, bouton « Appeler ») dans votre boîte Gmail. Aucun service tiers : un petit script Google, rattaché à votre compte. À faire une seule fois :
1. Avec le compte Gmail qui doit recevoir les demandes, ouvrir **script.google.com** → **Nouveau projet**.
2. Effacer le code d'exemple, coller tout le contenu du fichier `tools/formulaire-devis.gs`, puis **Enregistrer**.
3. **Déployer** → **Nouveau déploiement** → roue dentée → **Application Web**. Régler **Exécuter en tant que : Moi** et **Qui a accès : Tout le monde**, puis **Déployer**.
4. Google demande d'autoriser l'accès : **Autoriser** → choisir le compte → si « Google n'a pas validé cette application » apparaît, cliquer **Paramètres avancés** puis **Accéder à … (non sécurisé)** : c'est normal, c'est votre propre script.
5. Copier l'**URL de l'application Web** (elle finit par `/exec`), puis dans l'espace de gestion : **Coordonnées et textes** → **Réglages techniques** → **Adresse du script d'envoi des devis** → **Publier**.
6. Tester : envoyer une demande depuis le site. Le message arrive dans Gmail (vérifier aussi les courriers indésirables la première fois). Répondre au message répond directement au client.
Tant que l'adresse n'est pas renseignée, le formulaire ouvre simplement la messagerie du visiteur : à faire avant la mise en ligne.

## Changer de mot de passe
En haut : **Mon accès** → identifiant, nouveau mot de passe deux fois → **Enregistrer**. Il marche partout 1 à 2 minutes plus tard.

## En cas de souci
- Le changement n'apparaît pas : attendre 2 minutes puis recharger la page (tirer vers le bas sur téléphone).
- « La clé GitHub a expiré » : la clé qui permet d'enregistrer a une date limite. La personne qui a installé le site la renouvelle (voir partie technique).
- Rien ne se perd : chaque publication est gardée dans l'historique GitHub et peut être annulée.

---

## Le site appartient à l'entreprise : changer de propriétaire
Le site peut être installé aujourd'hui sur le compte GitHub de la personne qui l'a créé, puis **donné entièrement** à l'entreprise plus tard. Rien n'est perdu : textes, photos, articles et historique suivent.

**Le plus simple, dès le départ** : créer un compte GitHub au nom de l'entreprise (avec l'adresse e-mail de l'entreprise ou du gérant), y mettre le site, et ajouter le créateur comme simple collaborateur. Le jour où il part, on le retire : rien d'autre à faire.

**Si le site est déjà sur le compte du créateur**, le transfert prend 10 minutes :
1. Le gérant crée son compte GitHub gratuit (github.com → Sign up) avec son adresse e-mail.
2. Le créateur : dépôt du site → **Settings** → tout en bas **Transfer ownership** → nom du compte du gérant. Le gérant accepte le transfert (e-mail de GitHub). GitHub redirige automatiquement les anciennes adresses du dépôt.
3. Le gérant (ou le créateur, invité comme collaborateur le temps de finir) refait ces réglages, qui sont liés au compte :
   - **Settings → Pages** : *Source* = **GitHub Actions**, *Custom domain* = le domaine OVH, *Enforce HTTPS*. Le domaine OVH ne change pas : les réglages DNS restent les mêmes.
   - **Nouvelle clé GitHub** créée depuis le compte du gérant, puis `/admin/#installer` pour réinstaller l'accès (même identifiant, nouveau mot de passe si on veut). L'ancienne clé du créateur cesse de fonctionner : la supprimer de son compte.
4. Le formulaire de devis et Instagram dépendent du **Gmail** et du **compte Instagram de l'entreprise** : ils ne bougent pas si ce sont déjà ceux de l'entreprise. Sinon, refaire l'étape Gmail ci-dessus avec le Gmail du gérant.
5. Le créateur se retire : dépôt → **Settings → Collaborators** → le retirer.

---

## Partie technique (pour la personne qui gère l'hébergement)
- Site statique sur **GitHub Pages**, branche `main`. Aucune base de données : textes dans `content/*.json`, articles dans `content/blog/*.md`, photos dans `assets/` (envois du back-office : `assets/uploads/`).
- **Réglage obligatoire une fois** : GitHub → Settings → Pages → *Source* = **GitHub Actions**. Le workflow `.github/workflows/pages.yml` génère le blog (`tools/build_blog.py` : pages HTML, liste, `sitemap.xml`, `robots.txt`) puis publie à chaque modification.
- **Espace de gestion** (`admin/index.html`, `admin/admin.js`, `admin/admin.css`) : écrit sur mesure, sans service externe. Chaque « Publier » crée un seul commit via l'API GitHub.
- **Installer l'accès** (une fois, puis à chaque renouvellement de clé) :
  1. GitHub → Settings → Developer settings → **Fine-grained tokens** → *Generate new token* : *Repository access* = **uniquement le dépôt du site** ; *Permissions* → *Contents* = **Read and write** ; durée la plus longue proposée (noter la date d'expiration dans un agenda).
  2. Ouvrir `https://www.VOTRE-DOMAINE.fr/admin/#installer` : compte GitHub, nom du dépôt, clé, identifiant et mot de passe du gérant (12 caractères minimum) → **Vérifier et enregistrer**.
  3. La clé est enregistrée **chiffrée** par le mot de passe dans `admin/acces.json` (PBKDF2 600 000 tours + AES-GCM) : elle ne circule jamais en clair. Le fichier étant public, la sécurité repose sur un **mot de passe long** ; la clé ne donne de toute façon accès qu'à ce dépôt.
- **Mode test sur l'ordinateur** : lancer `python -m http.server 8770` dans le dossier du site, ouvrir `http://localhost:8770/admin/` dans **Chrome ou Edge** → **Mode test : travailler sur les fichiers de cet ordinateur** → choisir le dossier du site. Les publications modifient directement les fichiers. Le blog se régénère avec `python tools/build_blog.py` (en ligne, c'est automatique).
- Renseigner **Adresse du site** (Coordonnées → Réglages techniques) dès que le domaine est actif, puis déclarer `sitemap.xml` dans la Search Console.
- Formulaire : script Google `tools/formulaire-devis.gs`, quota gratuit d'un compte Gmail : environ 100 e-mails par jour.
- Instagram : compte Instagram **professionnel** relié à **behold.so** (gratuit), identifiant du flux dans « Coordonnées et textes ».
- Domaine OVH : enregistrements DNS vers GitHub Pages (A ×4 + CNAME `www`), puis *Custom domain* + *Enforce HTTPS* dans les réglages Pages.
