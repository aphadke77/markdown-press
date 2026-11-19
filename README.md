# Markdown Press

Convert Markdown (`.md`) files into formatted **Word (.docx)** and **PDF** documents, right in your browser. Nothing is uploaded anywhere: parsing and file generation all happen on your machine.

## Features

- Open a `.md` file, drag one onto the editor, or paste/type Markdown
- Live, page-style preview that matches the exported files
- **Word export** with real Word styles (Heading 1–6, numbered and bulleted lists), so the document stays editable and its headings show in the navigation pane
- **PDF export** with selectable text and embedded fonts (Source Serif 4, Source Sans 3, Source Code Pro)
- Options: serif or sans typeface, 10/11/12 pt text, Letter or A4 pages, four heading colours
- Supports GitHub-flavoured Markdown: headings, bold/italic/strikethrough, links, inline code and code blocks, nested lists, task lists, blockquotes, tables with column alignment, horizontal rules, and embedded base64 images (PNG, JPEG, GIF)
- Works on phones: the editor and preview switch to tabs on narrow screens

## Use it

Open `index.html` in any modern browser. It is a single self-contained file, so it also works when hosted on GitHub Pages:

1. In the repository, go to **Settings → Pages**
2. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then **Save**
3. After a minute the app is live at `https://<your-username>.github.io/markdown-press/`

## Project layout

| Path | What it is |
|---|---|
| `index.html` | The built app. Open or host this file. |
| `src/index.src.html` | Page markup, styles and UI logic |
| `src/convert.js` | Markdown → DOCX and Markdown → PDF converters |
| `src/sample.md` | Example document shown on first load |
| `src/fonts/` | PDF fonts, subset to Latin, Greek, Cyrillic and common symbols |
| `build.py` | Inlines the converter, sample and fonts into `index.html` |

After editing anything in `src/`, rebuild:

```bash
python3 build.py
```

## Libraries

Loaded from public CDNs at pinned versions:

- [marked](https://marked.js.org/) 12.0.2: Markdown parsing
- [docx](https://docx.js.org/) 8.5.0: Word file generation
- [pdfmake](https://pdfmake.github.io/docs/) 0.2.10: PDF generation

Fonts: Source Serif 4, Source Sans 3 and Source Code Pro by Adobe, under the SIL Open Font License 1.1.

## Limitations

- Images referenced by web address (`![](https://…)`) appear as their alt text. Only images embedded as base64 data are placed in the files.
- The PDF fonts don't cover emoji or CJK, Arabic and Hebrew scripts. Those characters show as blank boxes in the PDF. The Word file uses system fonts (Georgia or Calibri, plus Consolas for code), so Word fills those characters in itself.
- Raw HTML in the Markdown is shown as plain text, apart from `<br>`.
