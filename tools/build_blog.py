#!/usr/bin/env python3
"""Génère le blog en pages HTML statiques (bon pour le référencement) à partir de content/blog/*.md.

Lancé automatiquement à chaque mise en ligne (voir .github/workflows/pages.yml).
Pour tester chez soi :  pip install -r tools/requirements.txt  puis  python tools/build_blog.py
Produit : blog/index.html, blog/<article>/index.html, blog/articles.json, sitemap.xml, robots.txt.
"""
import datetime
import html
import json
import pathlib
import re
import shutil

import markdown
import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "blog"
OUT = ROOT / "blog"
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
e = html.escape


def typo(s):
    """Typographie française : espace insécable avant : ; ! ? » et après « (le « : » ne passe jamais seul à la ligne)."""
    s = re.sub(r"[ \u00a0]+([:;!?»])", lambda m: "\u00a0" + m.group(1), s)
    return re.sub(r"(«)[ \u00a0]+", lambda m: m.group(1) + "\u00a0", s)


def typo_html(h):
    return re.sub(r"(<[^>]+>)|([^<]+)", lambda m: m.group(1) or typo(m.group(2)), h)


def date_fr(d):
    return f"{d.day}{'er' if d.day == 1 else ''} {MOIS[d.month - 1]} {d.year}"


def lire(path):
    texte = path.read_text(encoding="utf-8")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", texte, re.S)
    if not m:
        print(f"  ! {path.name} ignoré (en-tête manquant)")
        return None
    meta = yaml.safe_load(m.group(1)) or {}
    titre = str(meta.get("titre") or "").strip()
    if not titre:
        print(f"  ! {path.name} ignoré (pas de titre)")
        return None
    if meta.get("publie") is False:
        print(f"  - {path.name} : brouillon, non publié")
        return None
    d = meta.get("date")
    if isinstance(d, datetime.datetime):
        d = d.date()
    elif isinstance(d, str):
        try:
            d = datetime.date.fromisoformat(d[:10])
        except ValueError:
            d = None
    if not isinstance(d, datetime.date):
        d = datetime.date.today()
    corps = m.group(2).strip()
    brut = typo_html(markdown.markdown(corps, extensions=["extra", "sane_lists"]))
    titre = typo(titre)
    texte_seul = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", brut)).strip()
    desc = str(meta.get("description") or "").strip() or (texte_seul[:157] + "…" if len(texte_seul) > 160 else texte_seul)
    desc = typo(desc)
    return {
        "slug": path.stem,
        "titre": titre,
        "date": d,
        "description": desc,
        "image": str(meta.get("image") or "").strip(),
        "html": brut,
    }


def chemin(base, p):
    """Rend un chemin du back-office (/assets/...) relatif à la page (marche aussi hors domaine racine)."""
    if not p or p.startswith(("http://", "https://")):
        return p
    return base + p.lstrip("/")


def absolu(site, p):
    if not p or p.startswith(("http://", "https://")) or not site:
        return p
    return f"{site}/{p.lstrip('/')}"


def entete(base, tel):
    return f"""<a class="skip" href="#contenu">Aller au contenu</a>
<header class="top" id="top">
  <a class="brand" href="{base}" aria-label="Façon Degremont, retour à l'accueil">
    <img src="{base}assets/logo/logo-mark.png" alt="" width="40" height="40">
    <span class="brand-name">Façon Degremont</span>
  </a>
  <nav class="nav" id="nav" aria-label="Menu principal">
    <a href="{base}#metiers">Nos métiers</a>
    <a href="{base}#etapes">Comment ça se passe&nbsp;?</a>
    <a href="{base}#realisations">Réalisations</a>
    <a href="{base}blog/" aria-current="page">Nos conseils</a>
    <a href="{base}#contact" class="btn btn-small">Demander un devis</a>
  </nav>
  <a class="call" href="tel:{e(tel)}" aria-label="Appeler"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg></a>
  <button class="burger" id="burger" aria-expanded="false" aria-controls="nav" aria-label="Ouvrir le menu"><span></span><span></span></button>
</header>"""


def pied(base, zone):
    return f"""<footer class="foot">
  <a class="foot-logo" href="{base}" aria-label="Façon Degremont, retour à l'accueil"><img src="{base}assets/logo/facon_degremont_logo.png" alt="Façon Degremont — Réalisons votre intérieur" width="260" height="260" loading="lazy"></a>
  <p>{e(zone)}</p>
  <p><a href="{base}mentions-legales.html">Mentions légales</a></p>
</footer>
<script src="{base}js/blog.js" defer></script>"""


def page(base, site, titre, desc, corps, canonical="", image="", type_og="website", jsonld=""):
    canon = f'<link rel="canonical" href="{e(canonical)}">' if canonical else ""
    og_img = f'<meta property="og:image" content="{e(image)}">' if image else ""
    return f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(titre)}</title>
<meta name="description" content="{e(desc)}">
{canon}
<meta property="og:title" content="{e(titre)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:type" content="{type_og}">
{og_img}
<meta name="theme-color" content="#efefef">
<link rel="icon" href="{base}assets/logo/logo-mark.png">
<link rel="stylesheet" href="{base}css/style.css">
{jsonld}
</head>
<body class="page-blog">
{entete(base, site['tel'])}
<main id="contenu">
{corps}
</main>
{pied(base, site['zone'])}
</body>
</html>
"""


def main():
    cfg = {}
    try:
        cfg = json.loads((ROOT / "content" / "site.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        print("  ! content/site.json illisible")
    url = (cfg.get("site_url") or "").strip().rstrip("/")
    site = {
        "tel": re.sub(r"[^\d+]", "", cfg.get("telephone", "")),
        "zone": cfg.get("zone", "Toulouse et ses alentours"),
    }

    articles = []
    seen = set()
    for f in sorted(SRC.glob("*.md")) if SRC.exists() else []:
        a = lire(f)
        if a and a["slug"] not in seen:
            seen.add(a["slug"])
            articles.append(a)
    articles.sort(key=lambda a: a["date"], reverse=True)

    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir()

    # Liste du blog
    if articles:
        cartes = "\n".join(
            f"""<a class="post-card" href="{e(a['slug'])}/">
  {f'<img src="{e(chemin("../", a["image"]))}" alt="" loading="lazy" width="640" height="400">' if a['image'] else ''}
  <span class="pc-body"><span class="post-date">{date_fr(a['date'])}</span><strong>{e(a['titre'])}</strong><span>{e(a['description'])}</span></span>
</a>"""
            for a in articles
        )
    else:
        cartes = '<p style="grid-column:1/-1">Les premiers articles arrivent bientôt.</p>'
    corps = f"""<section class="blog-head">
  <h1 class="title">Nos conseils</h1>
  <p>Rénovation, travaux, bonnes questions à se poser avant de se lancer : on vous explique simplement.</p>
</section>
<div class="blog-grid">
{cartes}
</div>"""
    (OUT / "index.html").write_text(
        page("../", site, "Blog rénovation intérieure autour de Toulouse — Façon Degremont",
             "Conseils de rénovation intérieure (salle de bain, placo, carrelage, électricité, plomberie, climatisation) par Façon Degremont, autour de Toulouse.",
             corps, canonical=f"{url}/blog/" if url else ""),
        encoding="utf-8",
    )

    # Articles
    for a in articles:
        base = "../../"
        img = ""
        if a["image"]:
            img = f'<img class="post-img" src="{e(chemin(base, a["image"]))}" alt="" width="1200" height="675">'
        corps_html = a["html"].replace('src="/', f'src="{base}').replace("<img ", '<img loading="lazy" ')
        corps = f"""<article class="post">
  <p class="post-back"><a href="{base}blog/">← Tous les articles</a></p>
  <p class="post-date">{date_fr(a['date'])}</p>
  <h1>{e(a['titre'])}</h1>
  {img}
  <div class="post-body">
{corps_html}
  </div>
  <aside class="post-cta">
    <strong>Un projet de rénovation ?</strong>
    <span>Décrivez-le en quelques mots : on vient le voir chez vous, sans engagement.</span>
    <a class="btn" href="{base}#contact">Demander mon devis gratuit</a>
  </aside>
</article>"""
        ld = {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "headline": a["titre"],
            "description": a["description"],
            "datePublished": a["date"].isoformat(),
            "author": {"@type": "Organization", "name": "Façon Degremont"},
            "publisher": {"@type": "Organization", "name": "Façon Degremont"},
        }
        if a["image"] and url:
            ld["image"] = absolu(url, a["image"])
        d = OUT / a["slug"]
        d.mkdir()
        (d / "index.html").write_text(
            page(base, site, f"{a['titre']} — Façon Degremont", a["description"], corps,
                 canonical=f"{url}/blog/{a['slug']}/" if url else "",
                 image=absolu(url, a["image"]), type_og="article",
                 jsonld=f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>'),
            encoding="utf-8",
        )

    # Liste pour l'accueil
    (OUT / "articles.json").write_text(
        json.dumps(
            [{"slug": a["slug"], "titre": a["titre"], "date": a["date"].isoformat(), "date_fr": date_fr(a["date"]),
              "description": a["description"], "image": a["image"]} for a in articles],
            ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    # Plan du site pour Google (seulement si l'adresse du site est renseignée)
    if url:
        lignes = [(f"{url}/", None), (f"{url}/blog/", None)] + [(f"{url}/blog/{a['slug']}/", a["date"]) for a in articles]
        xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
        for loc, d in lignes:
            xml.append(f"  <url><loc>{e(loc)}</loc>" + (f"<lastmod>{d.isoformat()}</lastmod>" if d else "") + "</url>")
        xml.append("</urlset>")
        (ROOT / "sitemap.xml").write_text("\n".join(xml) + "\n", encoding="utf-8")
        (ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {url}/sitemap.xml\n", encoding="utf-8")
    else:
        print("  ! « Adresse du site » vide dans le back-office : plan du site (sitemap) non généré")

    print(f"Blog : {len(articles)} article(s) publié(s).")


if __name__ == "__main__":
    main()
