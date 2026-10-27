# LLM Router Docs

Astro-powered documentation site for LLM Router.

## Commands

```sh
npm install
npm run dev
npm run build
npm run preview
```

The local development server runs from this `docs` directory.

## GitHub Pages

Docs are deployed from `.github/workflows/docs.yml` on pushes to `main` that change `docs/**` or the workflow itself. The default public URL is:

```text
https://jrmatherly.github.io/llm-router/
```

The Astro build reads `ASTRO_SITE` and `ASTRO_BASE`, defaulting to `https://jrmatherly.github.io` and `/llm-router/`.

## Content

Docs pages are authored in Markdown under `src/content/docs/en/`, starting at `src/content/docs/en/index.md`. The site is served under `/en/`, and `/` redirects there.

Frontmatter provides the page title, eyebrow, and lead text. Markdown headings generate the right-side table of contents, and fenced code blocks are compiled with Shiki highlighting.
