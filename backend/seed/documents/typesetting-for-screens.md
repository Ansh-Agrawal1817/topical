# Typesetting Long Documents for the Screen

Long-form reading on screens has a bad reputation, and most of it is earned by bad typesetting rather than by screens. A ten-thousand-word document can be comfortable to read in a browser if a handful of decisions are made deliberately. These are the decisions, roughly in order of how much difference they make, with the reasoning behind each so you can tell when to break them.

## 1. Measure: the length of a line

The single biggest factor. Lines that are too long make the eye's return sweep to the next line error-prone; readers land on the wrong line and lose their place. Lines that are too short break up phrases and make reading choppy.

The traditional range is **45–75 characters per line**, with about 66 as a comfortable default for continuous prose. On the web this is easiest to set in `ch` units, which are based on the width of the zero in the current font:

```css
.prose {
  max-width: 68ch;
  margin-inline: auto;
}
```

The common mistake is setting a max-width in pixels on a container and then changing the font size. The measure silently drifts. Set it in `ch` or `em` so it moves with the type.

## 2. Line height

Body text usually wants a line height between **1.4 and 1.6** times the font size. The longer the line, the more line height it needs, because the eye needs a clearer channel to travel back along. Headings want much less, around 1.1–1.25, or multi-line headings fall apart into separate-looking lines.

Set line height as a unitless number, never in pixels, so that it scales with whatever size a reader chooses.

## 3. Size

For a document people will actually read for twenty minutes, **17–20 px** is a reasonable body size on a laptop. The old 12–14 px default came from print conventions and from screens with far fewer pixels. Readers zoom in on small text, which breaks your layout anyway.

Let the size respond to the viewport within limits, so that a phone and a wide monitor both get something sensible:

```css
.prose {
  font-size: clamp(1.0625rem, 0.95rem + 0.4vw, 1.25rem);
}
```

## 4. Choosing a typeface

For long reading, the choice matters less than people think, and the *rendering* matters more. A few practical points:

- **Serif or sans?** Either works for screen reading at modern resolutions. Many people find a good serif more comfortable for long texts; pairing it with a sans for interface elements also helps readers tell the document apart from the controls around it.
- **Large x-height.** Typefaces whose lowercase letters are relatively tall read better at small sizes.
- **Real italics and bold.** If the font doesn't include them, the browser fakes them by slanting and smearing the regular weight, and it looks it.
- **Tabular figures in tables.** Most good fonts include figures of equal width; turn them on with `font-variant-numeric: tabular-nums` wherever numbers sit in columns.

## 5. Hierarchy you can see at a glance

Readers of long documents scan before they read and return to find things afterwards. Headings need to stand out in a way that survives a fast scroll:

- Use **size and weight** together, not size alone.
- Put **more space above a heading than below it**, so it visibly belongs to the text it introduces. This is the most commonly broken rule I see.
- Limit the levels you actually use. Three levels of heading are enough for almost any document; beyond that, readers can't tell the levels apart.

## 6. The small things that look careless when missed

- **Real quotes and dashes.** Curly quotation marks, apostrophes, and the en dash for ranges (pages 12–19). Straight quotes in body text look like a draft.
- **Avoid widows in headings.** A heading whose last line is a single word looks broken. `text-wrap: balance` fixes this in modern browsers.
- **Hyphenation.** Useful for narrow columns and justified text, distracting in wide left-aligned text. If you justify text on the web, you need hyphenation, or you get rivers of white space.
- **Links that look like links,** but not like a ransom note. A subtle underline in a colour that still passes contrast is usually enough.

## 7. Dark mode is a different design, not an inverted one

Pure white text on pure black glows and vibrates for many readers, particularly at small sizes. Soften both ends: an off-white text on a very dark grey background, and slightly *less* font weight than in light mode, because light text on dark looks heavier than the same text dark on light.

## A checklist for a long document

1. Measure between 60 and 75 characters.
2. Body line height around 1.5.
3. Body size at least 17 px on desktop.
4. More space above headings than below.
5. Tabular figures in tables; real quotes and dashes everywhere.
6. Contrast checked in both themes.

None of these is new. Most of them are centuries old. The screen didn't change what makes reading comfortable; it just made it easier to forget.
