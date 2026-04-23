'use client';
import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { Star, Send, TrendingUp, ThumbsDown, Clock, Activity } from 'lucide-react';
import { feedbackApi, schedulerApi } from '@/lib/api';

interface Stats {
  sent: number;
  opened: number;
  openRate: number;
  rated: number;
  conversionRate: number;
  positive: number;
  negative: number;
  avgScore: number | null;
  googleRedirects: number;
}

interface QueueStats {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
}

// Mock weekly chart data — replace with real API call
const mockWeekly = [
  { day: 'Lun', sent: 12, positive: 9, negative: 3 },
  { day: 'Mar', sent: 19, positive: 16, negative: 3 },
  { day: 'Mie', sent: 8,  positive: 7,  negative: 1 },
  { day: 'Joi', sent: 24, positive: 20, negative: 4 },
  { day: 'Vin', sent: 31, positive: 27, negative: 4 },
  { day: 'Sâm', sent: 42, positive: 38, negative: 4 },
  { day: 'Dum', sent: 18, positive: 15, negative: 3 },
];

function StatCard({ label, value, sub, icon: Icon, color = 'brand' }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: string;
}) {
  const colors: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    blue:  'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    red:   'bg-red-50 text-red-600',
    purple:'bg-purple-50 text-purple-600',
  };
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [queue, setQueue] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      feedbackApi.getStats(),
      schedulerApi.queueStats(),
    ]).then(([statsRes, queueRes]) => {
      setStats(statsRes.data.data);
      setQueue(queueRes.data.data);
    }).finally(() => setLoading(false));
  }, []);

  const pieData = stats ? [
    { name: 'Pozitive', value: stats.positive, color: '#22c55e' },
    { name: 'Negative', value: stats.negative, color: '#ef4444' },
  ] : [];

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="text-gray-500 text-sm mt-1">Ultimele 30 de zile</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Send}       label="Mesaje trimise"     value={stats?.sent ?? 0}             color="brand" />
        <StatCard icon={TrendingUp} label="Redirecționări Google" value={stats?.googleRedirects ?? 0} color="blue"  sub={`${stats?.conversionRate ?? 0}% conversie`} />
        <StatCard icon={Star}       label="Scor mediu"         value={stats?.avgScore ? `${stats.avgScore}/5` : '–'} color="amber" />
        <StatCard icon={ThumbsDown} label="Feedback negativ"   value={stats?.negative ?? 0}         color="red"   />
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Weekly area chart */}
        <div className="card p-6 md:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-4">Mesaje pe săptămână</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={mockWeekly}>
              <defs>
                <linearGradient id="positive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #f3f4f6', fontSize: 13 }}
              />
              <Area type="monotone" dataKey="sent"     stroke="#d1d5db" strokeWidth={2} fill="none" name="Trimise" />
              <Area type="monotone" dataKey="positive" stroke="#22c55e" strokeWidth={2} fill="url(#positive)" name="Pozitive" />
              <Area type="monotone" dataKey="negative" stroke="#ef4444" strokeWidth={2} fill="none" name="Negative" strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart */}
        <div className="card p-6 flex flex-col">
          <h2 className="font-semibold text-gray-900 mb-4">Distribuție feedback</h2>
          {(stats?.positive ?? 0) + (stats?.negative ?? 0) > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={3} dataKey="value">
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [`${v}`, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {pieData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                      <span className="text-gray-600">{d.name}</span>
                    </div>
                    <span className="font-semibold">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
              Nu există date încă
            </div>
          )}
        </div>
      </div>

      {/* Queue stats */}
      {queue && (
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-gray-400" />
            <h2 className="font-semibold text-gray-900">Coadă mesaje WhatsApp</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'În așteptare', value: queue.delayed, color: 'text-blue-600' },
              { label: 'Active',       value: queue.active,  color: 'text-brand-600' },
              { label: 'Finalizate',   value: queue.waiting, color: 'text-gray-600' },
              { label: 'Eșuate',       value: queue.failed,  color: 'text-red-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center p-3 bg-gray-50 rounded-xl">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
