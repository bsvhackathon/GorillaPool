import { useState, useEffect, type KeyboardEvent } from 'react';

// Available themes - keeping only dark themes and emerald
const themes = [
  'dark',
  'emerald',
  'corporate',
  'synthwave',
  'retro',
  'cyberpunk',
  'dracula',
  'night',
  'coffee',
  'dim',
  'nord',
  'sunset',
];

export const ThemeSelector = () => {
  const [theme, setTheme] = useState<string>(() => {
    // Initialize theme from localStorage or default to 'dark'
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') || 'dark';
    }
    return 'dark';
  });

  // Update theme in localStorage and document when it changes
  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, themeValue: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      setTheme(themeValue);
    }
  };

  return (
    <div className="dropdown dropdown-end">
      <button 
        type="button" 
        className="btn btn-ghost gap-1 normal-case"
        aria-label="Select theme"
      >
        <svg
          width="20"
          height="20"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          className="inline-block h-5 w-5 stroke-current md:h-6 md:w-6"
          aria-hidden="true"
        >
          <title>Theme icon</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
          />
        </svg>
        <span className="hidden md:inline">Theme</span>
        <svg
          width="12px"
          height="12px"
          className="ml-1 hidden h-3 w-3 fill-current opacity-60 sm:inline-block"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 2048 2048"
          aria-hidden="true"
        >
          <title>Dropdown arrow</title>
          <path d="M1799 349l242 241-1017 1017L7 590l242-241 775 775 775-775z" />
        </svg>
      </button>
      <div
        className="dropdown-content bg-base-200 text-base-content rounded-t-box rounded-b-box top-px max-h-96 h-[70vh] w-52 overflow-y-auto shadow-2xl mt-16"
      >
        <div className="grid grid-cols-1 gap-3 p-3">
          {themes.map((t) => (
            <button
              key={t}
              type="button"
              className={`overflow-hidden rounded-lg outline outline-2 outline-offset-2 outline-base-content text-left ${
                theme === t ? 'outline-offset-4' : 'opacity-50 outline-offset-2'
              }`}
              onClick={() => setTheme(t)}
              onKeyDown={(e) => handleKeyDown(e, t)}
              aria-label={`Theme ${t}`}
            >
              <div
                data-theme={t}
                className="bg-base-100 text-base-content w-full cursor-pointer font-sans"
              >
                <div className="grid grid-cols-5 grid-rows-3">
                  <div className="col-span-5 row-span-3 row-start-1 flex gap-1 py-3 px-4">
                    <div className="flex-grow text-sm font-bold capitalize">{t}</div>
                    <div className="flex flex-shrink-0 flex-wrap gap-1">
                      <div className="bg-primary w-2 rounded" />
                      <div className="bg-secondary w-2 rounded" />
                      <div className="bg-accent w-2 rounded" />
                      <div className="bg-neutral w-2 rounded" />
                    </div>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}; 