import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BookOpen, Play, Pause, SkipBack, SkipForward, Upload, Music, Activity,
  Brain, ChevronRight, Home, Library, Settings, Volume2, VolumeX, RefreshCw,
  Type, Sliders, Info, Zap, Check, Sparkles, Clock, Compass, Eye, X, ChevronDown,
  Search, SlidersHorizontal, ArrowUpDown, LayoutGrid, Bookmark, MoreVertical,
  FileText, BookMarked, Layers, Columns2, Square
} from 'lucide-react';
import { audioEngine } from './audioEngine.js';
import { defaultChapter } from './defaultChapter.js';
import './style.css';

// Emotional Color Palette
const emotionColors = {
  Neutral: '#7b8498',
  Fear: '#ef6672',
  Interest: '#a678ff',
  Sadness: '#648cff',
  Joy: '#f6b94f',
  Anger: '#ff754b',
  Surprise: '#55c9b1',
  Disgust: '#9aaa5b'
};

const DEFAULT_BOOKS = [
  {
    id: 'HP',
    label: "Harry Potter and the Sorcerer's Stone",
    author: 'J.K. Rowling',
    category: 'books',
    scenes: 8,
    progress: 18,
    loc: 'Loc 142 of 1,240',
    coverClass: 'cover-hp',
    description: 'An orphaned boy enrolls in a school of wizardry, where he learns the truth about himself, his family and the terrible evil that haunts the magical world.'
  },
  {
    id: 'HP_prefix',
    label: 'Harry Potter (Prefix Edition)',
    author: 'J.K. Rowling',
    category: 'samples',
    scenes: 8,
    progress: 5,
    loc: 'Loc 38 of 840',
    coverClass: 'cover-prefix',
    description: 'Special demonstration cut showcasing prefix-based emotion analysis and dynamic ambient musical transitions.'
  },
  {
    id: 'PnP',
    label: 'Pride and Prejudice',
    author: 'Jane Austen',
    category: 'books',
    scenes: 12,
    progress: 34,
    loc: 'Loc 420 of 2,180',
    coverClass: 'cover-pnp',
    description: 'The romantic clash between the opinionated Elizabeth Bennet and her proud beau, Mr. Darcy, set in 19th-century England.'
  }
];

function App() {
  const [screen, setScreen] = useState('library'); // 'library' | 'reader' | 'timeline' | 'notes'
  const [sidebarTab, setSidebarTab] = useState('all'); // 'all' | 'books' | 'samples' | 'notes'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'title' | 'author'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  
  const [timeline, setTimeline] = useState(defaultChapter);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [book, setBook] = useState('HP');
  const [loaded, setLoaded] = useState(false);
  const [booksList, setBooksList] = useState(DEFAULT_BOOKS);
  const [audioMuted, setAudioMuted] = useState(false);
  const [globalVolume, setGlobalVolume] = useState(0.35);

  // Fetch backend books.json if available
  useEffect(() => {
    fetch('/data/books.json')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setBooksList(prev => {
            const merged = [...prev];
            data.forEach(item => {
              if (!merged.some(b => b.id === item.id)) {
                merged.push({
                  id: item.id,
                  label: item.label || item.id,
                  author: 'Classic Author',
                  category: 'books',
                  scenes: 8,
                  progress: 0,
                  loc: 'Loc 1 of 1,000',
                  coverClass: 'cover-default',
                  description: 'Dynamic ambient reading title with emotion-aware soundtrack.'
                });
              }
            });
            return merged;
          });
        }
      })
      .catch(() => { /* keep defaults */ });
  }, []);

  const activeItem = timeline[current] || timeline[0];
  const activeMood = emotionColors[activeItem?.dominant_emotion] || '#3AAFB9';

  // Stats calculation
  const stats = useMemo(() => ({
    avg: Math.round(timeline.reduce((a, x) => a + (x.intensity || 50), 0) / Math.max(timeline.length, 1)),
    changes: timeline.filter((x, i) => i && x.dominant_emotion !== timeline[i - 1].dominant_emotion).length
  }), [timeline]);

  // Load timeline data when active book changes
  useEffect(() => {
    fetch(`/data/${book}/timeline.json`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
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
        // Fallback to defaultChapter
        setTimeline(defaultChapter);
        setCurrent(0);
        setLoaded(false);
      });
  }, [book]);

  const currentBookObj = useMemo(() => {
    return booksList.find(b => b.id === book) || booksList[0];
  }, [booksList, book]);

  // Upload timeline JSON
  const handleUploadFile = (e) => {
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
        const newBookId = 'custom_' + Date.now();
        const customTitle = f.name.replace('.json', '');
        setBooksList(prev => [
          {
            id: newBookId,
            label: customTitle,
            author: 'Custom Upload',
            category: 'books',
            scenes: enriched.length,
            progress: 0,
            loc: `Loc 1 of ${enriched.length * 50}`,
            coverClass: 'cover-custom',
            description: `Imported timeline with ${enriched.length} scenes ready for ambient reading.`
          },
          ...prev
        ]);
        setBook(newBookId);
        setScreen('reader');
      } catch {
        alert('Please upload a valid timeline.json');
      }
    };
    r.readAsText(f);
  };

  // Filter books by search & category
  const filteredBooks = useMemo(() => {
    return booksList.filter(b => {
      const matchSearch = !searchQuery.trim() ||
        b.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.author.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchCategory =
        sidebarTab === 'all' ? true :
        sidebarTab === 'books' ? b.category === 'books' :
        sidebarTab === 'samples' ? b.category === 'samples' : true;

      return matchSearch && matchCategory;
    }).sort((a, b) => {
      if (sortBy === 'title') return a.label.localeCompare(b.label);
      if (sortBy === 'author') return a.author.localeCompare(b.author);
      return 0; // recent
    });
  }, [booksList, searchQuery, sidebarTab, sortBy]);

  const openBookInReader = (bookId) => {
    setBook(bookId);
    setScreen('reader');
  };

  return (
    <div className={`kindle-desktop-app ${screen === 'reader' ? 'kindle-reader-active' : ''}`} style={{ '--mood': activeMood }}>
      {/* ----------------- GLOBAL KINDLE DESKTOP TOP BAR ----------------- */}
      {screen !== 'reader' && (
        <header className="kindle-global-header">
          <div className="header-left">
            <div className="kindle-brand" onClick={() => setScreen('library')}>
              <span className="brand-kindle">MoodRead</span>
              <span className="brand-dot" />
              <span className="brand-edition">Cloud Reader</span>
            </div>
          </div>

          <div className="header-search-container">
            <div className="kindle-search-bar">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search MoodRead"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="search-clear-btn" onClick={() => setSearchQuery('')}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="header-right-actions">
            {/* Filter Dropdown */}
            <div className="header-btn-group">
              <button className="header-action-btn" title="Filter library">
                <SlidersHorizontal size={15} />
                <span>Filter</span>
                <ChevronDown size={13} />
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="header-btn-group">
              <button
                className="header-action-btn"
                onClick={() => setSortBy(prev => prev === 'recent' ? 'title' : prev === 'title' ? 'author' : 'recent')}
                title="Sort titles"
              >
                <ArrowUpDown size={15} />
                <span>Sort by: <b>{sortBy === 'recent' ? 'Recent' : sortBy === 'title' ? 'Title' : 'Author'}</b></span>
                <ChevronDown size={13} />
              </button>
            </div>

            {/* View Mode */}
            <div className="header-btn-group">
              <button
                className="header-action-btn"
                onClick={() => setViewMode(prev => prev === 'grid' ? 'list' : 'grid')}
                title="Toggle grid/list view"
              >
                <LayoutGrid size={15} />
                <span>View</span>
                <ChevronDown size={13} />
              </button>
            </div>

            <div className="header-divider" />

            {/* Ambient Audio Mini Master */}
            <div className="header-audio-pill">
              <button
                className={`audio-status-btn ${playing ? 'is-playing' : ''}`}
                onClick={() => setPlaying(!playing)}
                title={playing ? 'Soundtrack Active - Click to pause' : 'Play Ambient Soundtrack'}
              >
                {playing ? <Volume2 size={16} /> : <VolumeX size={16} />}
                <span className="audio-label">{playing ? 'Ambient LIVE' : 'Sound OFF'}</span>
              </button>
            </div>

            {/* More Menu */}
            <button className="header-icon-btn" title="More options">
              <MoreVertical size={18} />
            </button>
          </div>
        </header>
      )}

      {/* ----------------- DESKTOP LAYOUT WRAPPER ----------------- */}
      <div className="kindle-desktop-body">
        {/* LEFT SIDEBAR (Kindle Navigation) */}
        {screen !== 'reader' && (
          <aside className="kindle-desktop-sidebar">
            {/* Library Section */}
            <div className="sidebar-group">
              <div className="sidebar-group-title">
                <Library size={16} className="group-icon" />
                <span>Library</span>
                <ChevronDown size={14} className="group-chevron" />
              </div>
              <nav className="sidebar-nav">
                <button
                  className={`nav-pill ${sidebarTab === 'all' && screen === 'library' ? 'active' : ''}`}
                  onClick={() => { setSidebarTab('all'); setScreen('library'); }}
                >
                  <span>All Titles</span>
                  <span className="count-tag">{booksList.length}</span>
                </button>
                <button
                  className={`nav-pill ${sidebarTab === 'books' && screen === 'library' ? 'active' : ''}`}
                  onClick={() => { setSidebarTab('books'); setScreen('library'); }}
                >
                  <span>Books</span>
                  <span className="count-tag">{booksList.filter(b => b.category === 'books').length}</span>
                </button>
                <button
                  className={`nav-pill ${sidebarTab === 'samples' && screen === 'library' ? 'active' : ''}`}
                  onClick={() => { setSidebarTab('samples'); setScreen('library'); }}
                >
                  <span>Samples</span>
                  <span className="count-tag">{booksList.filter(b => b.category === 'samples').length}</span>
                </button>
              </nav>
            </div>

            {/* Features & Insights Section */}
            <div className="sidebar-group">
              <div className="sidebar-group-title">
                <Brain size={16} className="group-icon" />
                <span>Emotion Engine</span>
              </div>
              <nav className="sidebar-nav">
                <button
                  className={`nav-pill ${screen === 'timeline' ? 'active' : ''}`}
                  onClick={() => setScreen('timeline')}
                >
                  <Activity size={15} />
                  <span>Emotion Timeline</span>
                </button>
                <button
                  className={`nav-pill ${screen === 'notes' ? 'active' : ''}`}
                  onClick={() => setScreen('notes')}
                >
                  <BookMarked size={15} />
                  <span>Notes & Highlights</span>
                </button>
              </nav>
            </div>

            {/* Upload Custom JSON */}
            <div className="sidebar-group upload-section">
              <div className="sidebar-group-title">
                <Upload size={16} className="group-icon" />
                <span>Data Source</span>
              </div>
              <label className="sidebar-upload-btn" title="Upload a custom timeline.json file">
                <Upload size={15} />
                <span>Upload Timeline JSON</span>
                <input type="file" accept="application/json" onChange={handleUploadFile} />
              </label>
              <p className="upload-caption">Load custom pipeline output into MoodRead.</p>
            </div>

            {/* Now Reading Mini Card at Sidebar Bottom */}
            <div className="sidebar-reading-card">
              <div className="card-top-tag">NOW READING</div>
              <div className="card-book-row">
                <div className={`mini-cover ${currentBookObj.coverClass}`}>
                  <span>{currentBookObj.id === 'PnP' ? 'P&P' : 'HP'}</span>
                </div>
                <div className="mini-info">
                  <h4 title={currentBookObj.label}>{currentBookObj.label}</h4>
                  <p>{currentBookObj.author}</p>
                </div>
              </div>
              <div className="card-mood-pill" style={{ '--pill-color': activeMood }}>
                <span className="pill-dot" />
                <span>Scene {current + 1}: {activeItem?.dominant_emotion}</span>
              </div>
              <button className="sidebar-resume-btn" onClick={() => setScreen('reader')}>
                <BookOpen size={14} /> Continue Reading
              </button>
            </div>
          </aside>
        )}

        {/* MAIN VIEW AREA */}
        <main className={`kindle-desktop-content ${screen === 'reader' ? 'full-reader' : ''}`}>
          {screen === 'library' && (
            <div className="kindle-library-view">
              {/* Library Breadcrumb / Quick Banner */}
              <div className="library-top-bar">
                <div className="library-title-row">
                  <h2>
                    {sidebarTab === 'all' ? 'All Titles' : sidebarTab === 'books' ? 'Books' : 'Samples'}
                  </h2>
                  <span className="library-count-text">({filteredBooks.length} items)</span>
                </div>
                <div className="library-filters-row">
                  <span className="filter-badge active">All Formats</span>
                  <span className="filter-badge">Ambient Soundtrack Ready</span>
                  <span className="filter-badge">Downloaded</span>
                </div>
              </div>

              {/* Desktop Books Grid / List */}
              <div className={`kindle-books-container ${viewMode === 'list' ? 'list-layout' : 'grid-layout'}`}>
                {filteredBooks.map((b) => {
                  const isCurrent = b.id === book;
                  return (
                    <article
                      key={b.id}
                      className={`kindle-book-card ${isCurrent ? 'is-selected-book' : ''}`}
                      onClick={() => openBookInReader(b.id)}
                    >
                      {/* 3D Kindle Book Cover */}
                      <div className="book-cover-wrapper">
                        <div className={`kindle-cover-surface ${b.coverClass}`}>
                          <div className="cover-spine-shadow" />
                          <div className="cover-inner-content">
                            <span className="cover-genre-tag">MOODREAD EDITION</span>
                            <h3 className="cover-title-text">{b.label}</h3>
                            <div className="cover-ornament">✦ ✦ ✦</div>
                            <span className="cover-author-text">{b.author}</span>
                          </div>
                          <div className="cover-corner-emboss" />
                        </div>
                        {isCurrent && (
                          <div className="cover-now-reading-tag">
                            <span>CURRENT</span>
                          </div>
                        )}
                      </div>

                      {/* Book Details */}
                      <div className="book-card-meta">
                        <h4 className="book-title" title={b.label}>{b.label}</h4>
                        <p className="book-author">{b.author}</p>
                        
                        <div className="book-progress-wrapper">
                          <div className="book-progress-bar">
                            <div className="progress-fill" style={{ width: `${b.progress}%` }} />
                          </div>
                          <div className="book-loc-info">
                            <span>{b.progress}% read</span>
                            <span>{b.loc}</span>
                          </div>
                        </div>

                        <div className="book-feature-row">
                          <span className="feature-chip">
                            <Music size={12} /> Ambient Ready
                          </span>
                          <span className="feature-chip scenes-chip">
                            {b.scenes} Scenes
                          </span>
                        </div>

                        <div className="book-card-action">
                          <button
                            className="btn-open-reader"
                            onClick={(e) => {
                              e.stopPropagation();
                              openBookInReader(b.id);
                            }}
                          >
                            <BookOpen size={14} />
                            <span>Read Now</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {screen === 'timeline' && (
            <TimelineView
              timeline={timeline}
              current={current}
              setCurrent={setCurrent}
              stats={stats}
              colors={emotionColors}
              onReadScene={(idx) => {
                setCurrent(idx);
                setScreen('reader');
              }}
            />
          )}

          {screen === 'notes' && (
            <NotesView
              timeline={timeline}
              currentBook={currentBookObj}
              colors={emotionColors}
              onJumpToScene={(idx) => {
                setCurrent(idx);
                setScreen('reader');
              }}
            />
          )}

          {screen === 'reader' && (
            <KindleReader
              timeline={timeline}
              current={current}
              setCurrent={setCurrent}
              playing={playing}
              setPlaying={setPlaying}
              setScreen={setScreen}
              book={currentBookObj}
              audioMuted={audioMuted}
              setAudioMuted={setAudioMuted}
              volume={globalVolume}
              setVolume={setGlobalVolume}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// KINDLE DESKTOP READER COMPONENT (Full Desktop Reading Experience)
// -------------------------------------------------------------
function KindleReader({
  timeline,
  current,
  setCurrent,
  playing,
  setPlaying,
  setScreen,
  book,
  audioMuted,
  setAudioMuted,
  volume,
  setVolume
}) {
  // Guide alert state
  const [showGuideAlert, setShowGuideAlert] = useState(false);
  const [highlightBorders, setHighlightBorders] = useState(false);

  // Read Speed Toggle (WPM)
  const [readSpeed, setReadSpeed] = useState(260);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Kindle Aa Display Settings
  const [showAaMenu, setShowAaMenu] = useState(false);
  const [kindleTheme, setKindleTheme] = useState('paperwhite'); // paperwhite | sepia | dark | mint
  const [fontFamily, setFontFamily] = useState('literata'); // literata | lora | sans (Poppins)
  const [fontSize, setFontSize] = useState(19);
  const [lineHeight, setLineHeight] = useState(1.9);
  const [marginWidth, setMarginWidth] = useState('normal'); // compact | normal | wide
  const [columnLayout, setColumnLayout] = useState('single'); // single | two-column

  // Table of Contents Drawer / Dropdown
  const [showToc, setShowToc] = useState(false);

  // Viewport & Focus Zone Refs
  const viewportRef = useRef(null);
  const topBorderRef = useRef(null);
  const bottomBorderRef = useRef(null);

  // Focus tracking state
  const [upperChunkIndex, setUpperChunkIndex] = useState(current || 0);
  const [lowerChunkIndex, setLowerChunkIndex] = useState(current || 0);
  const [activeChunkIndex, setActiveChunkIndex] = useState(current || 0);

  // Traversal timing & transition state
  const [shiftProgress, setShiftProgress] = useState(0);
  const [remainingShiftSec, setRemainingShiftSec] = useState(0);
  const [wordsInTransition, setWordsInTransition] = useState(0);
  const [isShifting, setIsShifting] = useState(false);

  // Progress location stats
  const [locProgress, setLocProgress] = useState({ currentLoc: 1, totalLoc: 100, pct: 0, minsLeft: 5 });

  const activeItem = timeline[activeChunkIndex] || timeline[0];
  const upperItem = timeline[upperChunkIndex] || timeline[0];
  const lowerItem = timeline[lowerChunkIndex] || timeline[0];

  // Sync active chunk audio
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

  useEffect(() => {
    audioEngine.setVolume(audioMuted ? 0 : volume);
  }, [volume, audioMuted]);

  const triggerBorderHighlight = () => {
    setHighlightBorders(true);
    setTimeout(() => setHighlightBorders(false), 3000);
  };

  // Focus zone calculation between top and bottom borders
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

    // Reading progress
    const scrollHeight = vp.scrollHeight - vp.clientHeight;
    const scrollPos = vp.scrollTop;
    const pct = scrollHeight > 0 ? Math.min(100, Math.round((scrollPos / scrollHeight) * 100)) : 0;
    const totalWords = timeline.reduce((acc, c) => acc + (c.paragraphs?.reduce((a, p) => a + p.split(/\s+/).length, 0) || 50), 0);
    const wordsLeft = Math.max(0, Math.round(totalWords * (1 - pct / 100)));
    const minsLeft = Math.max(1, Math.ceil(wordsLeft / readSpeed));
    const totalLoc = Math.max(10, Math.round(totalWords / 25));
    const currentLoc = Math.min(totalLoc, Math.max(1, Math.round((pct / 100) * totalLoc)));

    setLocProgress({ currentLoc, totalLoc, pct, minsLeft });

    // Multi-chunk presence logic
    if (upperChunk !== lowerChunk) {
      setIsShifting(true);
      setWordsInTransition(upperWords);
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

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onScroll = () => checkFocusZone();
    vp.addEventListener('scroll', onScroll, { passive: true });
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

  // Traversal countdown timer
  useEffect(() => {
    if (!isShifting || remainingShiftSec <= 0) return;

    const interval = setInterval(() => {
      setRemainingShiftSec(sec => {
        if (sec <= 1) {
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

  const jumpToChunk = (idx) => {
    const target = viewportRef.current?.querySelector(`#chunk-marker-${idx}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setShowToc(false);
  };

  const speedPresets = [
    { label: 'Relaxed', wpm: 160, desc: 'Atmospheric immersion' },
    { label: 'Casual', wpm: 220, desc: 'Comfortable reading' },
    { label: 'Standard', wpm: 280, desc: 'Average pace' },
    { label: 'Brisk', wpm: 360, desc: 'Fast reading' },
    { label: 'Speed', wpm: 460, desc: 'Rapid scan & shift' }
  ];

  return (
    <div className={`kindle-reader-layout theme-${kindleTheme} font-${fontFamily} margin-${marginWidth} layout-${columnLayout}`}>
      {/* ----------------- TOP KINDLE CLOUD READER TOOLBAR ----------------- */}
      <header className="kindle-reader-top-bar">
        <div className="reader-top-left">
          <button className="reader-back-btn" onClick={() => setScreen('library')} title="Return to Library">
            ‹ <span className="back-text">Library</span>
          </button>
          
          <div className="reader-divider" />

          {/* Table of Contents Trigger */}
          <button
            className={`reader-icon-btn ${showToc ? 'active' : ''}`}
            onClick={() => setShowToc(!showToc)}
            title="Table of Contents & Scenes"
          >
            <Layers size={18} />
          </button>

          <div className="reader-book-identity">
            <span className="book-name-title">{book?.label || "Harry Potter"}</span>
            <span className="chapter-subtitle">Chapter 1 · The Boy Who Lived</span>
          </div>
        </div>

        <div className="reader-top-right">
          {/* Read Speed Toggle Button */}
          <button
            className={`reader-pill-btn ${showSpeedMenu ? 'active' : ''}`}
            onClick={() => {
              setShowSpeedMenu(!showSpeedMenu);
              setShowAaMenu(false);
              setShowToc(false);
            }}
            title="Adjust Read Speed & Traversal Rate"
          >
            <Zap size={15} />
            <span>{readSpeed} WPM</span>
          </button>

          {/* Kindle Aa Display Settings Button */}
          <button
            className={`reader-icon-btn ${showAaMenu ? 'active' : ''}`}
            onClick={() => {
              setShowAaMenu(!showAaMenu);
              setShowSpeedMenu(false);
              setShowToc(false);
            }}
            title="Display Settings (Font, Size, Themes)"
          >
            <Type size={18} />
          </button>

          {/* Audio Soundtrack Play / Mute */}
          <button
            className={`reader-icon-btn audio-btn ${playing ? 'is-playing' : ''}`}
            onClick={() => setPlaying(!playing)}
            title={playing ? 'Pause Soundtrack' : 'Play Soundtrack'}
          >
            {playing ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {/* Border Guide Trigger */}
          <button
            className="reader-icon-btn"
            onClick={() => {
              setShowGuideAlert(true);
              triggerBorderHighlight();
            }}
            title="How Ambient Audio Borders Work"
          >
            <Info size={17} />
          </button>
        </div>
      </header>

      {/* ----------------- TABLE OF CONTENTS POPUP ----------------- */}
      {showToc && (
        <div className="reader-popover-panel toc-panel">
          <div className="panel-header">
            <h4>Chapter Scenes ({timeline.length})</h4>
            <button className="panel-close" onClick={() => setShowToc(false)}><X size={16} /></button>
          </div>
          <div className="toc-list">
            {timeline.map((sc, i) => (
              <button
                key={i}
                className={`toc-item ${i === activeChunkIndex ? 'current-scene' : ''}`}
                onClick={() => jumpToChunk(i)}
              >
                <span className="toc-dot" style={{ background: emotionColors[sc.dominant_emotion] || '#3AAFB9' }} />
                <div className="toc-info">
                  <strong>Scene {i + 1} · {sc.dominant_emotion}</strong>
                  <p>{sc.scene_summary}</p>
                </div>
                <span className="toc-intensity">{sc.intensity}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ----------------- READ SPEED POPOVER ----------------- */}
      {showSpeedMenu && (
        <div className="reader-popover-panel speed-menu-panel">
          <div className="panel-header">
            <div>
              <h4>Reading Speed & Traversal</h4>
              <p>Governs how quickly audio transitions across visible paragraphs</p>
            </div>
            <button className="panel-close" onClick={() => setShowSpeedMenu(false)}><X size={16} /></button>
          </div>

          <div className="speed-slider-row">
            <div className="slider-label">
              <span>Current Speed</span>
              <strong>{readSpeed} WPM</strong>
            </div>
            <input
              type="range"
              min="120"
              max="500"
              step="10"
              value={readSpeed}
              onChange={(e) => setReadSpeed(parseInt(e.target.value, 10))}
              className="kindle-range-slider"
            />
            <div className="slider-ticks">
              <span>120 Slow</span>
              <span>280 Standard</span>
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

          <div className="speed-note">
            <Info size={14} />
            <span>
              Crossing from <b>Chunk {upperChunkIndex + 1}</b> to <b>Chunk {lowerChunkIndex + 1}</b> takes 
              <b> {Math.max(3, Math.round((Math.max(40, wordsInTransition) / readSpeed) * 60))}s</b> at your reading pace.
            </span>
          </div>
        </div>
      )}

      {/* ----------------- KINDLE Aa DISPLAY MENU ----------------- */}
      {showAaMenu && (
        <div className="reader-popover-panel aa-menu-panel">
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

          {/* Font Selection */}
          <div className="aa-section">
            <label>Font Family</label>
            <div className="font-options">
              {[
                { id: 'literata', label: 'Literata (Book Serif)' },
                { id: 'lora', label: 'Lora (Editorial)' },
                { id: 'sans', label: 'Poppins (Sans)' }
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

          {/* Font Size Stepper */}
          <div className="aa-section">
            <label>Font Size: {fontSize}px</label>
            <div className="stepper-row">
              <button
                className="step-btn"
                disabled={fontSize <= 14}
                onClick={() => setFontSize(s => Math.max(14, s - 1))}
              >
                A-
              </button>
              <div className="size-bar">
                {[14, 16, 18, 20, 22, 24, 26].map(s => (
                  <span
                    key={s}
                    className={`size-dot ${fontSize >= s ? 'filled' : ''}`}
                    onClick={() => setFontSize(s)}
                  />
                ))}
              </div>
              <button
                className="step-btn"
                disabled={fontSize >= 26}
                onClick={() => setFontSize(s => Math.min(26, s + 1))}
              >
                A+
              </button>
            </div>
          </div>

          {/* Desktop Margins & Layout */}
          <div className="aa-section">
            <label>Desktop Page Layout</label>
            <div className="font-options">
              <button
                className={`font-chip ${columnLayout === 'single' ? 'active' : ''}`}
                onClick={() => setColumnLayout('single')}
              >
                <Square size={13} /> Single Column
              </button>
              <button
                className={`font-chip ${columnLayout === 'two-column' ? 'active' : ''}`}
                onClick={() => setColumnLayout('two-column')}
              >
                <Columns2 size={13} /> Two Column Book
              </button>
            </div>
          </div>

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

      {/* ----------------- GUIDE ALERT MODAL ----------------- */}
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
            <h3>Read between the focus borders for real-time sound</h3>
            <p className="alert-desc">
              The ambient audio engine follows the paragraphs framed between the <b>Top Border</b> and <b>Bottom Border</b>.
            </p>
            <div className="alert-feature-box">
              <div className="feature-item">
                <Zap size={18} className="feat-icon" />
                <div>
                  <strong>Adaptive Traversal at {readSpeed} WPM</strong>
                  <p>When the screen spans two distinct emotional scenes, the soundtrack counts down and seamlessly crossfades matching your natural reading speed.</p>
                </div>
              </div>
            </div>
            <div className="alert-actions">
              <button className="btn-highlight-borders" onClick={triggerBorderHighlight}>
                <Eye size={16} /> Flash Borders
              </button>
              <button
                className="btn-start-reading"
                onClick={() => {
                  setShowGuideAlert(false);
                  triggerBorderHighlight();
                }}
              >
                <Check size={16} /> Got it, Resume
              </button>
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
        className="kindle-reader-viewport"
        ref={viewportRef}
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: lineHeight
        }}
      >
        <div className="kindle-book-sheet">
          {/* Chapter Title Header */}
          <div className="chapter-header-block">
            <span className="chapter-eyebrow">CHAPTER ONE</span>
            <h1 className="chapter-main-title">The Boy Who Lived</h1>
            <div className="chapter-separator">❖ ❖ ❖</div>
          </div>

          {/* Sequential Chapter Paragraphs Flow */}
          {timeline.map((chunk, cIdx) => (
            <section
              key={chunk.chunk_index ?? cIdx}
              id={`chunk-marker-${cIdx}`}
              className={`reader-chunk-section ${cIdx === activeChunkIndex ? 'chunk-active' : ''}`}
            >
              {/* Scene Transition Marker */}
              {cIdx > 0 && (
                <div className="reader-scene-divider">
                  <span className="divider-line" />
                  <div
                    className="scene-pill"
                    style={{ '--scene-color': emotionColors[chunk.dominant_emotion] || '#3AAFB9' }}
                    onClick={() => jumpToChunk(cIdx)}
                    title="Click to jump to this scene"
                  >
                    <span className="scene-dot" />
                    <span className="scene-label">
                      Scene {cIdx + 1} · {chunk.dominant_emotion} ({chunk.sub_emotion || 'Tone'})
                    </span>
                    <small className="scene-track">{chunk.track_id || 'ambient_hold'}</small>
                  </div>
                  <span className="divider-line" />
                </div>
              )}

              {/* Paragraphs of this Chunk */}
              {(chunk.paragraphs || [chunk.scene_summary || '']).map((para, pIdx) => (
                <p
                  key={pIdx}
                  data-chunk-idx={cIdx}
                  data-para-idx={pIdx}
                  className={`reader-paragraph ${cIdx === 0 && pIdx === 0 ? 'drop-cap-paragraph' : ''}`}
                >
                  {para}
                </p>
              ))}
            </section>
          ))}

          <div className="chapter-end-block">
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

      {/* ----------------- AUDIO TRAVERSAL STATUS HUD ----------------- */}
      <div className="reader-traversal-hud">
        {isShifting ? (
          <div className="hud-shifting-card">
            <div className="hud-shift-top">
              <Zap size={14} className="shift-icon" />
              <span>TRAVERSING SCENE {upperChunkIndex + 1} ➔ {lowerChunkIndex + 1}</span>
            </div>
            <div className="hud-shift-mid">
              <span>Shift in <b>{remainingShiftSec}s</b> at <b>{readSpeed} WPM</b></span>
              <span className="hud-target-text">
                Target: <em>{lowerItem.dominant_emotion}</em> ({lowerItem.track_id || 'crossfade'})
              </span>
            </div>
            <div className="hud-progress-track">
              <div
                className="hud-progress-fill"
                style={{
                  width: `${shiftProgress}%`,
                  background: emotionColors[lowerItem.dominant_emotion] || '#3AAFB9'
                }}
              />
            </div>
          </div>
        ) : (
          <div className="hud-steady-pill">
            <span
              className="hud-mood-dot"
              style={{ background: emotionColors[activeItem?.dominant_emotion] || '#3AAFB9' }}
            />
            <div className="hud-steady-info">
              <b>Scene {activeChunkIndex + 1}:</b> {activeItem?.dominant_emotion} ({activeItem?.sub_emotion || 'Hold'} · {activeItem?.intensity}%)
            </div>
            {playing && <span className="hud-live-tag">LIVE ♬</span>}
          </div>
        )}
      </div>

      {/* ----------------- KINDLE BOTTOM STATUS BAR ----------------- */}
      <footer className="kindle-reader-bottom-bar">
        <div className="bottom-status-left">
          <span className="status-loc">Loc {locProgress.currentLoc} of {locProgress.totalLoc}</span>
          <span className="status-dot">·</span>
          <span className="status-pct">{locProgress.pct}%</span>
          <span className="status-dot">·</span>
          <span className="status-mins">{locProgress.minsLeft} min left in chapter</span>
        </div>

        <div className="bottom-status-right">
          <div className="bottom-audio-bar">
            <button
              className="bottom-play-btn"
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
            className="bottom-speed-tag"
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
// TIMELINE VIEW (Desktop Emotion Analytics Dashboard)
// -------------------------------------------------------------
function TimelineView({ timeline, current, setCurrent, stats, colors, onReadScene }) {
  return (
    <div className="timeline-desktop-dashboard">
      <header className="desktop-view-header">
        <div>
          <span className="view-eyebrow">EMOTION SOUNDTRACK ANALYTICS</span>
          <h2>Story Emotion Landscape</h2>
          <p className="view-lead">Visual breakdown of emotional arcs, scene transitions, and generative ambient tracks.</p>
        </div>
      </header>

      {/* Metrics Row */}
      <div className="timeline-stats-grid">
        <div className="stat-card">
          <span className="stat-title">Average Intensity</span>
          <div className="stat-value-row">
            <strong>{stats.avg}%</strong>
            <span className="stat-badge">Dynamic</span>
          </div>
          <span className="stat-desc">Mean acoustic drive across all chapter chunks</span>
        </div>

        <div className="stat-card">
          <span className="stat-title">Mood Shifts</span>
          <div className="stat-value-row">
            <strong>{stats.changes}</strong>
            <span className="stat-badge">Crossfades</span>
          </div>
          <span className="stat-desc">Real-time musical transitions detected</span>
        </div>

        <div className="stat-card">
          <span className="stat-title">Total Scenes</span>
          <div className="stat-value-row">
            <strong>{timeline.length}</strong>
            <span className="stat-badge">Chapter 1</span>
          </div>
          <span className="stat-desc">Analyzed segments with assigned synth presets</span>
        </div>
      </div>

      {/* Full Width Bar Chart */}
      <div className="desktop-chart-card">
        <div className="chart-header">
          <h4>Emotional Arc & Intensity Profile</h4>
          <span className="chart-sub">Click any bar to preview scene & jump to reading</span>
        </div>
        <div className="desktop-bar-chart">
          {timeline.map((x, i) => (
            <div
              key={i}
              className={`chart-bar-col ${i === current ? 'is-selected' : ''}`}
              onClick={() => setCurrent(i)}
            >
              <div className="bar-tooltip">
                <strong>Scene {i + 1}: {x.dominant_emotion}</strong>
                <span>{x.intensity}% · {x.sub_emotion || 'Tone'}</span>
              </div>
              <div
                className="bar-fill"
                style={{
                  height: `${Math.max(20, x.intensity || 50)}%`,
                  background: colors[x.dominant_emotion] || '#3AAFB9'
                }}
              />
              <span className="bar-label">{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scene by Scene List */}
      <div className="scene-breakdown-card">
        <h4>Detailed Scene Sequence</h4>
        <div className="scene-rows-list">
          {timeline.map((x, i) => (
            <div
              key={i}
              className={`scene-row-item ${i === current ? 'is-active' : ''}`}
              onClick={() => setCurrent(i)}
            >
              <div className="scene-index-badge">{i + 1}</div>
              <span className="scene-color-strip" style={{ background: colors[x.dominant_emotion] || '#3AAFB9' }} />
              <div className="scene-details">
                <div className="scene-title-row">
                  <span className="scene-mood-name">{x.dominant_emotion}</span>
                  <span className="scene-sub-name">({x.sub_emotion || 'Ambient'})</span>
                  <span className="scene-track-tag">Track: {x.track_id || 'ambient_hold'}</span>
                </div>
                <p className="scene-summary-text">{x.scene_summary}</p>
              </div>
              <div className="scene-action-side">
                <span className="scene-intensity-val">{x.intensity}%</span>
                <button
                  className="scene-jump-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReadScene(i);
                  }}
                >
                  <BookOpen size={14} /> Read Scene
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// NOTES & HIGHLIGHTS VIEW (Kindle Notebook Experience)
// -------------------------------------------------------------
function NotesView({ timeline, currentBook, colors, onJumpToScene }) {
  const sampleHighlights = [
    {
      sceneIdx: 0,
      quote: "Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal, thank you very much.",
      note: "Iconic opening line establishing the mundane reality before magic intrudes.",
      loc: "Loc 14"
    },
    {
      sceneIdx: 1,
      quote: "\"Rejoice, for You-Know-Who has gone at last! Even Muggles like yourself should be celebrating, this happy, happy day!\"",
      note: "Sudden intrusion of jubilation in the midst of Mr. Dursley's mundane commute.",
      loc: "Loc 98"
    },
    {
      sceneIdx: 3,
      quote: "A man appeared on the corner the cat had been watching, appeared so suddenly and silently you'd have thought he'd just popped out of the ground.",
      note: "First arrival of Albus Dumbledore and use of the Put-Outer.",
      loc: "Loc 174"
    },
    {
      sceneIdx: 6,
      quote: "\"To Harry Potter -- the boy who lived!\"",
      note: "Celebration across the entire magical nation.",
      loc: "Loc 288"
    }
  ];

  return (
    <div className="notes-desktop-view">
      <header className="desktop-view-header">
        <div>
          <span className="view-eyebrow">MOODREAD NOTEBOOK</span>
          <h2>Notes & Highlights</h2>
          <p className="view-lead">Key passages saved from {currentBook.label} with mapped emotional context.</p>
        </div>
      </header>

      <div className="notes-list-grid">
        {sampleHighlights.map((h, i) => {
          const scene = timeline[h.sceneIdx] || timeline[0];
          const moodColor = colors[scene.dominant_emotion] || '#3AAFB9';
          return (
            <article key={i} className="kindle-note-card">
              <div className="note-card-header">
                <span className="note-loc-tag">{h.loc}</span>
                <span className="note-mood-chip" style={{ '--chip-color': moodColor }}>
                  Scene {h.sceneIdx + 1} · {scene.dominant_emotion}
                </span>
              </div>
              <blockquote className="note-quote">
                “{h.quote}”
              </blockquote>
              <p className="note-user-thought">
                <b>Annotation:</b> {h.note}
              </p>
              <div className="note-card-footer">
                <button className="note-jump-btn" onClick={() => onJumpToScene(h.sceneIdx)}>
                  <BookOpen size={14} /> Jump to Book
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
