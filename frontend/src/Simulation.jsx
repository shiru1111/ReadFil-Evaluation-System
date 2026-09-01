import React, { useState } from 'react';
import { useLanguage } from './contexts/LanguageContext';

export default function Simulation() {
  const { t } = useLanguage();
  const [passages, setPassages] = useState([
    { id: 1, targetText: 'Nakita rin nila ang buwaya.', spokenText: 'Nakita rin nela ang buwaya', duration: '3.0' }
  ]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAddPassage = () => {
    setPassages([
      ...passages,
      { id: Date.now(), targetText: '', spokenText: '', duration: '3.0' }
    ]);
  };

  const handleRemovePassage = (id) => {
    if (passages.length === 1) return;
    setPassages(passages.filter(p => p.id !== id));
  };

  const handlePassageChange = (id, field, value) => {
    setPassages(passages.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  const handleSimulate = async () => {
    setLoading(true);
    setError('');
    
    // Format payload
    const payloadPassages = passages.map(p => ({
      target_text: p.targetText,
      spoken_text: p.spokenText,
      duration: parseFloat(p.duration) || 3.0
    }));

    try {
      const response = await fetch((import.meta.env.VITE_API_URL || '') + '/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passages: payloadPassages })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to simulate');
      }
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl">{t("sim.title")}</h1>
          <p className="mt-4 text-xl text-gray-500">{t("sim.subtitle")}</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 p-8 space-y-8">
          
          {passages.map((passage, index) => (
            <div key={passage.id} className="relative bg-gray-50 p-6 rounded-2xl border border-gray-200">
              <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
                <h3 className="text-xl font-bold text-gray-800">{t("sim.passage")} #{index + 1}</h3>
                {passages.length > 1 && (
                  <button 
                    onClick={() => handleRemovePassage(passage.id)}
                    className="text-red-500 hover:text-red-700 font-bold text-sm uppercase tracking-wider"
                  >
                    {t("sim.remove")}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide">{t("sim.target")}</label>
                  <textarea 
                    rows={3}
                    className="w-full rounded-xl border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 font-mono text-sm p-4 bg-white"
                    value={passage.targetText}
                    onChange={e => handlePassageChange(passage.id, 'targetText', e.target.value)}
                  />
                </div>
                
                <div className="space-y-4">
                  <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide">{t("sim.spoken")}</label>
                  <textarea 
                    rows={3}
                    className="w-full rounded-xl border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 font-mono text-sm p-4 bg-white"
                    value={passage.spokenText}
                    onChange={e => handlePassageChange(passage.id, 'spokenText', e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-6 w-48 space-y-2">
                <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide">{t("sim.duration")}</label>
                <input 
                  type="number" 
                  step="0.1"
                  className="w-full rounded-xl border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3 bg-white"
                  value={passage.duration}
                  onChange={e => handlePassageChange(passage.id, 'duration', e.target.value)}
                />
              </div>
            </div>
          ))}

          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-gray-100">
            <button
              onClick={handleAddPassage}
              className="w-full sm:w-auto px-6 py-3 bg-white text-black font-bold rounded-xl border-2 border-gray-200 hover:border-black hover:bg-gray-50 transition-colors shadow-sm"
            >
              {t("sim.add")}
            </button>
            
            <button
              onClick={handleSimulate}
              disabled={loading}
              className="w-full sm:w-auto px-10 py-3 bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-colors shadow-lg hover:shadow-xl disabled:opacity-50"
            >
              {loading ? t("sim.simulating") : t("sim.run")}
            </button>
          </div>
          
          {error && <div className="mt-4 text-red-500 font-semibold text-center bg-red-50 p-4 rounded-xl">{error}</div>}
        </div>

        {results && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* OVERALL Score Cards */}
            <div>
              <h2 className="text-2xl font-bold mb-6 text-center">{t("sim.overall")}</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 flex flex-col items-center justify-center text-center relative overflow-hidden group">
                   <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
                   <div className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">{t("sim.total_acc")}</div>
                   <div className="text-5xl font-black text-blue-600">{results.overall_accuracy}%</div>
                   <div className="text-sm text-gray-500 mt-2">{results.total_correct_words} / {results.total_target_words} {t("sim.words")}</div>
                </div>
                
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 flex flex-col items-center justify-center text-center relative overflow-hidden group">
                   <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
                   <div className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">{t("sim.total_spd")}</div>
                   <div className="text-5xl font-black text-purple-600">{results.overall_wcpm}</div>
                   <div className="text-sm text-gray-500 mt-2">{t("sim.target_wcpm")}</div>
                </div>

                <div className="bg-gradient-to-br from-black to-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700 flex flex-col items-center justify-center text-center relative overflow-hidden group text-white">
                   <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform"></div>
                   <div className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">{t("sim.total_comp")}</div>
                   <div className="text-6xl font-black text-white">{results.overall_composite_score}</div>
                   <div className="text-xs text-gray-400 mt-2 font-mono">(Acc × 0.5) + (Spd × 0.5)</div>
                </div>
              </div>
            </div>

            {/* Individual Passage Traces */}
            <div className="space-y-8">
              <h2 className="text-2xl font-bold text-center border-b border-gray-300 pb-4">{t("sim.indiv_transcript")}</h2>
              {results.passages.map((passageResult, index) => (
                <div key={index} className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 p-8">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-black text-gray-800">{t("sim.passage")} #{index + 1}</h3>
                    <div className="flex gap-4">
                      <div className="bg-blue-50 px-4 py-2 rounded-lg border border-blue-100 text-blue-800 font-bold text-sm">
                        Acc: {passageResult.accuracy}%
                      </div>
                      <div className="bg-purple-50 px-4 py-2 rounded-lg border border-purple-100 text-purple-800 font-bold text-sm">
                        WCPM: {passageResult.wcpm}
                      </div>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b-2 border-gray-200">
                          <th className="py-4 px-4 text-sm font-bold text-gray-500 uppercase tracking-wider">{t("sim.target_word")}</th>
                          <th className="py-4 px-4 text-sm font-bold text-gray-500 uppercase tracking-wider">{t("sim.spoken_word")}</th>
                          <th className="py-4 px-4 text-sm font-bold text-gray-500 uppercase tracking-wider">{t("sim.status")}</th>
                          <th className="py-4 px-4 text-sm font-bold text-gray-500 uppercase tracking-wider">{t("sim.mld_penalty")}</th>
                          <th className="py-4 px-4 text-sm font-bold text-gray-500 uppercase tracking-wider">{t("sim.outcome")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {passageResult.trace.length === 0 ? (
                          <tr>
                            <td colSpan="5" className="py-8 text-center text-gray-500 italic">No trace generated. Ensure passage has valid text.</td>
                          </tr>
                        ) : (
                          passageResult.trace.map((step, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                              <td className="py-4 px-4 font-mono text-gray-900">{step.target}</td>
                              <td className="py-4 px-4 font-mono text-gray-900">
                                {passageResult.stutter_words?.includes(step.spoken) ? (
                                  <span className="bg-orange-200 text-orange-900 font-extrabold px-2 py-1 rounded-md shadow-sm">{step.spoken}</span>
                                ) : (
                                  step.spoken
                                )}
                              </td>
                              <td className="py-4 px-4">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                  step.type === 'match' ? 'bg-green-100 text-green-800' :
                                  passageResult.stutter_words?.includes(step.spoken) ? 'bg-orange-200 text-orange-900' :
                                  step.type === 'insertion' ? 'bg-orange-100 text-orange-800' :
                                  step.type === 'deletion' ? 'bg-red-100 text-red-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {passageResult.stutter_words?.includes(step.spoken) ? `STUTTER (${step.type.toUpperCase()})` : step.type.toUpperCase()}
                                </span>
                              </td>
                              <td className="py-4 px-4 font-mono font-semibold text-gray-600">
                                {step.distance.toFixed(1)}
                              </td>
                              <td className="py-4 px-4">
                                {step.is_correct ? (
                                  <span className="flex items-center text-green-600 font-bold">
                                    <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                    {t("sim.pass") || "Pass"}
                                  </span>
                                ) : (
                                  <span className="flex items-center text-red-600 font-bold">
                                    <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                    {t("sim.fail") || "Fail"}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
