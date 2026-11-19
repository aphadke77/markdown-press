/* Markdown → DOCX / PDF converters. Depends on globals: marked, docx (DOCX), pdfMake (PDF). */
(function (root) {
  "use strict";

  const ACCENTS = {
    ink: { hex: "1F2A3A", label: "Ink" },
    cobalt: { hex: "2B4ACB", label: "Cobalt" },
    pine: { hex: "1E6B52", label: "Pine" },
    claret: { hex: "8A2846", label: "Claret" },
  };

  const PAGES = {
    letter: { docx: { width: 12240, height: 15840 }, pdf: "LETTER", widthPt: 612 },
    a4: { docx: { width: 11906, height: 16838 }, pdf: "A4", widthPt: 595.28 },
  };

  const TYPEFACES = {
    serif: {
      docx: "Georgia",
      pdf: { normal: "SourceSerif4_400Regular.ttf", bold: "SourceSerif4_700Bold.ttf", italics: "SourceSerif4_400Regular_Italic.ttf", bolditalics: "SourceSerif4_700Bold_Italic.ttf" },
    },
    sans: {
      docx: "Calibri",
      pdf: { normal: "SourceSans3_400Regular.ttf", bold: "SourceSans3_700Bold.ttf", italics: "SourceSans3_400Regular_Italic.ttf", bolditalics: "SourceSans3_700Bold_Italic.ttf" },
    },
  };
  const MONO_PDF = { normal: "SourceCodePro_400Regular.ttf", bold: "SourceCodePro_700Bold.ttf", italics: "SourceCodePro_400Regular_Italic.ttf", bolditalics: "SourceCodePro_700Bold_Italic.ttf" };
  const MONO_DOCX = "Consolas";

  const HEAD_SCALE = [2.0, 1.55, 1.27, 1.12, 1.0, 0.95];
  const CODE_BG = "F3F4F7";
  const RULE = "D3D8E0";
  const MUTED = "545C69";

  function decode(s) {
    if (!s) return "";
    return String(s)
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
  }
  function stripTags(s) { return decode(String(s || "").replace(/<[^>]*>/g, "")); }

  function lex(md) {
    return root.marked.lexer(md, { gfm: true });
  }

  /* ---------- Inline tokens → neutral runs ---------- */
  function inlineRuns(tokens, fmt) {
    fmt = fmt || {};
    const out = [];
    for (const t of tokens || []) {
      switch (t.type) {
        case "text":
          if (t.tokens && t.tokens.length) out.push(...inlineRuns(t.tokens, fmt));
          else out.push(Object.assign({}, fmt, { text: decode(t.text) }));
          break;
        case "escape": out.push(Object.assign({}, fmt, { text: decode(t.text) })); break;
        case "strong": out.push(...inlineRuns(t.tokens, Object.assign({}, fmt, { bold: true }))); break;
        case "em": out.push(...inlineRuns(t.tokens, Object.assign({}, fmt, { italics: true }))); break;
        case "del": out.push(...inlineRuns(t.tokens, Object.assign({}, fmt, { strike: true }))); break;
        case "codespan": out.push(Object.assign({}, fmt, { code: true, text: decode(t.text) })); break;
        case "link": out.push(...inlineRuns(t.tokens, Object.assign({}, fmt, { link: t.href }))); break;
        case "br": out.push(Object.assign({}, fmt, { br: true })); break;
        case "image": out.push(Object.assign({}, fmt, { image: { src: t.href, alt: decode(t.text) } })); break;
        case "html":
          if (/^<br\s*\/?>$/i.test(t.text.trim())) out.push(Object.assign({}, fmt, { br: true }));
          else { const s = stripTags(t.text); if (s) out.push(Object.assign({}, fmt, { text: s })); }
          break;
        default:
          if (t.tokens) out.push(...inlineRuns(t.tokens, fmt));
          else if (t.text) out.push(Object.assign({}, fmt, { text: decode(t.text) }));
      }
    }
    return out;
  }
  function blockInline(tok) {
    // paragraph / text / heading blocks
    if (tok.tokens) return inlineRuns(tok.tokens);
    return [{ text: decode(tok.text) }];
  }
  function onlyImage(runs) {
    const real = runs.filter((r) => !(r.text !== undefined && !r.text.trim() && !r.image));
    return real.length === 1 && real[0].image ? real[0].image : null;
  }

  /* ---------- Image pre-pass (data: URLs only; remote images become alt text) ---------- */
  function collectImageSrcs(tokens, set) {
    for (const t of tokens || []) {
      if (t.type === "image" && /^data:image\/(png|jpe?g|gif);base64,/i.test(t.href)) set.add(t.href);
      if (t.tokens) collectImageSrcs(t.tokens, set);
      if (t.items) t.items.forEach((i) => collectImageSrcs(i.tokens, set));
      if (t.type === "table") {
        t.header.forEach((c) => collectImageSrcs(c.tokens, set));
        t.rows.forEach((r) => r.forEach((c) => collectImageSrcs(c.tokens, set)));
      }
    }
    return set;
  }
  function b64ToBytes(b64) {
    const bin = atob(b64); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function loadImages(tokens) {
    const map = new Map();
    const srcs = [...collectImageSrcs(tokens, new Set())];
    await Promise.all(srcs.map((src) => new Promise((resolve) => {
      if (typeof Image === "undefined") return resolve();
      const img = new Image();
      img.onload = () => {
        let dataUrl = src;
        if (/^data:image\/gif/i.test(src)) { // convert GIF to PNG for PDF/DOCX
          const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext("2d").drawImage(img, 0, 0); dataUrl = c.toDataURL("image/png");
        }
        map.set(src, { dataUrl, w: img.naturalWidth, h: img.naturalHeight, bytes: b64ToBytes(dataUrl.split(",")[1]) });
        resolve();
      };
      img.onerror = () => resolve();
      img.src = src;
    })));
    return map;
  }

  /* =================== DOCX =================== */
  async function toDocx(md, opts) {
    const D = root.docx;
    const tokens = lex(md);
    const images = await loadImages(tokens);
    const accent = ACCENTS[opts.accent].hex;
    const font = TYPEFACES[opts.typeface].docx;
    const halfPts = opts.size * 2;
    const page = PAGES[opts.page];
    const contentPx = Math.round(((page.docx.width - 2880) / 1440) * 96);
    const numbering = [];
    let olCount = 0;

    const border = (color, size, space) => ({ style: D.BorderStyle.SINGLE, size: size || 4, color: color || RULE, space: space || 0 });

    function runs(rs, extra) {
      const out = [];
      for (const r of rs) {
        if (r.br) { out.push(new D.TextRun({ text: "", break: 1 })); continue; }
        if (r.image) {
          const im = images.get(r.image.src);
          if (im) {
            const scale = Math.min(1, contentPx / im.w, 640 / im.h);
            out.push(new D.ImageRun({ data: im.bytes, transformation: { width: Math.round(im.w * scale), height: Math.round(im.h * scale) } }));
          } else if (r.image.alt) {
            out.push(new D.TextRun({ text: "[" + r.image.alt + "]", italics: true, color: MUTED }));
          }
          continue;
        }
        if (!r.text) continue;
        const o = Object.assign({ text: r.text }, extra || {});
        if (r.bold) o.bold = true;
        if (r.italics) o.italics = true;
        if (r.strike) o.strike = true;
        if (r.code) {
          o.font = MONO_DOCX; o.size = halfPts - 2;
          o.shading = { type: D.ShadingType.CLEAR, color: "auto", fill: CODE_BG };
        }
        if (r.link) { o.color = accent; o.underline = { type: D.UnderlineType.SINGLE, color: accent }; }
        const run = new D.TextRun(o);
        if (r.link && /^(https?:|mailto:)/i.test(r.link)) out.push(new D.ExternalHyperlink({ link: r.link, children: [run] }));
        else out.push(run);
      }
      return out;
    }

    function olConfig(start, level) {
      const ref = "ol" + ++olCount;
      const fmts = [D.LevelFormat.DECIMAL, D.LevelFormat.LOWER_LETTER, D.LevelFormat.LOWER_ROMAN];
      numbering.push({
        reference: ref,
        levels: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((l) => ({
          level: l, format: fmts[l % 3], text: "%" + (l + 1) + ".", alignment: D.AlignmentType.START,
          start: l === level ? start : 1,
          style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } },
        })),
      });
      return ref;
    }

    function blocks(toks, ctx) {
      const out = [];
      const para = (o) => {
        if (ctx.quote) {
          o.indent = Object.assign({ left: 400 * ctx.quote }, o.indent || {});
          o.border = { left: border(accent, 18, 10) };
        }
        return new D.Paragraph(o);
      };
      const quoteRun = ctx.quote ? { color: MUTED, italics: true } : null;
      for (const t of toks) {
        switch (t.type) {
          case "space": break;
          case "heading": {
            const lvl = Math.min(t.depth, 6);
            out.push(para({ heading: D.HeadingLevel["HEADING_" + lvl], children: runs(blockInline(t)) }));
            break;
          }
          case "paragraph":
          case "text": {
            const rs = blockInline(t);
            const p = { children: runs(rs, quoteRun) };
            if (ctx.listIndent) p.indent = { left: ctx.listIndent };
            if (onlyImage(rs)) p.alignment = D.AlignmentType.CENTER;
            out.push(para(p));
            break;
          }
          case "code": {
            const lines = t.text.replace(/\t/g, "    ").split("\n");
            out.push(new D.Paragraph({
              shading: { type: D.ShadingType.CLEAR, color: "auto", fill: CODE_BG },
              border: { top: border(RULE, 4, 4), bottom: border(RULE, 4, 4), left: border(RULE, 4, 6), right: border(RULE, 4, 6) },
              spacing: { before: 80, after: 200, line: 260 },
              indent: { left: (ctx.listIndent || 0) + 120, right: 120 },
              keepLines: lines.length < 25,
              children: lines.map((ln, i) => new D.TextRun({ text: ln, font: MONO_DOCX, size: halfPts - 3, break: i ? 1 : 0 })),
            }));
            break;
          }
          case "blockquote":
            out.push(...blocks(t.tokens, Object.assign({}, ctx, { quote: (ctx.quote || 0) + 1 })));
            break;
          case "hr":
            out.push(new D.Paragraph({ spacing: { before: 120, after: 240 }, border: { bottom: border("B8BEC8", 6) }, children: [] }));
            break;
          case "list": {
            const level = ctx.level || 0;
            const ref = t.ordered ? olConfig(typeof t.start === "number" ? t.start : 1, level) : null;
            for (const item of t.items) {
              let first = true;
              for (const sub of item.tokens) {
                if (sub.type === "space") continue;
                if (sub.type === "list") {
                  out.push(...blocks([sub], Object.assign({}, ctx, { level: level + 1, listIndent: 0 })));
                  continue;
                }
                if (first && (sub.type === "text" || sub.type === "paragraph")) {
                  let rs = blockInline(sub);
                  if (item.task) rs = [{ text: item.checked ? "☒ " : "☐ " }].concat(rs);
                  const last = item === t.items[t.items.length - 1] && level === 0;
                  const p = { children: runs(rs, quoteRun), spacing: { after: item.loose || last ? 140 : 40 } };
                  if (ref) p.numbering = { reference: ref, level };
                  else if (item.task) p.indent = { left: 360 * (level + 1) };
                  else p.numbering = { reference: "bullets", level };
                  out.push(para(p));
                  first = false;
                } else {
                  out.push(...blocks([sub], Object.assign({}, ctx, { listIndent: 720 * (level + 1) })));
                  first = false;
                }
              }
            }
            break;
          }
          case "table": {
            const align = (a) => a === "center" ? D.AlignmentType.CENTER : a === "right" ? D.AlignmentType.RIGHT : D.AlignmentType.LEFT;
            const mk = (cells, head) => new D.TableRow({
              tableHeader: head, cantSplit: true,
              children: cells.map((c, ci) => new D.TableCell({
                shading: head ? { type: D.ShadingType.CLEAR, color: "auto", fill: "EEF1F5" } : undefined,
                margins: { top: 70, bottom: 70, left: 110, right: 110 },
                children: [new D.Paragraph({ alignment: align(t.align[ci]), spacing: { after: 0 }, children: runs(inlineRuns(c.tokens, head ? { bold: true } : {})) })],
              })),
            });
            out.push(new D.Table({
              width: { size: 100, type: D.WidthType.PERCENTAGE },
              borders: { top: border(), bottom: border(), left: border(), right: border(), insideHorizontal: border(), insideVertical: border() },
              rows: [mk(t.header, true)].concat(t.rows.map((r) => mk(r, false))),
            }));
            out.push(new D.Paragraph({ spacing: { after: 120 }, children: [] }));
            break;
          }
          case "html": {
            const s = stripTags(t.text).trim();
            if (s) out.push(para({ children: [new D.TextRun(s)] }));
            break;
          }
          default:
            if (t.text) out.push(para({ children: [new D.TextRun(decode(t.text))] }));
        }
      }
      return out;
    }

    const children = blocks(tokens, {});
    const bulletChars = ["•", "◦", "▪"];
    numbering.push({
      reference: "bullets",
      levels: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((l) => ({
        level: l, format: D.LevelFormat.BULLET, text: bulletChars[l % 3], alignment: D.AlignmentType.START,
        style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } },
      })),
    });

    const headingStyles = HEAD_SCALE.map((s, i) => ({
      id: "Heading" + (i + 1), name: "Heading " + (i + 1), basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { font, size: Math.round(halfPts * s), bold: true, color: i < 3 ? accent : "1F2A3A", italics: i === 5 },
      paragraph: { spacing: { before: i === 0 ? 360 : 280, after: i === 0 ? 160 : 100 }, keepNext: true, keepLines: true },
    }));

    const doc = new D.Document({
      creator: "Markdown Press",
      title: opts.title || "Document",
      styles: {
        default: { document: { run: { font, size: halfPts, color: "1F2329" }, paragraph: { spacing: { after: 140, line: 288 } } } },
        paragraphStyles: headingStyles,
      },
      numbering: { config: numbering },
      sections: [{
        properties: { page: { size: page.docx, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        children,
      }],
    });
    return D.Packer.toBlob ? D.Packer.toBlob(doc) : D.Packer.toBuffer(doc);
  }

  /* =================== PDF (pdfmake definition) =================== */
  async function toPdfDefinition(md, opts) {
    const tokens = lex(md);
    const images = await loadImages(tokens);
    const accent = "#" + ACCENTS[opts.accent].hex;
    const base = opts.size;
    const page = PAGES[opts.page];
    const contentW = page.widthPt - 144;
    const gap = base * 0.75;

    function runs(rs, extra) {
      const out = [];
      for (const r of rs) {
        if (r.br) { out.push({ text: "\n" }); continue; }
        if (r.image) { out.push({ text: r.image.alt ? "[" + r.image.alt + "]" : "", italics: true, color: "#" + MUTED }); continue; }
        if (!r.text) continue;
        const o = Object.assign({ text: r.text }, extra || {});
        if (r.bold) o.bold = true;
        if (r.italics) o.italics = true;
        const deco = [];
        if (r.strike) deco.push("lineThrough");
        if (r.link) { o.link = r.link; o.color = accent; deco.push("underline"); o.decorationColor = accent; }
        if (deco.length) o.decoration = deco.length === 1 ? deco[0] : deco;
        if (r.code) { o.font = "Mono"; o.fontSize = base * 0.86; o.background = "#" + CODE_BG; }
        out.push(o);
      }
      return out.length ? out : [{ text: "" }];
    }
    function imageBlock(img) {
      const im = images.get(img.src);
      if (!im) return null;
      const w = Math.min(contentW, im.w * 0.75);
      return { image: im.dataUrl, width: w, alignment: "center", margin: [0, 4, 0, gap] };
    }

    function blocks(toks, ctx) {
      const out = [];
      const q = ctx.quote ? { color: "#" + MUTED, italics: true } : null;
      for (const t of toks) {
        switch (t.type) {
          case "space": break;
          case "heading": {
            const d = Math.min(t.depth, 6);
            out.push({ text: runs(blockInline(t)), style: "h" + d, headlineLevel: d, tocItem: false });
            break;
          }
          case "paragraph":
          case "text": {
            const rs = blockInline(t);
            const img = onlyImage(rs) && imageBlock(onlyImage(rs));
            if (img) { out.push(img); break; }
            out.push({ text: runs(rs, q), margin: [0, 0, 0, ctx.tight ? base * 0.12 : gap] });
            break;
          }
          case "code":
            out.push({
              table: { widths: ["*"], body: [[{ text: t.text.replace(/\t/g, "    ") || " ", font: "Mono", fontSize: base * 0.82, lineHeight: 1.3, preserveLeadingSpaces: true, fillColor: "#" + CODE_BG, margin: [8, 6, 8, 6] }]] },
              layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => "#" + RULE, vLineColor: () => "#" + RULE, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
              margin: [0, 2, 0, gap],
            });
            break;
          case "blockquote":
            out.push({
              table: { widths: ["*"], body: [[{ stack: blocks(t.tokens, Object.assign({}, ctx, { quote: true })) }]] },
              layout: { hLineWidth: () => 0, vLineWidth: (i) => (i === 0 ? 2.5 : 0), vLineColor: () => accent, paddingLeft: () => 12, paddingRight: () => 0, paddingTop: () => 2, paddingBottom: () => 0 },
              margin: [0, 2, 0, gap * 0.6],
            });
            break;
          case "hr":
            out.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: contentW - (ctx.indent || 0), y2: 0, lineWidth: 0.8, lineColor: "#B8BEC8" }], margin: [0, gap * 0.5, 0, gap * 1.2] });
            break;
          case "list": {
            const items = t.items.map((item) => {
              const content = [];
              item.tokens.forEach((sub) => {
                if (sub.type === "space") return;
                content.push(...blocks([sub], Object.assign({}, ctx, { tight: !item.loose, indent: (ctx.indent || 0) + 18, depth: (ctx.depth || 0) + 1 })));
              });
              if (!content.length) content.push({ text: " " });
              if (item.task) {
                const box = [{ type: "rect", x: 0, y: base * 0.18, w: base * 0.72, h: base * 0.72, r: 1.5, lineWidth: 0.8, lineColor: "#6B7280" }];
                if (item.checked) {
                  const s = base * 0.72, y0 = base * 0.18;
                  box.push({ type: "polyline", lineWidth: 1.3, lineColor: accent, points: [{ x: s * 0.2, y: y0 + s * 0.55 }, { x: s * 0.42, y: y0 + s * 0.78 }, { x: s * 0.82, y: y0 + s * 0.22 }] });
                }
                return { columns: [{ width: base * 1.1, canvas: box }, { width: "*", stack: content }], columnGap: 2 };
              }
              return { stack: content };
            });
            const isTask = t.items.some((i) => i.task);
            const list = t.ordered ? { ol: items, start: typeof t.start === "number" ? t.start : 1 } : { ul: items };
            if (isTask) list.type = "none";
            else if (!t.ordered) list.type = ["disc", "circle", "square"][(ctx.depth || 0) % 3];
            list.markerColor = "#4B5361";
            list.margin = [0, 0, 0, ctx.depth ? 0 : gap * 0.6];
            out.push(list);
            break;
          }
          case "table": {
            const n = t.header.length;
            const al = (i) => t.align[i] || "left";
            const body = [t.header.map((c, i) => ({ text: runs(inlineRuns(c.tokens, { bold: true })), alignment: al(i), fillColor: "#EEF1F5" }))]
              .concat(t.rows.map((r) => r.map((c, i) => ({ text: runs(inlineRuns(c.tokens)), alignment: al(i) }))));
            out.push({
              table: { headerRows: 1, dontBreakRows: true, widths: Array(n).fill("*"), body },
              layout: {
                hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => "#" + RULE, vLineColor: () => "#" + RULE,
                paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4,
              },
              fontSize: base * 0.94,
              margin: [0, 2, 0, gap * 1.2],
            });
            break;
          }
          case "html": {
            const s = stripTags(t.text).trim();
            if (s) out.push({ text: s, margin: [0, 0, 0, gap] });
            break;
          }
          default:
            if (t.text) out.push({ text: decode(t.text), margin: [0, 0, 0, gap] });
        }
      }
      return out;
    }

    const styles = {};
    HEAD_SCALE.forEach((s, i) => {
      styles["h" + (i + 1)] = {
        fontSize: base * s, bold: true, italics: i === 5, color: i < 3 ? accent : "#1F2A3A",
        lineHeight: 1.12, margin: [0, i === 0 ? base * 1.2 : base * 1.0, 0, i === 0 ? base * 0.55 : base * 0.4],
      };
    });

    return {
      pageSize: page.pdf,
      pageMargins: [72, 72, 72, 72],
      info: { title: opts.title || "Document", creator: "Markdown Press" },
      content: blocks(tokens, {}),
      defaultStyle: { font: "Body", fontSize: base, lineHeight: 1.28, color: "#1F2329" },
      styles,
      pageBreakBefore: (node, following) => node.headlineLevel && following.length === 0,
      footer: (current, count) => count > 1 ? { text: current + " / " + count, alignment: "center", fontSize: base * 0.75, color: "#8A919C", margin: [0, 30, 0, 0] } : null,
    };
  }

  function pdfFontMap(typeface) {
    return { Body: Object.assign({}, TYPEFACES[typeface].pdf), Mono: Object.assign({}, MONO_PDF) };
  }

  function guessTitle(md, fallback) {
    const m = md.match(/^\s{0,3}#\s+(.+?)\s*#*\s*$/m);
    return m ? stripTags(m[1]).replace(/[*_`~\[\]]/g, "").trim() : fallback || "document";
  }

  root.MDPress = { ACCENTS, PAGES, TYPEFACES, toDocx, toPdfDefinition, pdfFontMap, guessTitle };
})(typeof window !== "undefined" ? window : globalThis);
