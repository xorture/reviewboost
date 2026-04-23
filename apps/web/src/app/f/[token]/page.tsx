'use client';
import { useState, useEffect, use } from 'react';
import { feedbackApi } from '@/lib/api';

type Stage = 'loading' | 'rating' | 'submitting' | 'positive' | 'negative-form' | 'negative-thanks' | 'expired' | 'already-rated' | 'error';

interface PageData {
  businessName: string;
  locationName: string;
  customerName: string | null;
  isExpired: boolean;
  isAlreadyRated: boolean;
}

interface RatingResult {
  feedbackType: 'positive' | 'negative';
  googleMapsUrl?: string;
  showInternalForm?: boolean;
}

export default function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [stage, setStage] = useState<Stage>('loading');
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [selectedStar, setSelectedStar] = useState(0);
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [comment, setComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    feedbackApi.getPage(token)
      .then(({ data }) => {
        const d = data.data as PageData;
        setPageData(d);
        if (d.isExpired) setStage('expired');
        else if (d.isAlreadyRated) setStage('already-rated');
        else setStage('rating');
      })
      .catch(() => setStage('error'));
  }, [token]);

  async function handleStarClick(score: number) {
    setSelectedStar(score);
    setStage('submitting');
    try {
      const { data } = await feedbackApi.rate(token, score);
      const result = data.data as RatingResult;
      if (result.feedbackType === 'positive' && result.googleMapsUrl) {
        setGoogleMapsUrl(result.googleMapsUrl);
        setStage('positive');
        // Auto-redirect after 2s
        setTimeout(() => { window.location.href = result.googleMapsUrl!; }, 2000);
      } else {
        setStage('negative-form');
      }
    } catch {
      setStage('error');
    }
  }

  async function handleCommentSubmit() {
    if (!comment.trim()) return;
    setSubmittingComment(true);
    try {
      await feedbackApi.comment(token, comment);
      setStage('negative-thanks');
    } catch {
      setSubmittingComment(false);
    }
  }

  const starLabel = (n: number) => ['', 'Foarte nemulțumit', 'Nemulțumit', 'Neutru', 'Mulțumit', 'Foarte mulțumit'][n];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-brand-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">

        {/* ─── LOADING ─── */}
        {stage === 'loading' && (
          <div className="card p-10 text-center">
            <div className="w-10 h-10 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Se încarcă...</p>
          </div>
        )}

        {/* ─── SUBMITTING ─── */}
        {stage === 'submitting' && (
          <div className="card p-10 text-center animate-scale-in">
            <div className="text-5xl mb-4">{'⭐'.repeat(selectedStar)}</div>
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Se procesează...</p>
          </div>
        )}

        {/* ─── RATING STAGE ─── */}
        {stage === 'rating' && pageData && (
          <div className="card p-8 text-center animate-slide-up">
            {/* Logo / business name */}
            <div className="w-16 h-16 bg-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <span className="text-2xl">⭐</span>
            </div>

            <h1 className="text-xl font-bold text-gray-900 mb-1">
              {pageData.customerName ? `Bună, ${pageData.customerName.split(' ')[0]}!` : 'Bună ziua!'}
            </h1>
            <p className="text-gray-500 text-sm mb-1">
              Cum a fost experiența la
            </p>
            <p className="font-semibold text-gray-800 mb-8">
              {pageData.locationName || pageData.businessName}
            </p>

            {/* Star rating */}
            <div className="flex justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className="star-btn text-5xl leading-none focus:outline-none"
                  style={{ color: n <= (hoveredStar || selectedStar) ? '#f59e0b' : '#e5e7eb' }}
                  onMouseEnter={() => setHoveredStar(n)}
                  onMouseLeave={() => setHoveredStar(0)}
                  onClick={() => handleStarClick(n)}
                  aria-label={`${n} stele`}
                >
                  ★
                </button>
              ))}
            </div>

            <p className="text-sm text-gray-400 h-5 transition-all">
              {starLabel(hoveredStar || selectedStar)}
            </p>

            <p className="text-xs text-gray-300 mt-8">
              Powered by ReviewBoost
            </p>
          </div>
        )}

        {/* ─── POSITIVE — redirect to Google ─── */}
        {stage === 'positive' && (
          <div className="card p-10 text-center animate-scale-in">
            <div className="text-6xl mb-5 animate-bounce">🎉</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Îți mulțumim!</h2>
            <p className="text-gray-500 mb-6">
              Ne bucurăm că experiența a fost plăcută! Te redirectăm acum la Google pentru a lăsa o recenzie publică.
            </p>
            <div className="flex items-center justify-center gap-2 text-brand-600 font-medium text-sm">
              <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              Se deschide Google Maps...
            </div>
            <a
              href={googleMapsUrl}
              className="btn-primary mt-6 w-full justify-center"
            >
              Lasă recenzia pe Google →
            </a>
          </div>
        )}

        {/* ─── NEGATIVE — internal form ─── */}
        {stage === 'negative-form' && (
          <div className="card p-8 animate-slide-up">
            <div className="text-4xl text-center mb-4">😔</div>
            <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
              Ne pare rău!
            </h2>
            <p className="text-gray-500 text-sm text-center mb-6">
              Părerea ta ne ajută să ne îmbunătățim. Spune-ne ce putem face mai bine:
            </p>

            <textarea
              className="input resize-none"
              rows={5}
              placeholder="Descrie experiența ta... Ce am putea îmbunătăți?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
            />
            <p className="text-xs text-gray-300 text-right mt-1">{comment.length}/2000</p>

            <button
              className="btn-primary w-full mt-4"
              onClick={handleCommentSubmit}
              disabled={!comment.trim() || submittingComment}
            >
              {submittingComment ? 'Se trimite...' : 'Trimite feedback'}
            </button>

            <button
              className="w-full text-center text-xs text-gray-300 mt-3 hover:text-gray-400 transition-colors"
              onClick={() => setStage('negative-thanks')}
            >
              Sari peste
            </button>
          </div>
        )}

        {/* ─── NEGATIVE — thank you ─── */}
        {stage === 'negative-thanks' && (
          <div className="card p-10 text-center animate-scale-in">
            <div className="text-5xl mb-5">🙏</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Mulțumim!</h2>
            <p className="text-gray-500">
              Feedback-ul tău a fost înregistrat. Echipa noastră va analiza situația și va lua măsuri de îmbunătățire.
            </p>
          </div>
        )}

        {/* ─── EXPIRED ─── */}
        {stage === 'expired' && (
          <div className="card p-10 text-center animate-fade-in">
            <div className="text-5xl mb-5">⏰</div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Link expirat</h2>
            <p className="text-gray-500 text-sm">
              Acest link de feedback nu mai este valabil (a expirat după 48 de ore).
            </p>
          </div>
        )}

        {/* ─── ALREADY RATED ─── */}
        {stage === 'already-rated' && (
          <div className="card p-10 text-center animate-fade-in">
            <div className="text-5xl mb-5">✅</div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Deja votat!</h2>
            <p className="text-gray-500 text-sm">
              Ai trimis deja un feedback pentru această vizită. Îți mulțumim!
            </p>
          </div>
        )}

        {/* ─── ERROR ─── */}
        {stage === 'error' && (
          <div className="card p-10 text-center animate-fade-in">
            <div className="text-5xl mb-5">🔗</div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Link invalid</h2>
            <p className="text-gray-500 text-sm">
              Acest link nu există sau a fost deja folosit.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
