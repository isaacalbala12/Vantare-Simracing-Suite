type V52SectionHeaderProps = {
  title: string;
  description: string;
};

export function V52SectionHeader({ title, description }: V52SectionHeaderProps) {
  return (
    <header>
      <h1 className="font-display font-bold text-3xl text-white tracking-tight">
        {title}
      </h1>
      <p className="text-sm text-vantare-textMuted mt-2 leading-relaxed max-w-3xl">
        {description}
      </p>
    </header>
  );
}
