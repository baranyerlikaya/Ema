# PhysRef

A free reference for university-level classical mechanics, laid out like programming-language docs. The first version follows the Mechanics (02MECH) midterm syllabus at FJFI, CTU Prague.

Static site: plain HTML, CSS and vanilla JS. No build step, no backend, no CDNs. KaTeX and the Geist font are bundled locally, so every page works offline.

## Run locally

```bash
python3 -m http.server
```

Then open <http://localhost:8000>. (Opening the files directly with `file://` also works in most browsers, but a local server matches GitHub Pages more closely.)

## Add a new topic

1. Add an entry to `nav.js` under the right section:

   ```js
   { id: 'my-topic', title: 'My Topic', file: 'topics/mechanics/my-topic.html', status: 'soon' }
   ```

2. Create the page. Either copy `topics/mechanics/_template.html` to the `file` path and replace `{{TITLE}}` and `{{ID}}` (the `id` from step 1), or run:

   ```bash
   node tools/new-pages.mjs
   ```

   which creates every page listed in `nav.js` that doesn't exist yet. It never overwrites existing pages.

3. Fill the slots, then set `status: 'ready'` in `nav.js`. Only `ready` topics are clickable in the sidebar, the home grid and prev/next links.

## Filling a page

Each empty slot is an element with `class="slot"` and a label like `[Theory]` or `[Formula]`. Replace the whole slot element with your content.

- Inline math: `$...$`. Display math: `$$...$$`. Write a literal dollar sign as `\$`.
- Add more theory subsections, formula boxes, example steps or references by copying the existing block.
- The example's **Check** block is optional; delete it if you don't need it.
- Breadcrumb, prev/next links, sidebar, header and footer are generated from `nav.js` by `app.js`. You don't edit them per page.

## Files

```
index.html                  home
style.css                   all styles
app.js                      header, sidebar, search, drawer, breadcrumb, prev/next, footer
nav.js                      topic tree (single source of truth)
lib/                        KaTeX 0.16.22 + render-math.js (auto-render setup)
assets/fonts/               Geist and Geist Mono (SIL OFL 1.1)
topics/mechanics/           one page per topic; _template.html is the template
tools/new-pages.mjs         optional helper that creates missing pages from the template
```

## Deploy

GitHub Pages, deployed from the `main` branch, root folder (`/`). Settings → Pages → Build and deployment → Source: *Deploy from a branch* → `main` / `/ (root)`.

All paths are relative, so the site works under `https://<user>.github.io/<repo>/`.

## Credits

- [KaTeX](https://katex.org), MIT License (`lib/KATEX-LICENSE`)
- [Geist](https://vercel.com/font), SIL Open Font License 1.1 (`assets/fonts/GEIST-LICENSE`)
- Design pass with [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky, CC BY 4.0
