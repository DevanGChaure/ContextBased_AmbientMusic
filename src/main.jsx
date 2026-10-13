import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BookOpen, Play, Pause, SkipBack, SkipForward, Upload, Music, Activity,
  Brain, ChevronRight, Home, Library, Settings, Volume2, VolumeX, RefreshCw,
  Type, Sliders, Info, Zap, Check, Sparkles, Clock, Compass, Eye, X, ChevronDown
} from 'lucide-react';
import { audioEngine } from './audioEngine.js';
import { defaultChapter } from './defaultChapter.js';
import './style.css';

const colors = {
  Neutral: '#7b8498',
  Fear: '#ef6672',
  Interest: '#a678ff',
  Sadness: '#648cff',
  Joy: '#f6b94f',
  Anger: '#ff754b',
  Surprise: '#55c9b1',
  Disgust: '#9aaa5b'
};

function App() {
  const [screen, setScreen] = useState('home');
  const [timeline, setTimeline] = useState(defaultChapter);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [book, setBook] = useState('HP');
  const [loaded, setLoaded] = useState(false);

  const item = timeline[current] || timeline[0];
  const mood = colors[item?.dominant_emotion] || '#8d7bff';

  const stats = useMemo(() => ({
    avg: Math.round(timeline.reduce((a, x) => a + (x.intensity || 50), 0) / Math.max(timeline.length, 1)),
    changes: timeline.filter((x, i) => i && x.dominant_emotion !== timeline[i - 1].dominant_emotion).length
  }), [timeline]);

  useEffect(() => {
    fetch(`/data/${book}/timeline.json`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        // Ensure every chunk has paragraphs
        const enriched = d.map((item, idx) => {
          if (!item.paragraphs || item.paragraphs.length === 0) {
            const fallbackParas = defaultChapter[idx]?.paragraphs || [item.scene_summary || ''];
            return { ...item, paragraphs: fallbackParas };
          }
          return item;
        });
        setTimeline(enriched);
        setCurrent(0);
        setLoaded(true);
      })
      .catch(() => {
        // Keep defaultChapter fallback
        setLoaded(false);
      });
  }, [book]);

  const pickFile = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        const enriched = d.map((item, idx) => ({
          ...item,
          paragraphs: item.paragraphs && item.paragraphs.length > 0
            ? item.paragraphs
            : [item.scene_summary || '']
        }));
        setTimeline(enriched);
        setCurrent(0);
        setLoaded(true);
        setScreen('reader');
      } catch {
        alert('Please upload a valid timeline.json');
      }
    };
    r.readAsText(f);
  };

  const nav = [
    ['home', Home, 'Home'],
    ['reader', BookOpen, 'Reader'],
    ['timeline', Activity, 'Timeline'],
    ['library', Library, 'Library']
  ];

  return (
    <div className={`app ${screen === 'reader' ? 'app-reader-mode' : ''}`} style={{ '--mood': mood }}>
      <main>
        {screen === 'home' && (
          <>
            <header className="top">
              <div>
                <span className="eyebrow">EMOTION-AWARE READING</span>
                <h1>Music that follows<br />the story.</h1>
              </div>
              <button className="icon"><Settings size={20} /></button>
            </header>
            <section className="hero">
              <div className="orb"></div>
              <div className="heroText">
                <span>NOW ANALYSING</span>
                <h2>{item?.dominant_emotion}</h2>
                <p>{item?.sub_emotion} · {item?.intensity}% intensity</p>
                <button onClick={() => setScreen('reader')}>
                  Continue reading <ChevronRight size={18} />
                </button>
              </div>
            </section>
            <section className="section">
              <div className="sectionHead">
                <h3>Current book</h3>
                <button onClick={() => setScreen('library')}>Change</button>
              </div>
              <article className="bookCard">
                <div className="cover">H<span>P</span></div>
                <div>
                  <h3>Harry Potter</h3>
                  <p>Emotion soundtrack active</p>
                  <div className="progress">
                    <i style={{ width: `${Math.min(88, 12 + timeline.length * 8)}%` }} />
                  </div>
                  <small>{timeline.length} scenes loaded {loaded ? 'from backend' : 'demo data'}</small>
                </div>
                <BookOpen size={18} />
              </article>
            </section>
            <section className="stats">
              <div>
                <strong>{stats.avg}%</strong>
                <span>Avg. intensity</span>
              </div>
              <div>
                <strong>{stats.changes}</strong>
                <span>Mood shifts</span>
              </div>
              <div>
                <strong>{timeline.length}</strong>
                <span>Scenes</span>
              </div>
            </section>
          </>
        )}

        {screen === 'reader' && (
          <KindleReader
            timeline={timeline}
            current={current}
            setCurrent={setCurrent}
            playing={playing}
            setPlaying={setPlaying}
            setScreen={setScreen}
            book={book}
          />
        )}

        {screen === 'timeline' && (
          <Timeline timeline={timeline} current={current} setCurrent={setCurrent} />
        )}

        {screen === 'library' && (
          <LibraryView book={book} setBook={setBook} pickFile={pickFile} loaded={loaded} />
        )}
      </main>

      <nav>
        {nav.map(([id, I, label]) => (
          <button
            className={screen === id ? 'active' : ''}
            onClick={() => setScreen(id)}
            key={id}
          >
            <I size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

// -------------------------------------------------------------
// KINDLE READING INTERFACE (Full Chapter on One Page)
// -------------------------------------------------------------
function KindleReader({
  timeline,
  current,
  setCurrent,
  playing,
  setPlaying,
  setScreen,
  book
}) {
  // 1. Initial Alert State
  const [showGuideAlert, setShowGuideAlert] = useState(true);
  const [highlightBorders, setHighlightBorders] = useState(false);

  // 2. Read Speed Toggle State (WPM: Words Per Minute)
  const [readSpeed, setReadSpeed] = useState(260); // Default 260 WPM
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // 3. Kindle Appearance (Aa) Settings
  const [showAaMenu, setShowAaMenu] = useState(false);
  const [kindleTheme, setKindleTheme] = useState('paperwhite'); // paperwhite | sepia | dark | mint
  const [fontFamily, setFontFamily] = useState('literata'); // literata | lora | sans
  const [fontSize, setFontSize] = useState(18); // 15 to 24px
  const [lineHeight, setLineHeight] = useState(1.85); // 1.6, 1.85, 2.1
  const [marginWidth, setMarginWidth] = useState('normal'); // compact | normal | wide

  // 4. Viewport & Focus Zone Tracking
  const viewportRef = useRef(null);
  const topBorderRef = useRef(null);
  const bottomBorderRef = useRef(null);

  // Detected chunk positions relative to focus zone
  const [upperChunkIndex, setUpperChunkIndex] = useState(current || 0);
  const [lowerChunkIndex, setLowerChunkIndex] = useState(current || 0);
  const [activeChunkIndex, setActiveChunkIndex] = useState(current || 0);

  // Traversal timing & shift state
  const [shiftProgress, setShiftProgress] = useState(0); // 0 to 100%
  const [remainingShiftSec, setRemainingShiftSec] = useState(0);
  const [wordsInTransition, setWordsInTransition] = useState(0);
  const [isShifting, setIsShifting] = useState(false);

  // Kindle location / progress state
  const [locProgress, setLocProgress] = useState({ currentLoc: 1, totalLoc: 100, pct: 0, minsLeft: 5 });

  // Volume
  const [volume, setVolume] = useState(0.35);
  const [audioMuted, setAudioMuted] = useState(false);

  // Active audio chunk item
  const activeItem = timeline[activeChunkIndex] || timeline[0];
  const upperItem = timeline[upperChunkIndex] || timeline[0];
  const lowerItem = timeline[lowerChunkIndex] || timeline[0];

  // Trigger audio update when active chunk changes and playing is true
  useEffect(() => {
    if (playing && !audioMuted) {
      audioEngine.play(
        activeItem?.dominant_emotion || 'Neutral',
        activeItem?.intensity || 50,
        activeItem?.fade_ms || 1800
      );
    } else {
      audioEngine.stop(800);
    }
  }, [activeChunkIndex, playing, audioMuted]);

  // Adjust volume
  useEffect(() => {
    audioEngine.setVolume(audioMuted ? 0 : volume);
  }, [volume, audioMuted]);

  // Auto-highlight borders on initial load for visual clarity
  useEffect(() => {
    if (showGuideAlert) {
      setHighlightBorders(true);
      const t = setTimeout(() => setHighlightBorders(false), 3800);
      return () => clearTimeout(t);
    }
  }, [showGuideAlert]);

  // Handle pulse trigger
  const triggerBorderHighlight = () => {
    setHighlightBorders(true);
    setTimeout(() => setHighlightBorders(false), 3200);
  };

  // Calculate word count of a chunk or slice
  const getChunkWordCount = useCallback((chunkIdx) => {
    const chunk = timeline[chunkIdx];
    if (!chunk || !chunk.paragraphs) return 100;
    return chunk.paragraphs.reduce((acc, p) => acc + p.split(/\s+/).length, 0);
  }, [timeline]);

  // -------------------------------------------------------------
  // Viewport Scroll & Focus Zone Detection
  // Computes which paragraphs are between top and bottom borders
  // -------------------------------------------------------------
  const checkFocusZone = useCallback(() => {
    const vp = viewportRef.current;
    const topBorder = topBorderRef.current;
    const bottomBorder = bottomBorderRef.current;
    if (!vp || !topBorder || !bottomBorder) return;

    const topBorderRect = topBorder.getBoundingClientRect();
    const bottomBorderRect = bottomBorder.getBoundingClientRect();

    const focusTop = topBorderRect.bottom;
    const focusBottom = bottomBorderRect.top;
    const focusMid = focusTop + (focusBottom - focusTop) / 2;

    const paragraphs = vp.querySelectorAll('[data-chunk-idx]');
    if (!paragraphs.length) return;

    let upperChunk = null;
    let lowerChunk = null;
    let upperWords = 0;

    paragraphs.forEach(el => {
      const rect = el.getBoundingClientRect();
      const chunkIdx = parseInt(el.getAttribute('data-chunk-idx'), 10);
      const text = el.textContent || '';
      const words = text.split(/\s+/).filter(Boolean).length;

      // Inside focus zone
      if (rect.bottom > focusTop && rect.top < focusBottom) {
        if (rect.top < focusMid) {
          if (upperChunk === null) upperChunk = chunkIdx;
          if (upperChunk === chunkIdx) upperWords += words;
        } else {
          if (lowerChunk === null) lowerChunk = chunkIdx;
        }
      }
    });

    if (upperChunk === null) upperChunk = activeChunkIndex;
    if (lowerChunk === null) lowerChunk = upperChunk;

    setUpperChunkIndex(upperChunk);
    setLowerChunkIndex(lowerChunk);

    // Calculate Kindle reading progress
    const scrollHeight = vp.scrollHeight - vp.clientHeight;
    const scrollPos = vp.scrollTop;
    const pct = scrollHeight > 0 ? Math.min(100, Math.round((scrollPos / scrollHeight) * 100)) : 0;
    const totalWords = timeline.reduce((acc, c) => acc + (c.paragraphs?.reduce((a, p) => a + p.split(/\s+/).length, 0) || 50), 0);
    const wordsLeft = Math.max(0, Math.round(totalWords * (1 - pct / 100)));
    const minsLeft = Math.max(1, Math.ceil(wordsLeft / readSpeed));
    const totalLoc = Math.max(10, Math.round(totalWords / 25));
    const currentLoc = Math.min(totalLoc, Math.max(1, Math.round((pct / 100) * totalLoc)));

    setLocProgress({ currentLoc, totalLoc, pct, minsLeft });

    // Multi-chunk presence: upper half is Chunk X, second half is Chunk Y
    if (upperChunk !== lowerChunk) {
      setIsShifting(true);
      setWordsInTransition(upperWords);
      // Traversal time according to currently viewed paragraph and user readSpeed
      const calculatedSec = Math.max(3, Math.round((upperWords / readSpeed) * 60));
      setRemainingShiftSec(prev => (prev > 0 && prev <= calculatedSec ? prev : calculatedSec));
    } else {
      setIsShifting(false);
      setShiftProgress(0);
      setRemainingShiftSec(0);
      if (activeChunkIndex !== upperChunk) {
        setActiveChunkIndex(upperChunk);
        setCurrent(upperChunk);
      }
    }
  }, [timeline, activeChunkIndex, readSpeed, setCurrent]);

  // Scroll listener
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onScroll = () => checkFocusZone();
    vp.addEventListener('scroll', onScroll, { passive: true });
    // Initial check
    checkFocusZone();
    return () => vp.removeEventListener('scroll', onScroll);
  }, [checkFocusZone]);

  // Recalculate on readSpeed change
  useEffect(() => {
    if (isShifting && wordsInTransition > 0) {
      const calculatedSec = Math.max(2, Math.round((wordsInTransition / readSpeed) * 60));
      setRemainingShiftSec(calculatedSec);
    }
  }, [readSpeed, isShifting, wordsInTransition]);

  // Traversal timer: counts down based on read speed and shifts sound when complete
  useEffect(() => {
    if (!isShifting || remainingShiftSec <= 0) return;

    const interval = setInterval(() => {
      setRemainingShiftSec(sec => {
        if (sec <= 1) {
          // Traversal completed: shift audio from upperChunk to lowerChunk!
          setActiveChunkIndex(lowerChunkIndex);
          setCurrent(lowerChunkIndex);
          setIsShifting(false);
          setShiftProgress(100);
          return 0;
        }
        const totalEstimated = Math.max(3, Math.round((wordsInTransition / readSpeed) * 60));
        const progress = Math.min(100, Math.round(((totalEstimated - (sec - 1)) / totalEstimated) * 100));
        setShiftProgress(progress);
        return sec - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isShifting, remainingShiftSec, lowerChunkIndex, wordsInTransition, readSpeed, setCurrent]);

  // Jump to chunk
  const jumpToChunk = (idx) => {
    const target = viewportRef.current?.querySelector(`#chunk-marker-${idx}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const speedPresets = [
    { label: 'Relaxed', wpm: 160, desc: 'Deep reading & atmosphere' },
    { label: 'Casual', wpm: 220, desc: 'Comfortable leisure pace' },
    { label: 'Standard', wpm: 280, desc: 'Average reading rate' },
    { label: 'Brisk', wpm: 360, desc: 'Quick chapter traversal' },
    { label: 'Speed', wpm: 460, desc: 'Fast skim & rapid shift' }
  ];

  return (
    <div className={`kindle-reader-container theme-${kindleTheme} font-${fontFamily} margin-${marginWidth}`}>
      {/* ----------------- INITIAL FOCUS BORDER ALERT ----------------- */}
      {showGuideAlert && (
        <div className="kindle-alert-overlay">
          <div className="kindle-alert-card">
            <div className="alert-header">
              <div className="alert-badge">
                <Sparkles size={16} />
                <span>IMMERSIVE AUDIO ZONE</span>
              </div>
              <button className="alert-close-btn" onClick={() => setShowGuideAlert(false)}>
                <X size={18} />
              </button>
            </div>
            <h3>Please read between these borders for the best experience</h3>
            <p className="alert-desc">
              The ambient soundtrack dynamically changes based on the paragraphs framed between the <b>Top</b> and <b>Bottom Borders</b>.
            </p>
            <div className="alert-feature-box">
              <div className="feature-item">
                <Zap size={18} className="feat-icon" />
                <div>
                  <strong>Read Speed Audio Shifting</strong>
                  <p>When the screen’s upper half is <em>Chunk X</em> and the lower half is <em>Chunk Y</em>, your chosen <b>Read Speed ({readSpeed} WPM)</b> determines exactly when the music shifts to follow your gaze.</p>
                </div>
              </div>
            </div>
            <div className="alert-actions">
              <button
                className="btn-highlight-borders"
                onClick={triggerBorderHighlight}
              >
                <Eye size={16} /> Flash Borders
              </button>
              <button
                className="btn-start-reading"
                onClick={() => {
                  setShowGuideAlert(false);
                  triggerBorderHighlight();
                }}
              >
                <Check size={16} /> Got it, Start Reading
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- KINDLE TOP STATUS / TOOLBAR ----------------- */}
      <header className="kindle-top-bar">
        <div className="kindle-bar-left">
          <button className="kindle-icon-btn" onClick={() => setScreen('home')} title="Return to home">
            ‹ <span className="btn-label">Back</span>
          </button>
          <div className="kindle-title-block">
            <span className="kindle-book-title">Harry Potter and the Sorcerer's Stone</span>
            <span className="kindle-chapter-title">Chapter 1 · The Boy Who Lived</span>
          </div>
        </div>

        <div className="kindle-bar-right">
          {/* Read Speed Toggle Button */}
          <button
            className={`kindle-pill-btn speed-toggle-pill ${showSpeedMenu ? 'active' : ''}`}
            onClick={() => {
              setShowSpeedMenu(!showSpeedMenu);
              setShowAaMenu(false);
            }}
            title="Adjust Read Speed & Traversal Rate"
          >
            <Zap size={15} />
            <span>{readSpeed} WPM</span>
          </button>

          {/* Kindle Aa Display Button */}
          <button
            className={`kindle-icon-btn ${showAaMenu ? 'active' : ''}`}
            onClick={() => {
              setShowAaMenu(!showAaMenu);
              setShowSpeedMenu(false);
            }}
            title="Kindle Font & Page Appearance"
          >
            <Type size={18} />
          </button>

          {/* Audio Play / Mute Button */}
          <button
            className={`kindle-icon-btn audio-toggle-btn ${playing ? 'playing' : ''}`}
            onClick={() => setPlaying(!playing)}
            title={playing ? 'Pause Soundtrack' : 'Play Soundtrack'}
          >
            {playing ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {/* Reopen Border Guide Alert */}
          <button
            className="kindle-icon-btn"
            onClick={() => {
              setShowGuideAlert(true);
              triggerBorderHighlight();
            }}
            title="Border & Sound Guide"
          >
            <Info size={17} />
          </button>
        </div>
      </header>

      {/* ----------------- SPEED TOGGLE POPOVER MENU ----------------- */}
      {showSpeedMenu && (
        <div className="kindle-dropdown-panel speed-menu-panel">
          <div className="panel-header">
            <div>
              <h4>Reading Speed & Traversal</h4>
              <p>Controls how fast sound transitions between visible chunks</p>
            </div>
            <button className="panel-close" onClick={() => setShowSpeedMenu(false)}><X size={16} /></button>
          </div>

          <div className="speed-slider-row">
            <div className="slider-label">
              <span>Read Speed</span>
              <strong>{readSpeed} words / min</strong>
            </div>
            <input
              type="range"
              min="120"
              max="500"
              step="10"
              value={readSpeed}
              onChange={(e) => setReadSpeed(parseInt(e.target.value, 10))}
              className="kindle-slider"
            />
            <div className="slider-ticks">
              <span>120 Slow</span>
              <span>280 Normal</span>
              <span>500 Fast</span>
            </div>
          </div>

          <div className="preset-grid">
            {speedPresets.map(p => (
              <button
                key={p.wpm}
                className={`preset-btn ${readSpeed === p.wpm ? 'selected' : ''}`}
                onClick={() => setReadSpeed(p.wpm)}
              >
                <strong>{p.wpm} WPM</strong>
                <span>{p.label}</span>
              </button>
            ))}
          </div>

          <div className="speed-explanation">
            <Info size={14} />
            <span>
              If upper half is <b>Chunk {upperChunkIndex + 1}</b> and lower half is <b>Chunk {lowerChunkIndex + 1}</b>,
              at <b>{readSpeed} WPM</b> traversal takes <b>{Math.max(3, Math.round((Math.max(40, wordsInTransition) / readSpeed) * 60))}s</b> to shift sound.
            </span>
          </div>
        </div>
      )}

      {/* ----------------- KINDLE Aa DISPLAY SETTINGS ----------------- */}
      {showAaMenu && (
        <div className="kindle-dropdown-panel aa-menu-panel">
          <div className="panel-header">
            <h4>Reading Appearance</h4>
            <button className="panel-close" onClick={() => setShowAaMenu(false)}><X size={16} /></button>
          </div>

          {/* Theme Palette */}
          <div className="aa-section">
            <label>Color Theme</label>
            <div className="theme-options">
              {[
                { id: 'paperwhite', label: 'White' },
                { id: 'sepia', label: 'Sepia' },
                { id: 'dark', label: 'Dark' },
                { id: 'mint', label: 'Sage' }
              ].map(t => (
                <button
                  key={t.id}
                  className={`theme-chip theme-${t.id} ${kindleTheme === t.id ? 'active' : ''}`}
                  onClick={() => setKindleTheme(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Font Family */}
          <div className="aa-section">
            <label>Font</label>
            <div className="font-options">
              {[
                { id: 'literata', label: 'Literata (Bookerly)' },
                { id: 'lora', label: 'Lora (Editorial)' },
                { id: 'sans', label: 'Amazon Ember (Sans)' }
              ].map(f => (
                <button
                  key={f.id}
                  className={`font-chip ${fontFamily === f.id ? 'active' : ''}`}
                  onClick={() => setFontFamily(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div className="aa-section">
            <label>Size: {fontSize}px</label>
            <div className="stepper-row">
              <button
                className="step-btn"
                disabled={fontSize <= 14}
                onClick={() => setFontSize(s => Math.max(14, s - 1))}
              >
                A-
              </button>
              <div className="size-bar">
                {[14, 16, 18, 20, 22, 24].map(s => (
                  <span
                    key={s}
                    className={`size-dot ${fontSize >= s ? 'filled' : ''}`}
                    onClick={() => setFontSize(s)}
                  />
                ))}
              </div>
              <button
                className="step-btn"
                disabled={fontSize >= 24}
                onClick={() => setFontSize(s => Math.min(24, s + 1))}
              >
                A+
              </button>
            </div>
          </div>

          {/* Margins */}
          <div className="aa-section">
            <label>Margins</label>
            <div className="font-options">
              {['compact', 'normal', 'wide'].map(m => (
                <button
                  key={m}
                  className={`font-chip ${marginWidth === m ? 'active' : ''}`}
                  onClick={() => setMarginWidth(m)}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TOP READING FOCUS BORDER ----------------- */}
      <div
        className={`kindle-focus-border top-focus-border ${highlightBorders ? 'border-pulsing' : ''}`}
        ref={topBorderRef}
      >
        <div className="focus-border-line" />
        <div className="focus-border-tag">
          <span className="tag-arrow">▲</span>
          <span className="tag-title">READING FOCUS ZONE · TOP BORDER</span>
          <span className="tag-sub">(Audio Entry Line)</span>
        </div>
        <div className="focus-border-line" />
      </div>

      {/* ----------------- MAIN CONTINUOUS SCROLL VIEWPORT ----------------- */}
      <div
        className="kindle-scroll-viewport"
        ref={viewportRef}
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: lineHeight
        }}
      >
        <div className="kindle-page-flow">
          {/* Chapter Title Header */}
          <div className="kindle-chapter-heading">
            <span className="chapter-eyebrow">CHAPTER ONE</span>
            <h1 className="chapter-main-title">The Boy Who Lived</h1>
            <div className="chapter-ornament">❖ ❖ ❖</div>
          </div>

          {/* Sequential Chapter Paragraphs Flow */}
          {timeline.map((chunk, cIdx) => (
            <section
              key={chunk.chunk_index ?? cIdx}
              id={`chunk-marker-${cIdx}`}
              className={`chapter-chunk-section ${cIdx === activeChunkIndex ? 'chunk-active' : ''}`}
            >
              {/* Scene Transition Marker */}
              {cIdx > 0 && (
                <div className="kindle-scene-marker">
                  <span className="marker-rule" />
                  <div
                    className="marker-pill"
                    style={{ '--scene-color': colors[chunk.dominant_emotion] || '#a678ff' }}
                    onClick={() => jumpToChunk(cIdx)}
                  >
                    <span className="marker-dot" />
                    <span className="marker-text">
                      Scene {cIdx + 1} · {chunk.dominant_emotion} ({chunk.sub_emotion})
                    </span>
                    <small className="marker-track">{chunk.track_id || 'ambient_hold'}</small>
                  </div>
                  <span className="marker-rule" />
                </div>
              )}

              {/* Paragraphs of this Chunk */}
              {(chunk.paragraphs || [chunk.scene_summary || '']).map((para, pIdx) => (
                <p
                  key={pIdx}
                  data-chunk-idx={cIdx}
                  data-para-idx={pIdx}
                  className={`kindle-paragraph ${cIdx === 0 && pIdx === 0 ? 'drop-cap-paragraph' : ''}`}
                >
                  {para}
                </p>
              ))}
            </section>
          ))}

          <div className="chapter-end-ornament">
            <div className="end-stars">★ ★ ★</div>
            <p>End of Chapter 1</p>
          </div>
        </div>
      </div>

      {/* ----------------- BOTTOM READING FOCUS BORDER ----------------- */}
      <div
        className={`kindle-focus-border bottom-focus-border ${highlightBorders ? 'border-pulsing' : ''}`}
        ref={bottomBorderRef}
      >
        <div className="focus-border-line" />
        <div className="focus-border-tag">
          <span className="tag-arrow">▼</span>
          <span className="tag-title">READING FOCUS ZONE · BOTTOM BORDER</span>
          <span className="tag-sub">(Audio Exit Line)</span>
        </div>
        <div className="focus-border-line" />
      </div>

      {/* ----------------- DYNAMIC AUDIO TRAVERSAL STATUS HUD ----------------- */}
      <div className="kindle-traversal-hud">
        {isShifting ? (
          <div className="hud-shifting">
            <div className="hud-badge shift-badge">
              <Zap size={14} className="shifting-icon" />
              <span>
                TRAVERSING CHUNK {upperChunkIndex + 1} ➔ CHUNK {lowerChunkIndex + 1}
              </span>
            </div>
            <div className="hud-details">
              <span>
                Shift in <b>{remainingShiftSec}s</b> at <b>{readSpeed} WPM</b>
              </span>
              <span className="hud-sub">
                Target: <em>{lowerItem.dominant_emotion}</em> ({lowerItem.track_id || 'crossfade'})
              </span>
            </div>
            <div className="hud-progress-track">
              <div
                className="hud-progress-fill"
                style={{
                  width: `${shiftProgress}%`,
                  background: colors[lowerItem.dominant_emotion] || '#a678ff'
                }}
              />
            </div>
          </div>
        ) : (
          <div className="hud-steady">
            <div
              className="hud-mood-dot"
              style={{ background: colors[activeItem?.dominant_emotion] || '#8d7bff' }}
            />
            <div className="hud-steady-info">
              <b>Scene {activeChunkIndex + 1} Audio Active:</b>
              <span>
                {activeItem?.dominant_emotion} ({activeItem?.sub_emotion} · {activeItem?.intensity}%) · {activeItem?.track_id || 'ambient'}
              </span>
            </div>
            {playing && <span className="sound-wave-badge">LIVE ♬</span>}
          </div>
        )}
      </div>

      {/* ----------------- KINDLE BOTTOM STATUS BAR ----------------- */}
      <footer className="kindle-bottom-bar">
        <div className="kindle-status-left">
          <span className="status-loc">
            Loc {locProgress.currentLoc} of {locProgress.totalLoc}
          </span>
          <span className="status-sep">·</span>
          <span className="status-pct">{locProgress.pct}%</span>
          <span className="status-sep">·</span>
          <span className="status-time">{locProgress.minsLeft} min left in chapter</span>
        </div>

        <div className="kindle-status-right">
          <div className="kindle-audio-controls">
            <button
              className="mini-play-btn"
              onClick={() => setPlaying(!playing)}
              title={playing ? 'Pause Soundtrack' : 'Play Ambient Soundtrack'}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
              <span>{playing ? 'Sound ON' : 'Sound OFF'}</span>
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audioMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
                setAudioMuted(false);
              }}
              className="mini-volume-slider"
              title="Soundtrack Volume"
            />
          </div>
          <button
            className="mini-speed-badge"
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            title="Read Speed"
          >
            ⚡ {readSpeed} WPM
          </button>
        </div>
      </footer>
    </div>
  );
}

// -------------------------------------------------------------
// TIMELINE VIEW (Unchanged functionality)
// -------------------------------------------------------------
function Timeline({ timeline, current, setCurrent }) {
  return (
    <>
      <header className="simpleHead">
        <div>
          <span className="eyebrow">EMOTION MAP</span>
          <h2>Story timeline</h2>
        </div>
        <Activity />
      </header>
      <div className="chart">
        {timeline.map((x, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={i === current ? 'selected' : ''}
            style={{
              height: `${Math.max(24, x.intensity || 50)}%`,
              background: colors[x.dominant_emotion] || '#8d7bff'
            }}
          >
            <span>{i + 1}</span>
          </button>
        ))}
      </div>
      <section className="timelineList">
        {timeline.map((x, i) => (
          <button
            key={i}
            className={i === current ? 'current' : ''}
            onClick={() => setCurrent(i)}
          >
            <span className="dot" style={{ background: colors[x.dominant_emotion] }}></span>
            <div>
              <b>Scene {i + 1} · {x.dominant_emotion}</b>
              <p>{x.scene_summary}</p>
            </div>
            <strong>{x.intensity}%</strong>
          </button>
        ))}
      </section>
    </>
  );
}

// -------------------------------------------------------------
// LIBRARY VIEW (Unchanged functionality)
// -------------------------------------------------------------
function LibraryView({ book, setBook, pickFile, loaded }) {
  return (
    <>
      <header className="simpleHead">
        <div>
          <span className="eyebrow">YOUR LIBRARY</span>
          <h2>Data sources</h2>
        </div>
        <Library />
      </header>
      <section className="sourceCard">
        <Brain />
        <div>
          <b>Backend timeline</b>
          <p>Load a timeline generated by your Python emotion pipeline.</p>
        </div>
        <label>
          <Upload size={18} /> Upload
          <input type="file" accept="application/json" onChange={pickFile} />
        </label>
      </section>
      <section className="books">
        {['HP', 'HP_prefix'].map(b => (
          <button
            key={b}
            className={book === b ? 'chosen' : ''}
            onClick={() => setBook(b)}
          >
            <div className="miniCover">{b === 'HP' ? 'HP' : 'PFX'}</div>
            <div>
              <b>{b === 'HP' ? 'Harry Potter' : 'Harry Potter Prefix'}</b>
              <span>{book === b && loaded ? 'Loaded' : 'Available backend cache'}</span>
            </div>
            <ChevronRight />
          </button>
        ))}
      </section>
      <p className="hint">
        <RefreshCw size={15} /> Place <code>timeline.json</code> in <code>public/data/BOOK_ID/</code> for automatic loading.
      </p>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
