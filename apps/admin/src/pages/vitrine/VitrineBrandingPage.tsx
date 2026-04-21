import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CLUB_VITRINE_BRANDING,
  UPDATE_VITRINE_BRANDING,
  type ClubVitrineBrandingData,
} from '../../lib/vitrine-documents';
import { useToast } from '../../components/ToastProvider';

/**
 * Édition du branding vitrine :
 *  - tagline kanji (nav + footer)
 *  - footer JSON (colonnes, social, contact)
 *  - palette couleurs personnalisée (color pickers)
 *  - typographies (serif / sans / japonais — Google Fonts)
 *
 * Les champs vides sont persistés à `null` côté API (retour au fallback SKSR).
 */

interface PaletteState {
  ink: string;
  ink2: string;
  paper: string;
  accent: string;
  goldBright: string;
  vermillion: string;
  line: string;
  muted: string;
}

const DEFAULT_PALETTE: PaletteState = {
  ink: '#0a0908',
  ink2: '#1c1915',
  paper: '#f5f1e8',
  accent: '#c9a96a',
  goldBright: '#e8c97a',
  vermillion: '#b2332a',
  line: '#2a2520',
  muted: '#8a8577',
};

const PRESET_PALETTES: Array<{ name: string; palette: PaletteState }> = [
  {
    name: 'SKSR (or, noir, rouge)',
    palette: DEFAULT_PALETTE,
  },
  {
    name: 'Marine / cuivre',
    palette: {
      ink: '#0b1c2c',
      ink2: '#15304a',
      paper: '#f4efe6',
      accent: '#c4793e',
      goldBright: '#e0a060',
      vermillion: '#9c2e2e',
      line: '#1d3a5a',
      muted: '#7a8497',
    },
  },
  {
    name: 'Forêt / ivoire',
    palette: {
      ink: '#0e1e14',
      ink2: '#1a3a24',
      paper: '#f1ece0',
      accent: '#8aa66a',
      goldBright: '#b8cc80',
      vermillion: '#a63a2a',
      line: '#24452f',
      muted: '#7a8575',
    },
  },
  {
    name: 'Minuit / zen',
    palette: {
      ink: '#0a0f1c',
      ink2: '#151c30',
      paper: '#ececec',
      accent: '#a8b5d1',
      goldBright: '#d0d8ec',
      vermillion: '#c94c4c',
      line: '#202844',
      muted: '#8892a8',
    },
  },
];

interface FontsState {
  serif: string;
  sans: string;
  jp: string;
}

const DEFAULT_FONTS: FontsState = {
  serif: 'Cormorant Garamond',
  sans: 'Inter',
  jp: 'Shippori Mincho',
};

const FONT_SERIF_OPTIONS = [
  'Cormorant Garamond',
  'Playfair Display',
  'EB Garamond',
  'Libre Caslon Text',
  'DM Serif Display',
  'Lora',
  'Spectral',
];
const FONT_SANS_OPTIONS = [
  'Inter',
  'Manrope',
  'Work Sans',
  'DM Sans',
  'Nunito Sans',
  'Outfit',
  'Plus Jakarta Sans',
];
const FONT_JP_OPTIONS = [
  'Shippori Mincho',
  'Noto Serif JP',
  'Zen Old Mincho',
  'Sawarabi Mincho',
  'BIZ UDPMincho',
];

export function VitrineBrandingPage() {
  const { showToast } = useToast();
  const { data, loading, error } = useQuery<ClubVitrineBrandingData>(
    CLUB_VITRINE_BRANDING,
    { fetchPolicy: 'cache-and-network' },
  );
  const [save, { loading: saving }] = useMutation(UPDATE_VITRINE_BRANDING, {
    refetchQueries: [{ query: CLUB_VITRINE_BRANDING }],
  });

  const [tagline, setTagline] = useState('');
  const [footer, setFooter] = useState('');
  const [palette, setPalette] = useState<PaletteState>(DEFAULT_PALETTE);
  const [paletteEnabled, setPaletteEnabled] = useState(false);
  const [fonts, setFonts] = useState<FontsState>(DEFAULT_FONTS);
  const [fontsEnabled, setFontsEnabled] = useState(false);

  useEffect(() => {
    const b = data?.clubVitrineBranding;
    if (!b) return;
    setTagline(b.kanjiTagline ?? '');
    setFooter(
      b.footerJson
        ? JSON.stringify(JSON.parse(b.footerJson), null, 2)
        : '',
    );
    if (b.paletteJson) {
      try {
        const parsed = JSON.parse(b.paletteJson) as Partial<PaletteState>;
        setPalette({ ...DEFAULT_PALETTE, ...parsed });
        setPaletteEnabled(true);
      } catch {
        setPaletteEnabled(false);
      }
    } else {
      setPaletteEnabled(false);
    }
    if (b.fontsJson) {
      try {
        const parsed = JSON.parse(b.fontsJson) as Partial<FontsState>;
        setFonts({ ...DEFAULT_FONTS, ...parsed });
        setFontsEnabled(true);
      } catch {
        setFontsEnabled(false);
      }
    } else {
      setFontsEnabled(false);
    }
  }, [data]);

  const previewStyle = useMemo(
    () => ({
      background: palette.ink,
      color: palette.paper,
      fontFamily: `"${fonts.serif}", serif`,
    }),
    [palette, fonts],
  );

  async function handleSave(): Promise<void> {
    try {
      await save({
        variables: {
          input: {
            kanjiTagline: tagline.trim() || null,
            footerJson: footer.trim() || null,
            paletteJson: paletteEnabled ? JSON.stringify(palette) : null,
            fontsJson: fontsEnabled ? JSON.stringify(fonts) : null,
          },
        },
      });
      showToast('Branding enregistré.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">
              <Link to="/vitrine">← Site vitrine</Link>
            </p>
            <h1 className="members-loom__title">Branding</h1>
            <p className="muted">
              Identité, couleurs, typographies et footer du site vitrine.
            </p>
          </div>
        </div>
      </header>

      {error ? (
        <p className="form-error">{error.message}</p>
      ) : loading && !data ? (
        <p className="muted">Chargement…</p>
      ) : (
        <section style={{ maxWidth: 880, display: 'grid', gap: 24 }}>
          {/* --- Identité --- */}
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Identité</h2>
            <p className="muted">
              Logo et nom du club : <Link to="/settings/branding">Paramètres → Branding</Link>.
            </p>
            <label className="field">
              <span>Tagline (nav &amp; footer)</span>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="ex. 空手道 · Sud Réunion"
              />
            </label>
          </div>

          {/* --- Palette --- */}
          <div style={cardStyle}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <h2 style={{ margin: 0 }}>Palette couleurs</h2>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={paletteEnabled}
                  onChange={(e) => setPaletteEnabled(e.target.checked)}
                />
                <span>Activer</span>
              </label>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              Désactivé = palette SKSR par défaut (or / noir / rouge).
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
              {PRESET_PALETTES.map((preset) => (
                <button
                  type="button"
                  key={preset.name}
                  className="btn btn-tight btn-ghost"
                  onClick={() => {
                    setPalette(preset.palette);
                    setPaletteEnabled(true);
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 12,
                opacity: paletteEnabled ? 1 : 0.5,
                pointerEvents: paletteEnabled ? 'auto' : 'none',
              }}
            >
              {(Object.keys(palette) as Array<keyof PaletteState>).map((key) => (
                <label key={key} className="field" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ minWidth: 110, fontSize: 13 }}>{labelForPaletteKey(key)}</span>
                  <input
                    type="color"
                    value={palette[key]}
                    onChange={(e) =>
                      setPalette((p) => ({ ...p, [key]: e.target.value }))
                    }
                    style={{ width: 44, height: 32, border: 'none', padding: 0 }}
                  />
                  <input
                    type="text"
                    value={palette[key]}
                    onChange={(e) =>
                      setPalette((p) => ({ ...p, [key]: e.target.value }))
                    }
                    style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
                  />
                </label>
              ))}
            </div>

            <div
              style={{
                marginTop: 16,
                padding: 20,
                borderRadius: 8,
                ...previewStyle,
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: palette.accent, marginBottom: 8 }}>
                Aperçu
              </div>
              <div style={{ fontSize: 32, fontWeight: 300, color: palette.paper }}>
                Karaté <em style={{ color: palette.accent }}>traditionnel.</em>
              </div>
              <div
                style={{
                  marginTop: 10,
                  display: 'inline-block',
                  padding: '8px 16px',
                  background: palette.accent,
                  color: palette.ink,
                  fontSize: 12,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                }}
              >
                Découvrir
              </div>
            </div>
          </div>

          {/* --- Fonts --- */}
          <div style={cardStyle}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h2 style={{ margin: 0 }}>Typographies</h2>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={fontsEnabled}
                  onChange={(e) => setFontsEnabled(e.target.checked)}
                />
                <span>Activer</span>
              </label>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              Les fonts proposées sont toutes disponibles sur Google Fonts.
              Désactivé = stack SKSR par défaut.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 16,
                opacity: fontsEnabled ? 1 : 0.5,
                pointerEvents: fontsEnabled ? 'auto' : 'none',
              }}
            >
              <label className="field">
                <span>Serif (titres)</span>
                <select
                  value={fonts.serif}
                  onChange={(e) => setFonts((f) => ({ ...f, serif: e.target.value }))}
                >
                  {FONT_SERIF_OPTIONS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <span
                  style={{
                    fontFamily: `"${fonts.serif}", serif`,
                    fontSize: 24,
                    marginTop: 4,
                  }}
                >
                  Kata · Bunkai
                </span>
              </label>
              <label className="field">
                <span>Sans-serif (corps)</span>
                <select
                  value={fonts.sans}
                  onChange={(e) => setFonts((f) => ({ ...f, sans: e.target.value }))}
                >
                  {FONT_SANS_OPTIONS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <span
                  style={{
                    fontFamily: `"${fonts.sans}", sans-serif`,
                    fontSize: 14,
                    marginTop: 4,
                  }}
                >
                  Le karaté-dō est une voie.
                </span>
              </label>
              <label className="field">
                <span>Japonais (kanji)</span>
                <select
                  value={fonts.jp}
                  onChange={(e) => setFonts((f) => ({ ...f, jp: e.target.value }))}
                >
                  {FONT_JP_OPTIONS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <span
                  style={{
                    fontFamily: `"${fonts.jp}", serif`,
                    fontSize: 28,
                    marginTop: 4,
                  }}
                >
                  空手道
                </span>
              </label>
            </div>
          </div>

          {/* --- Footer --- */}
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Footer</h2>
            <p className="muted">
              JSON structuré : <code>tagline</code>, <code>brandLine</code>,{' '}
              <code>description</code>, <code>socialLinks[]</code>,{' '}
              <code>columns[]</code>, <code>contact</code>,{' '}
              <code>legalBottomRight</code>. Laisser vide pour utiliser le
              fallback SKSR.
            </p>
            <textarea
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              rows={18}
              style={{
                width: '100%',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 12,
              }}
              placeholder="{ ... JSON ... }"
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              className="btn btn-tight"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer le branding'}
            </button>
          </div>
        </section>
      )}
    </>
  );
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border, #ddd)',
  borderRadius: 8,
  padding: 20,
};

function labelForPaletteKey(key: keyof PaletteState): string {
  switch (key) {
    case 'ink':
      return 'Fond primaire';
    case 'ink2':
      return 'Fond secondaire';
    case 'paper':
      return 'Fond clair';
    case 'accent':
      return 'Accent (or)';
    case 'goldBright':
      return 'Or brillant';
    case 'vermillion':
      return 'Rouge';
    case 'line':
      return 'Trait / bordure';
    case 'muted':
      return 'Texte secondaire';
    default:
      return key;
  }
}
