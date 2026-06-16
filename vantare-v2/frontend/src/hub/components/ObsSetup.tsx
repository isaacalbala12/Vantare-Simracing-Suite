import { useState } from 'react';

export type ObsSetupProps = {
  url: string;
};

export function ObsSetup({ url }: ObsSetupProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedInstructions, setCopiedInstructions] = useState(false);

  const instructions = `1. Abre OBS Studio.
2. Ve a Fuentes → + → Navegador.
3. Pega la URL: ${url}
4. Ancho: 1920, Alto: 1080.
5. Opcional: marca "Controlar audio mediante OBS" si el overlay tiene sonido.`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopyInstructions = () => {
    navigator.clipboard.writeText(instructions);
    setCopiedInstructions(true);
    setTimeout(() => setCopiedInstructions(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-vantare-textMuted font-mono"
        />
        <button
          type="button"
          onClick={handleCopyUrl}
          className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-vantare-red-700 to-vantare-burgundy hover:from-vantare-red-600 hover:to-vantare-burgundy transition-all"
        >
          {copiedUrl ? 'Copiado' : 'Copiar URL'}
        </button>
      </div>

      <pre className="p-3 rounded-lg bg-black/20 border border-white/5 text-xs text-vantare-textMuted whitespace-pre-wrap leading-relaxed">
        {instructions}
      </pre>

      <button
        type="button"
        onClick={handleCopyInstructions}
        className="px-4 py-2 rounded-lg text-xs text-vantare-textMuted hover:text-white border border-white/10 hover:border-white/20 transition-all"
      >
        {copiedInstructions ? 'Copiado' : 'Copiar instrucciones'}
      </button>
    </div>
  );
}
