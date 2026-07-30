/* eslint-disable max-len */
import * as admin from "firebase-admin";

type PublicMarketingArticle = {
  title?: string;
  slug?: string;
  status?: string;
  author?: string;
  locale?: string;
  category?: string;
  excerpt?: string;
  bodyMarkdown?: string;
  tags?: string[];
  heroImageUrl?: string;
  heroImageAlt?: string;
  videoUrl?: string;
  seoTitle?: string;
  metaDescription?: string;
  canonicalPath?: string;
  ogTitle?: string;
  ogDescription?: string;
  readingMinutes?: number;
  publishedAt?: FirebaseFirestore.Timestamp;
};

type PublicBlogDeps = {
  db: FirebaseFirestore.Firestore;
  publicAppUrl: string;
  escapeHtml: (value: unknown) => string;
  nowTs: () => FirebaseFirestore.FieldValue;
};

type PublicBlogRequest = {
  originalUrl?: string;
  url?: string;
};

type PublicBlogResponse = {
  redirect: (status: number, url: string) => void;
  status: (code: number) => {send: (body: string) => void};
  set: (field: string, value: string) => void;
};

const safeUrl = (value: unknown) => {
  const url = String(value || "").trim();
  if (!/^https:\/\/[^\s<>"']+$/i.test(url)) return "";
  return url;
};

const publicBlogSlugFromRequest = (url: string) => {
  const path = url.split("?")[0].replace(/^\/+/, "");
  const parts = path.split("/").filter(Boolean);
  const slug = parts[0] === "blog" ? parts[1] : parts[0];
  return decodeURIComponent(String(slug || "")).replace(/[^a-z0-9-]/gi, "").toLowerCase();
};

const markdownToPublicHtml = (markdown: unknown, escapeHtml: (value: unknown) => string) => {
  const lines = String(markdown || "").split(/\r?\n/);
  const chunks: string[] = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      chunks.push("</ul>");
      listOpen = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (line.startsWith("## ")) {
      closeList();
      chunks.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("### ")) {
      closeList();
      chunks.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("- ")) {
      if (!listOpen) {
        chunks.push("<ul>");
        listOpen = true;
      }
      chunks.push(`<li>${escapeHtml(line.slice(2))}</li>`);
      continue;
    }
    closeList();
    chunks.push(`<p>${escapeHtml(line)}</p>`);
  }

  closeList();
  return chunks.join("\n");
};

const renderPublicBlogHtml = (
  article: PublicMarketingArticle,
  slug: string,
  deps: Pick<PublicBlogDeps, "publicAppUrl" | "escapeHtml">,
) => {
  const {publicAppUrl, escapeHtml} = deps;
  const title = article.seoTitle || article.title || "Innovacare Training article";
  const displayTitle = article.title || title;
  const description = article.metaDescription || article.excerpt || "Practical training, compliance and team readiness guidance from Innovacare Training.";
  const ogTitle = article.ogTitle || displayTitle;
  const ogDescription = article.ogDescription || description;
  const canonical = `${publicAppUrl}${article.canonicalPath || `/blog/${slug}`}`;
  const imageUrl = safeUrl(article.heroImageUrl);
  const videoUrl = safeUrl(article.videoUrl);
  const imageMeta = imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}">` : "";
  const tags = Array.isArray(article.tags) ? article.tags.slice(0, 8) : [];
  const published = article.publishedAt?.toDate?.().toISOString?.() || new Date().toISOString();

  return `<!doctype html>
<html lang="${escapeHtml(article.locale || "en")}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Innovacare Training">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:title" content="${escapeHtml(ogTitle)}">
  <meta property="og:description" content="${escapeHtml(ogDescription)}">
  ${imageMeta}
  <meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}">
  <meta name="theme-color" content="#0d2240">
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": displayTitle,
    "description": description,
    "image": imageUrl || undefined,
    "author": {"@type": "Organization", "name": article.author || "Innovacare Training"},
    "publisher": {"@type": "Organization", "name": "Innovacare Training"},
    "datePublished": published,
    "mainEntityOfPage": canonical,
  })}</script>
  <style>
    body{margin:0;background:#f7f9fc;color:#10213f;font-family:Inter,Arial,sans-serif;line-height:1.65}
    .nav{border-bottom:1px solid #dbe3ef;background:#fff}.nav-inner{max-width:980px;margin:0 auto;padding:18px 20px;display:flex;justify-content:space-between;gap:16px;align-items:center}.brand{font-weight:900;color:#0d2240;text-decoration:none}.nav a{color:#075fc7;font-weight:800;text-decoration:none}
    main{max-width:980px;margin:0 auto;padding:42px 20px 72px}.eyebrow{color:#0f766e;text-transform:uppercase;letter-spacing:.12em;font-size:.78rem;font-weight:900}h1{font-size:clamp(2.2rem,6vw,4.4rem);line-height:1;margin:.2rem 0 1rem;letter-spacing:0}h2{margin-top:2rem;color:#0d2240}.lede{font-size:1.15rem;color:#52637a;max-width:820px}.meta{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}.meta span,.tag{border-radius:999px;background:#edf7f6;color:#0f766e;padding:7px 10px;font-weight:800;font-size:.78rem}.hero{overflow:hidden;margin:28px 0;border-radius:8px;background:linear-gradient(135deg,#0d2240,#0f766e);color:#fff}.hero img{display:block;width:100%;max-height:520px;object-fit:cover}.hero-fallback{min-height:260px;display:grid;place-items:center;font-weight:900;font-size:1.5rem}.video{display:inline-flex;margin:0 0 22px;padding:11px 14px;border-radius:8px;background:#075fc7;color:#fff;font-weight:900;text-decoration:none}.article{background:#fff;border:1px solid #dbe3ef;border-radius:8px;padding:clamp(20px,4vw,42px);box-shadow:0 12px 34px rgba(15,23,42,.07)}.article p{margin:1rem 0}.article ul{padding-left:1.25rem}.tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:30px}.cta{margin-top:34px;padding:24px;border-radius:8px;background:#0d2240;color:#fff}.cta a{display:inline-flex;margin-top:10px;padding:11px 14px;border-radius:8px;background:#fff;color:#0d2240;font-weight:900;text-decoration:none}@media(max-width:640px){main{padding-top:28px}.nav-inner{align-items:flex-start;flex-direction:column}.article{padding:18px}}
  </style>
</head>
<body>
  <header class="nav"><div class="nav-inner"><a class="brand" href="${publicAppUrl}/home">Innovacare Training</a><a href="${publicAppUrl}/blog">All articles</a></div></header>
  <main>
    <p class="eyebrow">${escapeHtml(article.category || "Training insights")}</p>
    <h1>${escapeHtml(displayTitle)}</h1>
    <p class="lede">${escapeHtml(article.excerpt || description)}</p>
    <div class="meta"><span>${escapeHtml(article.author || "Innovacare Training")}</span><span>${escapeHtml(String(article.readingMinutes || 1))} min read</span></div>
    <div class="hero">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(article.heroImageAlt || displayTitle)}">` : `<div class="hero-fallback">${escapeHtml(article.category || "Innovacare Training")}</div>`}</div>
    ${videoUrl ? `<a class="video" href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener">Watch the related video</a>` : ""}
    <article class="article">${markdownToPublicHtml(article.bodyMarkdown, escapeHtml)}</article>
    <div class="tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
    <section class="cta"><strong>Build a stronger training system.</strong><br>Use Innovacare Training to manage learning, practice sheets, reminders, compliance evidence and certifications.<br><a href="${publicAppUrl}/pricing">Explore plans</a></section>
  </main>
</body>
</html>`;
};

export const createPublicBlogArticleHandler = (deps: PublicBlogDeps) => async (
  request: PublicBlogRequest,
  response: PublicBlogResponse,
) => {
  const slug = publicBlogSlugFromRequest(request.originalUrl || request.url || "");
  if (!slug) {
    response.redirect(302, `${deps.publicAppUrl}/blog`);
    return;
  }

  const snap = await deps.db.collection("marketingArticles").doc(slug).get();
  if (!snap.exists || snap.get("status") !== "published") {
    response.status(404).send("Article not found");
    return;
  }

  await snap.ref.set({
    views: admin.firestore.FieldValue.increment(1),
    lastViewedAt: deps.nowTs(),
  }, {merge: true}).catch((error) => console.warn("Unable to increment marketing article views", error));

  response.set("Cache-Control", "public, max-age=300, s-maxage=600");
  response.set("Content-Type", "text/html; charset=utf-8");
  response.status(200).send(renderPublicBlogHtml(snap.data() as PublicMarketingArticle, slug, deps));
};
