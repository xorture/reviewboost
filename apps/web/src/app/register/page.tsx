'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Zap, CheckCircle } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    businessName: '', ownerName: '', email: '', password: '', phoneNumber: '',
  });

  function set(key: string, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authApi.register(form);
      localStorage.setItem('access_token', data.data.accessToken);
      localStorage.setItem('refresh_token', data.data.refreshToken);
      toast.success('Cont creat! Bun venit la ReviewBoost 🎉');
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Eroare la înregistrare');
    } finally {
      setLoading(false);
    }
  }

  const benefits = [
    '14 zile trial gratuit',
    'Integrare WhatsApp în 5 minute',
    'Fără card de credit la înregistrare',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand-200">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Creează cont gratuit</h1>
          <div className="flex flex-col items-center gap-1.5 mt-3">
            {benefits.map((b) => (
              <div key={b} className="flex items-center gap-2 text-sm text-gray-500">
                <CheckCircle className="w-4 h-4 text-brand-500" />
                {b}
              </div>
            ))}
          </div>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Nume afacere</label>
                <input
                  required className="input" placeholder="Salonul Maria"
                  value={form.businessName} onChange={(e) => set('businessName', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Numele tău</label>
                <input
                  required className="input" placeholder="Maria Ionescu"
                  value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label">Email</label>
              <input
                type="email" required className="input" placeholder="maria@salon.ro"
                value={form.email} onChange={(e) => set('email', e.target.value)}
              />
            </div>

            <div>
              <label className="label">Telefon (pentru alerte WhatsApp)</label>
              <input
                className="input" placeholder="+40721234567"
                value={form.phoneNumber} onChange={(e) => set('phoneNumber', e.target.value)}
              />
            </div>

            <div>
              <label className="label">Parolă</label>
              <input
                type="password" required minLength={8} className="input" placeholder="Minim 8 caractere"
                value={form.password} onChange={(e) => set('password', e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Cel puțin o majusculă, o literă mică și o cifră</p>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Se creează contul...
                </span>
              ) : 'Creează cont gratuit →'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            Ai deja cont?{' '}
            <Link href="/login" className="text-brand-600 font-medium hover:underline">
              Autentifică-te
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
