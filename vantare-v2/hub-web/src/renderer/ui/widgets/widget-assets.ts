export const widgetIcons = import.meta.glob<string>(
  "../../assets/widgets/w-*.svg",
  {
    eager: true,
    query: "?url",
    import: "default",
  },
);
export const widgetRasters = import.meta.glob<string>(
  "../../assets/widgets/thumbs/*.png",
  {
    eager: true,
    query: "?url",
    import: "default",
  },
);
