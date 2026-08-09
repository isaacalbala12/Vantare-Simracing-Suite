# Bundled typefaces

Inter, Rajdhani and Space Mono, latin and latin-ext subsets, generated from the
Google Fonts css2 API. All three are under the SIL Open Font License 1.1.

They used to be fetched at runtime from `fonts.googleapis.com` by a `<link>` in
`index.html`. WebView2 never got them, so the whole interface rendered in the
monospace fallback — and so did every user without internet. A desktop app
should not need the network to draw its own text.

`src/fonts.css` declares the faces and is imported first from `src/index.css`.
`src/lib/mono-font.contract.test.ts` fails if a font ever goes back over the
network.
