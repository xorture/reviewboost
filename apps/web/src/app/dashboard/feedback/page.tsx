'use client';
import { useEffect, useState } from 'react';
import { feedbackApi } from '@/lib/api';
import { MessageSquare, Star, MapPin, Clock } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ro';

dayjs.extend(relativeTime);
dayjs.locale('ro');

interface FeedbackEntry {
  id: string;
  score: number;
  comment: string | null;
  ratedAt: string;
  feedbackType: string;
  appointment: {
    serviceName: string | null;
    staffName: string | null;
    customer: { fullName: string | null };
    location: { locationName: string };
  };
}

function ScoreBadge({ score }: { score: number }) {
  const stars = '★'.repeat(score) + '☆'.repeat(5 - score);
  const color = score <= 2 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
  return (
    <span className={`badge ${color} font-mono tracking-wide`}>{stars}</span>
  );
}

export default function FeedbackDashboard() {
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    feedbackApi.getNegativeFeed(page)
      .then(({ data }) => {
        setEntries(data.data.data);
        setTotal(data.data.total);
      })
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="p-6 md:p-8 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Feedback Negativ</h1>
        <p className="text-gray-500 text-sm mt-1">
          {total} reclamații înregistrate · Nicio reclamație nu ajunge pe Google
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <p className="font-semibold text-gray-900 mb-1">Niciun feedback negativ!</p>
          <p className="text-gray-400 text-sm">Clienții tăi sunt mulțumiți.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <div key={entry.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-sm font-bold text-gray-600">
                    {entry.appointment.customer.fullName?.[0] ?? '?'}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      {entry.appointment.customer.fullName ?? 'Client anonim'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <MapPin className="w-3 h-3 text-gray-300" />
                      <span className="text-xs text-gray-400">
                        {entry.appointment.location.locationName}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ScoreBadge score={entry.score} />
                  <span className="text-xs text-gray-400">
                    {dayjs(entry.ratedAt).fromNow()}
                  </span>
                </div>
              </div>

              {entry.appointment.serviceName && (
                <p className="text-xs text-gray-400 mb-2">
                  Serviciu: <span className="text-gray-600">{entry.appointment.serviceName}</span>
                  {entry.appointment.staffName && ` · ${entry.appointment.staffName}`}
                </p>
              )}

              {entry.comment ? (
                <div className="bg-gray-50 border-l-2 border-gray-200 rounded-r-lg pl-3 pr-4 py-2.5 mt-2">
                  <p className="text-sm text-gray-700 italic">"{entry.comment}"</p>
                </div>
              ) : (
                <p className="text-xs text-gray-300 italic mt-2 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  Clientul nu a lăsat un comentariu
                </p>
              )}
            </div>
          ))}

          {/* Pagination */}
          {total > 20 && (
            <div className="flex justify-center gap-2 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary px-4 py-2 text-sm"
              >
                ← Anterior
              </button>
              <span className="flex items-center px-4 text-sm text-gray-500">
                Pagina {page} din {Math.ceil(total / 20)}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(total / 20)}
                className="btn-secondary px-4 py-2 text-sm"
              >
                Următor →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
