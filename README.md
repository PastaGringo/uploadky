[![Pubky](https://img.shields.io/badge/Pubky-0.11.0-blue)](https://www.npmjs.com/package/@synonymdev/pubky/v/0.11.0)

# uploadky

Partager un fichier comme avec Gofile, mais **le fichier reste chez vous**.

On se connecte avec Pubky Ring, on dépose un fichier, on obtient un lien public
que n'importe qui peut ouvrir. Le fichier est écrit sur **votre propre
homeserver** — uploadky ne stocke rien et ne transporte aucun octet.

Dérivé de [`pubky-app-templates/basic-pubky-app`](https://github.com/pubky/pubky-app-templates).

## Le principe

| | |
|---|---|
| **Dépôt** | Session Pubky, capacité limitée à `/pub/uploadky.app/:rw` |
| **Stockage** | Le homeserver de l'utilisateur, jamais le nôtre |
| **Partage** | `/pub/` est en **lecture publique sans authentification** |
| **Sortie** | Les fichiers suivent la clé : on change de homeserver sans rien perdre |

L'application ne demande qu'**une seule capacité**. L'utilisateur accorde
l'accès à un dossier et rien d'autre, et peut la révoquer depuis Pubky Ring.
Vérifié à l'usage : une session portant `/pub/locks.app/:rw` s'est vu refuser
toute écriture hors de ce préfixe.

## Disposition sur le homeserver

```
/pub/uploadky.app/files/<id>        les octets bruts
/pub/uploadky.app/meta/<id>.json    nom d'origine, type MIME, taille, date
```

Le descripteur est nécessaire parce que `putBytes` ne transporte ni nom de
fichier ni type MIME. Il est public lui aussi — c'est voulu, la page de
téléchargement en a besoin.

## Le lien de partage

```
https://homeserver.pubky.app/pub/uploadky.app/files/<id>?pubky-host=<clé>
```

Le SDK n'offre **aucun assistant** pour cela : `PubkyResource.toPubkyUrl()` ne
rend qu'un `pubky://`, qu'aucun navigateur ne sait ouvrir. L'URL est donc
construite à la main dans `src/storage.ts`.

> ⚠️ **Pourquoi le paramètre d'URL et non `/storage/<clé>/…`**
>
> Le homeserver officiel n'a pas encore migré vers l'adressage par chemin :
> `/storage/<clé>/pub/…` y répond **HTTP 500** (`Can't extract PubkyHost`).
> Seule la forme `?pubky-host=` fonctionne, et c'est la seule qu'un navigateur
> peut ouvrir sans en-tête personnalisé.
>
> Mesuré le 2026-09-05 contre `homeserver.pubky.app` :
> utilisateur réel → `200` · clé inexistante → `404` · fichier absent → `404`.
>
> La migration amont impose **un an de préavis minimum** à partir de la
> publication du premier SDK stable en adressage par chemin — non publié à ce
> jour. Le risque est donc lointain, mais la construction de l'URL est isolée
> dans une seule fonction pour que la bascule tienne en une ligne.

## Authentification : deux formats, et le récent ne passe pas

Le SDK 0.11 sait produire deux URL d'autorisation :

| Format | URL | État sur le terrain |
|---|---|---|
| grant | `pubkyauth://signin_grant?…&cid=…&cpk=…` | **Rejeté** par le Pubky Ring publié |
| cookie | `pubkyauth://signin?relay=…&caps=…&secret=…` | Fonctionne |

Mesuré le 2026-09-05 sur un Ring réel : le QR `signin_grant` est refusé avec
*« Unrecognized format. Expected a recovery phrase, invite code, auth URL, or
session request. »*

**Le piège est que l'échec est invisible côté application** : il se produit sur
le téléphone, aucune erreur ne remonte, et un nouvel utilisateur voit
simplement un QR qui ne fait rien. D'où le format `cookie` par défaut, et un
sélecteur sous le QR pour repasser en `grant`.

À rebasculer dès que Ring saura lire `signin_grant` — le modèle grant est
supérieur (clé déléguée non extractible, révocable, cloisonnée par application).

### Conséquence : la session ne survit pas au rechargement

`BrowserSessionStore` n'accepte **que** les sessions adossées à un grant. Une
session par cookie ne peut donc pas y être conservée.

Le contournement facile serait d'écrire `session.export()` dans le
`localStorage` — mais c'est un **secret porteur**, lisible par n'importe quelle
faille XSS, précisément ce que le modèle grant existe pour empêcher. Ce n'est
pas fait. En protocole historique, la session vit le temps de la page, et
l'application le dit à l'utilisateur.

## Limites connues

- **100 Mo par fichier.** Plafond du homeserver, mesuré dans son routeur
  (`DefaultBodyLimit::max(100 * 1024 * 1024)`). Le découpage en morceaux n'est
  pas implémenté ; un fichier plus gros est refusé avec un message clair.
- **Quota côté homeserver.** Fixé par l'opérateur. Un dépassement rend
  `507 Insufficient Storage`.
- **Domaine du homeserver figé.** `HOMESERVER_HTTP_BASE` vaut par défaut
  `https://homeserver.pubky.app`. Un utilisateur hébergé ailleurs aura un lien
  faux. Résoudre le domaine ICANN depuis l'enregistrement pkarr n'est pas
  exposé par le SDK JS.
- **Pas de dépôt anonyme.** Il faut une identité Pubky. C'est la friction
  majeure face à Gofile, et le sujet de la prochaine étape.

## Démarrer

```bash
bun install
bun run dev
```

Réseau réel par défaut. Pour viser un testnet local :

```bash
VITE_PUBKY_TESTNET=true \
VITE_PUBKY_TESTNET_HOST=127.0.0.1 \
VITE_HOMESERVER_HTTP_BASE=http://127.0.0.1:6286 \
bun run dev
```

## Vérification

`bun run build` enchaîne `tsc` puis le bundle. Le typecheck a été éprouvé par
une erreur volontaire : il rend bien deux erreurs avec la sonde et rien sans.
Un contrôle qui ne sait pas échouer ne prouve rien.
