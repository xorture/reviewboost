'use client';
import { useEffect, useState } from 'react';
import { settingsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Save, Eye, Info } from 'lucide-react';

interface Settings {
  delayMinutes: number;
  messageTemplate: string;
  spamFilterDays: number;
  positiveScoreThreshold: number;
  notifyNegativeEmail: boolean;
  notificationEmail: string;
  notifyNegativeWhatsapp: boolean;
}

const TEMPLATE_VARS = [
  { key: '{{client_name}}',    desc: 'Numele clientului' },
  { key: '{{business_name}}',  desc: 'Numele afacerii' },
  { key: '{{service}}',        desc: 'Serviciul efectuat' },
  { key: '{{feedback_url}}',   desc: 'Link-ul unic de feedback (obligatoriu)' },
];

export default function SettingsPage() {
  const [form, setForm] = useState<Settings | null>(null);
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    settingsApi.get().then(({ data }) => setForm(data.data));
  }, []);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    try {
      await settingsApi.update(form as unknown as Record<string, unknown>);
      toast.success('Setările au fost salvate!');
    } catch {
      toast.error('Eroare la salvare');
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    if (!form) return;
    setPreviewing(true);
    try {
      const { data } = await settingsApi.previewTemplate(form.messageTemplate);
      setPreview(data.data.preview);
    } finally {
      setPreviewing(false);
    }
  }

  function set<K extends keyof Settings>(key: K, val: Settings[K]) {
    setForm((prev) => prev ? { ...prev, [key]: val } : prev);
  }

  if (!form) {
    return (
      <div className="p-8 flex justify-center">
        <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Setări</h1>
        <p className="text-gray-500 text-sm mt-1">Configurează comportamentul sistemului</p>
      </div>

      {/* Timing */}
      <section className="card p-6 space-y-5">
        <h2 className="font-semibold text-gray-900">⏱ Temporizare</h2>

        <div>
          <label className="label">Delay trimitere mesaj (minute)</label>
          <div className="flex items-center gap-3">
            <input
              type="range" min={5} max={480} step={5}
              value={form.delayMinutes}
              onChange={(e) => set('delayMinutes', parseInt(e.target.value))}
              className="flex-1 accent-brand-600"
            />
            <span className="text-sm font-semibold text-gray-700 w-16 text-right">
              {form.delayMinutes < 60 ? `${form.delayMinutes} min` : `${form.delayMinutes / 60}h`}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Cât timp după finalizarea programării se trimite mesajul WhatsApp
          </p>
        </div>

        <div>
          <label className="label">Filtru anti-spam (zile)</label>
          <div className="flex items-center gap-3">
            <input
              type="range" min={1} max={90} step={1}
              value={form.spamFilterDays}
              onChange={(e) => set('spamFilterDays', parseInt(e.target.value))}
              className="flex-1 accent-brand-600"
            />
            <span className="text-sm font-semibold text-gray-700 w-16 text-right">
              {form.spamFilterDays} zile
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Nu se trimite un nou mesaj aceluiași client mai devreme de X zile
          </p>
        </div>

        <div>
          <label className="label">Prag recenzie pozitivă</label>
          <div className="flex gap-2">
            {[3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => set('positiveScoreThreshold', n)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                  form.positiveScoreThreshold === n
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                }`}
              >
                {n}+ ⭐ → Google
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Ratingurile mai mici decât pragul rămân interne
          </p>
        </div>
      </section>

      {/* Message template */}
      <section className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">💬 Mesaj WhatsApp</h2>

        <div className="flex flex-wrap gap-2">
          {TEMPLATE_VARS.map(({ key, desc }) => (
            <button
              key={key}
              title={desc}
              onClick={() => set('messageTemplate', form.messageTemplate + key)}
              className="text-xs px-2.5 py-1 bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100 font-mono transition-colors"
            >
              {key}
            </button>
          ))}
        </div>

        <textarea
          className="input font-mono text-sm"
          rows={8}
          value={form.messageTemplate}
          onChange={(e) => set('messageTemplate', e.target.value)}
          placeholder="Scrie mesajul tău WhatsApp..."
        />

        {preview && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-green-700 mb-2">📱 Preview mesaj:</p>
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{preview}</pre>
          </div>
        )}

        <button
          onClick={handlePreview}
          disabled={previewing}
          className="btn-secondary w-full"
        >
          <Eye className="w-4 h-4" />
          {previewing ? 'Se generează...' : 'Previzualizează mesaj'}
        </button>
      </section>

      {/* Notifications */}
      <section className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">🔔 Notificări feedback negativ</h2>

        <label className="flex items-center gap-3 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only"
              checked={form.notifyNegativeEmail}
              onChange={(e) => set('notifyNegativeEmail', e.target.checked)}
            />
            <div className={`w-10 h-6 rounded-full transition-colors ${form.notifyNegativeEmail ? 'bg-brand-600' : 'bg-gray-200'}`}>
              <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform m-1 ${form.notifyNegativeEmail ? 'translate-x-4' : ''}`} />
            </div>
          </div>
          <span className="text-sm text-gray-700">Alertă email la feedback negativ</span>
        </label>

        {form.notifyNegativeEmail && (
          <div>
            <label className="label">Email pentru alerte</label>
            <input
              type="email"
              className="input"
              value={form.notificationEmail}
              onChange={(e) => set('notificationEmail', e.target.value)}
              placeholder="tu@afacerea.ro"
            />
          </div>
        )}
      </section>

      {/* Save */}
      <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
        <Save className="w-4 h-4" />
        {saving ? 'Se salvează...' : 'Salvează setările'}
      </button>
    </div>
  );
}
