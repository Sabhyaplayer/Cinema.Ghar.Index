// --- START OF script.js (MODIFIED FOR GRID VIEW + ITEM DETAIL VIEW NAVIGATION + HUBCLEOUD & GDFLIX BYPASS + URL SPACE ENCODING + TMDB INTEGRATION - CORRECTED BYPASS/TMDB PERSISTENCE + ORIGINAL LINK VISIBILITY FIX + ID FETCH FIX v2 + GRID VIEW v1) ---
(function() {
    'use strict';

    // ===========================================================
    // JAVASCRIPT SECTION (Updated for TMDb Integration & Grid View)
    // ===========================================================
    const config = {
        HDR_LOGO_URL: "https://as1.ftcdn.net/v2/jpg/05/32/83/72/1000_F_532837228_v8CGZRU0jy39uCtqFRnJz6xDntrGuLLx.webp",
        FOURK_LOGO_URL: "https://i.pinimg.com/736x/85/c4/b0/85c4b0a2fb8612825d0cd2f53460925f.jpg",
        ITEMS_PER_PAGE: 50, // Adjust if grid shows more/less comfortably
        LOCAL_STORAGE_KEY: 'cinemaGharState_v16_grid', // Incremented version for Grid
        PLAYER_VOLUME_KEY: 'cinemaGharPlayerVolume',
        PLAYER_SPEED_KEY: 'cinemaGharPlayerSpeed',
        SEARCH_DEBOUNCE_DELAY: 300,
        SUGGESTIONS_DEBOUNCE_DELAY: 250,
        MAX_SUGGESTIONS: 50,
        UPDATES_PREVIEW_INITIAL_COUNT: 12, // Adjusted for grid
        UPDATES_PREVIEW_LOAD_MORE_COUNT: 12, // Adjusted for grid
        MOVIE_DATA_API_URL: '/api/movies',
        BYPASS_API_URL: 'https://hubcloud-bypass.onrender.com/api/hubcloud',
        GDFLIX_BYPASS_API_URL: 'https://gdflix-bypass.onrender.com/api/gdflix',
        BYPASS_TIMEOUT: 60000,
        TMDB_API_PROXY_URL: '/api/tmdb',
        TMDB_FETCH_TIMEOUT: 15000,
        POSTER_PLACEHOLDER_URL: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3' width='100' height='150'%3E%3Crect width='2' height='3' fill='%23e0e0e0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='0.2px' fill='%23757575'%3ENo Poster%3C/text%3E%3C/svg%3E" // Basic SVG placeholder
    };

    // --- DOM Element References ---
    const container = document.getElementById('cinemaghar-container');
    const pageLoader = document.getElementById('page-loader');
    const searchFocusArea = document.getElementById('search-focus-area');
    const resultsArea = document.getElementById('results-area');
    const itemDetailView = document.getElementById('item-detail-view');
    const itemDetailContent = document.getElementById('item-detail-content');
    const searchInput = document.getElementById('mainSearchInput');
    const suggestionsContainer = document.getElementById('searchInputSuggestions');
    const qualityFilterSelect = document.getElementById('mainQualityFilterSelect');
    const mainErrorArea = document.getElementById('main-error-area');
    const updatesPreviewSection = document.getElementById('updates-preview-section');
    const updatesPreviewList = document.getElementById('updates-preview-list'); // This will now be a grid container
    const showMoreUpdatesButton = document.getElementById('showMoreUpdatesButton');
    const videoContainer = document.getElementById('videoContainer');
    const videoElement = document.getElementById('html5VideoPlayer');
    const videoTitle = document.getElementById('videoTitle');
    const vlcBox = document.getElementById('vlcBox');
    const vlcText = document.getElementById('vlcText');
    const audioWarningDiv = document.getElementById('audioWarning');
    const muteButton = document.getElementById('muteButton');
    const volumeSlider = document.getElementById('volumeSlider');
    const playbackSpeedSelect = document.getElementById('playbackSpeedSelect');
    const customControlsContainer = document.getElementById('customControlsContainer');
    const audioTrackSelect = document.getElementById('audioTrackSelect');
    const tabNavigation = document.querySelector('.tab-navigation');
    // const tabContent = document.querySelector('.tab-content'); // Less used directly now

    // Tab-specific GRID CONTAINERS (Update HTML to have these divs)
    const allFilesGridContainer = document.getElementById('allFilesGridContainer');
    const moviesGridContainer = document.getElementById('moviesGridContainer');
    const seriesGridContainer = document.getElementById('seriesGridContainer');

    // Retain table heads if used for sorting UI above grids
    const allFilesTableHead = document.querySelector('#allFilesTable thead');
    const moviesTableHead = document.querySelector('#moviesTable thead');
    const seriesTableHead = document.querySelector('#seriesTable thead');

    const allFilesPaginationControls = document.getElementById('allFilesPaginationControls');
    const moviesPaginationControls = document.getElementById('moviesPaginationControls');
    const seriesPaginationControls = document.getElementById('seriesPaginationControls');
    const backToHomeButtonResults = document.getElementById('backToHomeButtonResults');
    const backToHomeButtonShared = document.getElementById('backToHomeButtonShared');
    const backToResultsButton = document.getElementById('backToResultsButton');
    const pageFooter = document.getElementById('page-footer');
    const playerCustomUrlSection = document.getElementById('playerCustomUrlSection');
    const playerCustomUrlInput = document.getElementById('playerCustomUrlInput');
    const playerPlayCustomUrlButton = document.getElementById('playerPlayCustomUrlButton');
    const playerCustomUrlFeedback = playerCustomUrlSection?.querySelector('.player-custom-url-feedback');
    const playCustomUrlGlobalButton = document.getElementById('playCustomUrlGlobalButton');

    // --- State Variables ---
    let localSuggestionData = []; // Holds all fetched data for suggestions, potentially with TMDb info
    let currentSearchResultsData = []; // Holds data for the *currently displayed* search results tab
    let weeklyUpdatesData = []; // Holds data specifically for the homepage preview
    let currentItemDetailData = null;
    let updatesPreviewShownCount = 0;
    let uniqueQualities = new Set();
    let copyFeedbackTimeout;
    let bypassFeedbackTimeout;
    let suggestionDebounceTimeout;
    let searchAbortController = null;
    let itemDetailAbortController = null;
    let isInitialLoad = true;
    let currentViewMode = 'homepage';
    let isShareMode = false;
    let activeResultsTab = 'allFiles';
    let lastFocusedElement = null;
    let isGlobalCustomUrlMode = false;

    let currentState = {
        searchTerm: '',
        qualityFilter: '',
        typeFilter: '',
        sortColumn: 'lastUpdated',
        sortDirection: 'desc',
        currentPage: 1,
        limit: config.ITEMS_PER_PAGE,
    };

    // Updated tabMappings for grid containers
    const tabMappings = {
        allFiles: { button: document.getElementById('allFilesTabButton'), panel: document.getElementById('allFilesTabPanel'), gridContainer: allFilesGridContainer, pagination: allFilesPaginationControls, typeFilter: '', tableHead: allFilesTableHead },
        movies: { button: document.getElementById('moviesTabButton'), panel: document.getElementById('moviesTabPanel'), gridContainer: moviesGridContainer, pagination: moviesPaginationControls, typeFilter: 'movies', tableHead: moviesTableHead },
        series: { button: document.getElementById('seriesTabButton'), panel: document.getElementById('seriesTabPanel'), gridContainer: seriesGridContainer, pagination: seriesPaginationControls, typeFilter: 'series', tableHead: seriesTableHead }
    };

    // --- Utility Functions (largely unchanged) ---
    const sanitize = (str) => { if (str === null || typeof str === 'undefined') return ""; const temp = document.createElement('div'); temp.textContent = String(str); return temp.innerHTML; };
    const TimeAgo = { MINUTE: 60, HOUR: 3600, DAY: 86400, WEEK: 604800, MONTH: 2592000, YEAR: 31536000, format: (isoString) => { if (!isoString) return 'N/A'; try { const date = new Date(isoString); const seconds = Math.floor((new Date() - date) / 1000); if (isNaN(seconds) || seconds < 0) { console.warn(`TimeAgo: Invalid seconds calculation for ${isoString}. Parsed date: ${date}. Returning full date.`); return TimeAgo.formatFullDate(date); } if (seconds < 2) return "just now"; if (seconds < TimeAgo.MINUTE) return `${seconds} sec${seconds > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.HOUR) return `${Math.floor(seconds / TimeAgo.MINUTE)} min${Math.floor(seconds / TimeAgo.MINUTE) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY) return `${Math.floor(seconds / TimeAgo.HOUR)} hr${Math.floor(seconds / TimeAgo.HOUR) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY * 2) return "Yesterday"; if (seconds < TimeAgo.WEEK) return `${Math.floor(seconds / TimeAgo.DAY)} days ago`; if (seconds < TimeAgo.MONTH) return `${Math.floor(seconds / TimeAgo.WEEK)} wk${Math.floor(seconds / TimeAgo.WEEK) > 1 ? 's' : ''} ago`; return TimeAgo.formatFullDate(date, true); } catch (e) { console.error("Date Format Error (TimeAgo):", isoString, e); return 'Invalid Date'; } }, formatFullDate: (date, short = false) => { if (!(date instanceof Date) || isNaN(date.getTime())) return 'Invalid Date'; const optsDate = short ? { year: '2-digit', month: 'numeric', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }; const optsTime = { hour: 'numeric', minute: '2-digit', hour12: true }; try { return `${date.toLocaleDateString(undefined, optsDate)}${short ? '' : ', ' + date.toLocaleTimeString(undefined, optsTime)}`; } catch (e) { console.error("toLocaleDateString/Time failed:", e); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; } } };
    function extractSizeData(inputString) { if (!inputString) return { value: 0, unit: '', display: 'N/A', bytes: 0 }; const r = /(?<size>[\d.]+)\s?(?<unit>GB|MB)/i; const m = String(inputString).match(r); if (m?.groups?.size && m?.groups?.unit) { const value = parseFloat(m.groups.size); const unit = m.groups.unit.toUpperCase(); if (!isNaN(value)) { const bytes = unit === 'GB' ? value * 1024 * 1024 * 1024 : value * 1024 * 1024; return { value: value, unit: unit, display: `${value} ${unit}`, bytes: isNaN(bytes) ? 0 : bytes }; } } return { value: 0, unit: '', display: 'N/A', bytes: 0 }; }
    function getMimeTypeFromUrl(url) { if (!url) return 'video/*'; const m = url.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/); if (!m) return 'video/*'; const ext = m[1].toLowerCase(); const mimeMap = { 'mkv': 'video/x-matroska', 'mp4': 'video/mp4', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo', 'webm': 'video/webm', 'wmv': 'video/x-ms-wmv', 'flv': 'video/x-flv', 'ts': 'video/mp2t', 'm4v': 'video/x-m4v', 'ogv': 'video/ogg' }; return mimeMap[ext] || 'video/*'; }
    function handleVideoError(event) { console.error("HTML5 Video Error:", event, videoElement?.error); let msg = "An unknown error occurred while trying to play the video."; if (videoElement?.error) { switch (videoElement.error.code) { case MediaError.MEDIA_ERR_ABORTED: msg = 'Playback was aborted.'; break; case MediaError.MEDIA_ERR_NETWORK: msg = 'A network error caused the video download to fail.'; break; case MediaError.MEDIA_ERR_DECODE: msg = 'Video decoding error (unsupported codec or corrupt file?).'; break; case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = 'Video format not supported or server/network failed.'; break; default: msg = `An unknown video error occurred (Code: ${videoElement.error.code}).`; break; } } if (audioWarningDiv) { audioWarningDiv.innerHTML = `<strong>Playback Error:</strong> ${sanitize(msg)} <br>Consider using 'Copy URL' with an external player (VLC/MX), 'Play in VLC or MX Player' (Android), or the 'Play Custom URL' option below.`; audioWarningDiv.style.display = 'block'; } if (!isGlobalCustomUrlMode && currentViewMode === 'itemDetail' && itemDetailContent) { const customUrlToggleButton = itemDetailContent.querySelector('.custom-url-toggle-button'); if (customUrlToggleButton) { customUrlToggleButton.style.display = 'inline-flex'; if (playerCustomUrlSection && playerCustomUrlSection.style.display === 'none') { toggleCustomUrlInput(customUrlToggleButton, true); } setTimeout(() => { customUrlToggleButton.focus(); }, 100); } } else if (isGlobalCustomUrlMode) { if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'flex'; if (videoElement) videoElement.style.display = 'none'; if (customControlsContainer) customControlsContainer.style.display = 'none'; } }
    function extractQualityFromFilename(filename) { if (!filename) return null; const safeFilename = String(filename); const patterns = [ /(?:^|\.|\[|\(|\s|_|-)((?:4k|2160p|1080p|720p|480p))(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(WEB-?DL|WEBRip|BluRay|BDRip|BRRip|HDTV|HDRip|DVDrip|DVDScr|HDCAM|HC|TC|TS|CAM)(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(HDR|DV|Dolby.?Vision|HEVC|x265)(?=$|\.|\]|\)|\s|_|-)/i ]; let foundQuality = null; for (const regex of patterns) { const match = safeFilename.match(regex); if (match && match[1]) { let quality = match[1].toUpperCase(); quality = quality.replace(/WEB-?DL/i, 'WEBDL'); quality = quality.replace(/BLURAY/i, 'BluRay'); quality = quality.replace(/DVDRIP/i, 'DVD'); quality = quality.replace(/DOLBY.?VISION/i, 'Dolby Vision'); if (quality === '2160P') quality = '4K'; if (patterns.indexOf(regex) < 2) return quality; if (patterns.indexOf(regex) === 2 && !foundQuality) foundQuality = quality; } } return foundQuality; }
    function normalizeTextForSearch(text) { if (!text) return ""; return String(text) .toLowerCase() .replace(/[.\-_\(\)\[\]]/g, '') .replace(/\s+/g, ' ') .trim(); }
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    async function copyToClipboard(text, feedbackSpan) { let success = false; if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) { try { await navigator.clipboard.writeText(text); success = true; } catch (err) { success = false; } } if (!success) { const textArea = document.createElement("textarea"); textArea.value = text; textArea.style.position = "fixed"; textArea.style.top = "-9999px"; textArea.style.left = "-9999px"; textArea.style.opacity = "0"; textArea.setAttribute("readonly", ""); document.body.appendChild(textArea); try { textArea.select(); textArea.setSelectionRange(0, textArea.value.length); success = document.execCommand('copy'); } catch (err) { success = false; } finally { document.body.removeChild(textArea); } } if (success) { if (feedbackSpan) showCopyFeedback(feedbackSpan, 'Copied!', false); } else { if (feedbackSpan) showCopyFeedback(feedbackSpan, 'Copy Failed!', true); else alert("Copy failed."); } return success; }

    // --- Data Preprocessing (largely unchanged, tmdbDetails initialized) ---
    function preprocessMovieData(movie) {
        const processed = { ...movie };
        processed.id = movie.original_id;
        processed.url = (movie.url && typeof movie.url === 'string' && movie.url.toLowerCase() !== 'null' && movie.url.trim() !== '') ? movie.url : null;
        if (processed.url) { processed.url = processed.url.replace(/ /g, '%20');}
        processed.hubcloud_link = (movie.hubcloud_link && typeof movie.hubcloud_link === 'string' && movie.hubcloud_link.toLowerCase() !== 'null' && movie.hubcloud_link.trim() !== '') ? movie.hubcloud_link : null;
        processed.gdflix_link = (movie.gdflix_link && typeof movie.gdflix_link === 'string' && movie.gdflix_link.toLowerCase() !== 'null' && movie.gdflix_link.trim() !== '') ? movie.gdflix_link : null;
        processed.displayFilename = sanitize(movie.filename || '');
        processed.sizeData = extractSizeData(movie.size_display);
        if (!processed.size_bytes && processed.sizeData.bytes > 0) { processed.size_bytes = processed.sizeData.bytes; }
        processed.displayQuality = sanitize(movie.quality || extractQualityFromFilename(movie.filename) || 'N/A');
        if (processed.displayQuality && processed.displayQuality !== 'N/A') { uniqueQualities.add(processed.displayQuality); }
        const tsString = movie.last_updated_ts;
        let dateObject = null;
        if (tsString) { try { dateObject = new Date(tsString); } catch(e) { console.warn("Date parse error:", e); } }
        processed.lastUpdatedTimestamp = (dateObject && !isNaN(dateObject)) ? dateObject.getTime() : 0;
        processed.numericId = typeof processed.id === 'number' ? processed.id : Infinity;
        processed.searchText = normalizeTextForSearch(`${processed.id || ''} ${processed.displayFilename}`);
        processed.isSeries = !!movie.is_series;
        processed.extractedTitle = null; processed.extractedYear = null; processed.extractedSeason = null;
        processed.tmdbDetails = movie.tmdbDetails || null; // Preserve if already fetched, otherwise null

        const filename = processed.displayFilename;
        if (filename) {
            let cleanedName = filename;
            const qualityTagsRegex = /(\b(4k|2160p|1080p|720p|480p|web-?dl|webrip|bluray|bdrip|brrip|hdtv|hdrip|dvdrip|dvdscr|hdcam|hc|tc|ts|cam|hdr|dv|dolby.?vision|hevc|x265)\b)/gi;
            cleanedName = cleanedName.replace(qualityTagsRegex, '');
            const seasonMatch = cleanedName.match(/[. (_-](S(\d{1,2}))(?:E\d{1,2}|[. (_-])/i) || cleanedName.match(/[. (_-](Season[. _]?(\d{1,2}))(?:[. (_]|$)/i);
            if (seasonMatch && (seasonMatch[2] || seasonMatch[3])) {
                processed.extractedSeason = parseInt(seasonMatch[2] || seasonMatch[3], 10);
                processed.isSeries = true;
                const titleEndIndex = seasonMatch.index;
                processed.extractedTitle = cleanedName.substring(0, titleEndIndex).replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
                const yearInTitleMatch = processed.extractedTitle.match(/[.(_[](\d{4})[.)_\]]/);
                if(yearInTitleMatch && yearInTitleMatch[1]) {
                     const potentialYear = parseInt(yearInTitleMatch[1], 10);
                     if (potentialYear > 1900 && potentialYear < 2050) {
                         processed.extractedYear = potentialYear;
                         processed.extractedTitle = processed.extractedTitle.replace(new RegExp(`[.(_[]${potentialYear}[.)_\]]$`), '').trim();
                     }
                }
            } else {
                processed.isSeries = false;
                const yearMatch = cleanedName.match(/[.(_[](\d{4})[.)_\]]/);
                if (yearMatch && yearMatch[1]) {
                    const year = parseInt(yearMatch[1], 10);
                    if (year > 1900 && year < 2050) {
                        processed.extractedYear = year;
                        const titleEndIndex = yearMatch.index;
                        processed.extractedTitle = cleanedName.substring(0, titleEndIndex).replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
                    }
                }
            }
            if (!processed.extractedTitle && cleanedName) {
                processed.extractedTitle = cleanedName.split(/[\.({\[]/)[0].replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
            }
            if (processed.extractedTitle) {
                processed.extractedTitle = processed.extractedTitle.replace(/[- ]+$/, '').trim();
                if (/^\d{4}$/.test(processed.extractedTitle)) { processed.extractedTitle = null; }
            }
        }
        return processed;
    }

    // --- HTML Generation (Item Detail - Unchanged) ---
    function createItemDetailContentHTML(movie, tmdbDetails) {
        const displayFilename = movie.displayFilename;
        const displaySize = movie.sizeData.display;
        const displayQuality = movie.displayQuality;
        const streamTitle = (displayFilename || '').split(/[\.\(\[]/)[0].replace(/[_ ]+/g, ' ').trim() + (displayQuality !== 'N/A' ? ` (${displayQuality})` : '');
        const timestampString = movie.last_updated_ts;
        const formattedDateRelative = TimeAgo.format(timestampString);
        const dateObject = timestampString ? new Date(timestampString) : null;
        const formattedDateFull = (dateObject && !isNaN(dateObject)) ? TimeAgo.formatFullDate(dateObject) : 'N/A';
        let hdrLogoHtml = ''; let fourkLogoHtml = '';
        const lowerFilename = (displayFilename || '').toLowerCase();
        if (displayQuality === '4K' || lowerFilename.includes('2160p') || lowerFilename.includes('.4k.')) { fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo fourk-logo" title="4K Ultra HD" />`; }
        if ((displayQuality || '').includes('HDR') || (displayQuality || '').includes('DOLBY VISION') || displayQuality === 'DV' || lowerFilename.includes('hdr') || lowerFilename.includes('dolby.vision') || lowerFilename.includes('.dv.')) { hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo hdr-logo" title="HDR / Dolby Vision Content" />`; }
        const escapedStreamTitle = streamTitle.replace(/'/g, "\\'");
        const escapedFilename = displayFilename.replace(/'/g, "\\'");
        const escapedUrl = movie.url ? movie.url.replace(/'/g, "\\'") : '';
        const escapedId = movie.id ? String(movie.id).replace(/[^a-zA-Z0-9-_]/g, '') : '';
        const escapedHubcloudUrl = movie.hubcloud_link ? movie.hubcloud_link.replace(/'/g, "\\'") : '';
        const escapedGdflixUrl = movie.gdflix_link ? movie.gdflix_link.replace(/'/g, "\\'") : '';

        let youtubeTrailerButtonHTML = '';
        let externalInfoButtonHTML = '';
        if (movie.extractedTitle) {
            let ytSearchTerms = [movie.extractedTitle];
            if (movie.isSeries && movie.extractedSeason) { ytSearchTerms.push(`Season ${movie.extractedSeason}`); }
            else if (!movie.isSeries && movie.extractedYear) { ytSearchTerms.push(String(movie.extractedYear)); }
            ytSearchTerms.push("Official Trailer");
            const includesHindi = (movie.languages || '').toLowerCase().includes('hindi');
            if (includesHindi) { ytSearchTerms.push("Hindi"); }
            const youtubeSearchQuery = encodeURIComponent(ytSearchTerms.join(' '));
            const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${youtubeSearchQuery}`;
            const youtubeIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M21.582,6.186c-0.23-0.86-0.908-1.538-1.768-1.768C18.267,4,12,4,12,4S5.733,4,4.186,4.418 c-0.86,0.23-1.538,0.908-1.768,1.768C2,7.734,2,12,2,12s0,4.266,0.418,5.814c0.23,0.86,0.908,1.538,1.768,1.768 C5.733,20,12,20,12,20s6.267,0,7.814-0.418c0.861-0.23,1.538-0.908,1.768-1.768C22,16.266,22,12,22,12S22,7.734,21.582,6.186z M10,15.464V8.536L16,12L10,15.464z"></path></svg>`;
            youtubeTrailerButtonHTML = `<a href="${youtubeSearchUrl}" target="_blank" rel="noopener noreferrer" class="button youtube-button">${youtubeIconSVG} Watch Trailer</a>`;
            const infoIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"></path></svg>`;
            if (tmdbDetails && tmdbDetails.tmdbLink) {
                 const tmdbLabel = movie.isSeries ? "View on TMDb (TV)" : "View on TMDb (Movie)";
                 externalInfoButtonHTML = `<a href="${sanitize(tmdbDetails.tmdbLink)}" target="_blank" rel="noopener noreferrer" class="button tmdb-link-button">${infoIconSVG} ${tmdbLabel}</a>`;
            } else {
                let imdbQueryTerms = [`"${movie.extractedTitle}"`];
                if (!movie.isSeries && movie.extractedYear) { imdbQueryTerms.push(String(movie.extractedYear)); }
                imdbQueryTerms.push("IMDb");
                const imdbSearchQuery = imdbQueryTerms.join(' ');
                const imdbSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(imdbSearchQuery)}&btnI=1`;
                externalInfoButtonHTML = `<a href="${imdbSearchUrl}" target="_blank" rel="noopener noreferrer" class="button imdb-button">${infoIconSVG} Find on IMDb</a>`;
            }
        }

        let tmdbSectionHTML = '';
        if (tmdbDetails && tmdbDetails.id) {
            const posterHTML = tmdbDetails.posterPath ? `<img src="${sanitize(tmdbDetails.posterPath)}" alt="Poster for ${sanitize(tmdbDetails.title)}" class="tmdb-poster" loading="lazy">` : '<div class="tmdb-poster-placeholder">No Poster</div>';
            const ratingHTML = tmdbDetails.voteAverage && tmdbDetails.voteCount ? `<span class="tmdb-rating" title="${tmdbDetails.voteCount} votes">⭐ ${sanitize(tmdbDetails.voteAverage)}/10</span>` : '';
            const genresHTML = tmdbDetails.genres && tmdbDetails.genres.length > 0 ? `<div class="tmdb-genres"><strong>Genres:</strong> ${tmdbDetails.genres.map(g => `<span class="genre-tag">${sanitize(g)}</span>`).join(' ')}</div>` : '';
            const overviewHTML = tmdbDetails.overview ? `<div class="tmdb-overview"><strong>Overview:</strong><p>${sanitize(tmdbDetails.overview)}</p></div>` : '';
            const releaseDateHTML = tmdbDetails.releaseDate ? `<div><strong>Released:</strong> ${sanitize(TimeAgo.formatFullDate(new Date(tmdbDetails.releaseDate), true))}</div>` : '';
            const runtimeHTML = tmdbDetails.runtime ? `<div><strong>Runtime:</strong> ${sanitize(tmdbDetails.runtime)} min</div>` : '';
            const taglineHTML = tmdbDetails.tagline ? `<div class="tmdb-tagline"><em>${sanitize(tmdbDetails.tagline)}</em></div>` : '';
            const actorsHTML = tmdbDetails.actors && tmdbDetails.actors.length > 0 ? `<div class="tmdb-actors"><strong>Starring:</strong><ul>${tmdbDetails.actors.map(actor => `<li>${sanitize(actor.name)} (${sanitize(actor.character)})</li>`).join('')}</ul></div>` : '';
            tmdbSectionHTML = `<div class="tmdb-details-container"><div class="tmdb-poster-column">${posterHTML}</div><div class="tmdb-info-column">${tmdbDetails.title ? `<h3 class="tmdb-title">${sanitize(tmdbDetails.title)}</h3>` : ''}${taglineHTML}<div class="tmdb-meta">${ratingHTML}${releaseDateHTML}${runtimeHTML}</div>${genresHTML}${overviewHTML}${actorsHTML}</div></div>`;
        } else if (movie.extractedTitle && !tmdbDetails) {
             tmdbSectionHTML = `<div class="tmdb-fetch-failed">Could not fetch additional details from TMDb.</div>`;
        }

        let urlDependentButtonsHTML = '';
        let bypassButtonsHTML = '';
        let otherLinkButtonsHTML = '';
        if (movie.url) {
            urlDependentButtonsHTML += `<button class="button play-button" data-action="play" data-title="${escapedStreamTitle}" data-url="${escapedUrl}" data-filename="${escapedFilename}"><span aria-hidden="true">▶️</span> Play here</button>`;
            urlDependentButtonsHTML += `<a class="button download-button" href="${movie.url}" download="${displayFilename}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">💾</span> Direct Download</a>`;
            urlDependentButtonsHTML += `<button class="button vlc-button" data-action="copy-vlc" data-url="${escapedUrl}"><span aria-hidden="true">📋</span> Copy URL (for VLC/MX)</button><span class="copy-feedback" role="status" aria-live="polite">Copied!</span>`;
            if (navigator.userAgent.toLowerCase().includes("android")) {
                urlDependentButtonsHTML += `<button class="button intent-button" data-action="open-intent" data-url="${escapedUrl}"><span aria-hidden="true">📱</span> Play in VLC or MX Player</button>`;
            }
        }
        const movieRefAttr = `data-movie-ref="detail"`;
        if (movie.hubcloud_link) { bypassButtonsHTML += `<button class="button hubcloud-bypass-button" data-action="bypass-hubcloud" data-hubcloud-url="${escapedHubcloudUrl}" ${movieRefAttr}><span aria-hidden="true" class="button-icon">☁️</span><span class="button-spinner spinner"></span><span class="button-text">Bypass HubCloud</span></button><span class="bypass-feedback" role="status" aria-live="polite"></span>`; }
        if (movie.gdflix_link) { bypassButtonsHTML += `<button class="button gdflix-bypass-button" data-action="bypass-gdflix" data-gdflix-url="${escapedGdflixUrl}" ${movieRefAttr}><span aria-hidden="true" class="button-icon">🎬</span><span class="button-spinner spinner"></span><span class="button-text">Bypass GDFLIX</span></button><span class="bypass-feedback" role="status" aria-live="polite"></span>`; }
        otherLinkButtonsHTML += youtubeTrailerButtonHTML;
        otherLinkButtonsHTML += externalInfoButtonHTML;
        otherLinkButtonsHTML += `<button class="button custom-url-toggle-button" data-action="toggle-custom-url" aria-expanded="false" style="display: none;"><span aria-hidden="true">🔗</span> Play Custom URL</button>`;
        if (movie.telegram_link) { otherLinkButtonsHTML += `<a class="button telegram-button" href="${sanitize(movie.telegram_link)}" target="_blank" rel="noopener noreferrer">Telegram File</a>`; }
        if (movie.gdflix_link) { otherLinkButtonsHTML += `<a class="button gdflix-button" href="${sanitize(movie.gdflix_link)}" target="_blank" rel="noopener noreferrer">GDFLIX Link</a>`; }
        if (movie.hubcloud_link) { otherLinkButtonsHTML += `<a class="button hubcloud-button" href="${sanitize(movie.hubcloud_link)}" target="_blank" rel="noopener noreferrer">HubCloud Link</a>`; }
        if (movie.filepress_link) otherLinkButtonsHTML += `<a class="button filepress-button" href="${sanitize(movie.filepress_link)}" target="_blank" rel="noopener noreferrer">Filepress</a>`;
        if (movie.gdtot_link) otherLinkButtonsHTML += `<a class="button gdtot-button" href="${sanitize(movie.gdtot_link)}" target="_blank" rel="noopener noreferrer">GDToT</a>`;
        if (movie.id) { otherLinkButtonsHTML += `<button class="button share-button" data-action="share" data-id="${escapedId}" data-title="${escapedStreamTitle}" data-filename="${escapedFilename}"><span aria-hidden="true">🔗</span> Share Post</button><span class="copy-feedback share-fallback" role="status" aria-live="polite">Link copied!</span>`; }

        const internalInfoHTML = `<div class="action-info" data-stream-title="${escapedStreamTitle}"><span class="info-item"><strong>Filename:</strong> ${displayFilename}</span><span class="info-item"><strong>Quality:</strong> ${displayQuality} ${fourkLogoHtml}${hdrLogoHtml}</span><span class="info-item"><strong>Size:</strong> ${displaySize}</span><span class="info-item"><strong>Language:</strong> ${sanitize(movie.languages || 'N/A')}</span><span class="info-item"><strong>Updated:</strong> ${formattedDateFull} (${formattedDateRelative})</span>${movie.originalFilename ? `<span class="info-item"><strong>Original Name:</strong> ${sanitize(movie.originalFilename)}</span>` : ''}</div>`;
        const buttonsHTML = `<div class="action-buttons-container">${urlDependentButtonsHTML}${bypassButtonsHTML}${otherLinkButtonsHTML}</div>`;
        return `${tmdbSectionHTML}<hr class="detail-separator">${internalInfoHTML}${buttonsHTML}`;
    }


    // --- NEW: Grid Item HTML Generation ---
    function createMovieGridItemHTML(movie) {
        const card = document.createElement('div');
        card.className = 'grid-item';
        card.dataset.itemId = sanitize(movie.id);
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0'); // Make it focusable
        card.setAttribute('aria-label', `View details for ${movie.displayFilename}`);

        const posterUrl = movie.tmdbDetails?.posterPath || config.POSTER_PLACEHOLDER_URL;
        const title = movie.extractedTitle || movie.displayFilename.split(/[\.\(\[]/)[0].replace(/[_ ]+/g, ' ').trim();
        const year = movie.extractedYear || '';

        let fourkLogoHtml = '';
        let hdrLogoHtml = '';
        const lowerFilename = (movie.displayFilename || '').toLowerCase();
        if (movie.displayQuality === '4K' || lowerFilename.includes('2160p') || lowerFilename.includes('.4k.')) { fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-badge fourk-badge" title="4K Ultra HD" />`; }
        if ((movie.displayQuality || '').includes('HDR') || (movie.displayQuality || '').includes('DOLBY VISION') || movie.displayQuality === 'DV' || lowerFilename.includes('hdr') || lowerFilename.includes('dolby.vision') || lowerFilename.includes('.dv.')) { hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-badge hdr-badge" title="HDR / Dolby Vision Content" />`; }


        card.innerHTML = `
            <div class="poster-container">
                <img src="${config.POSTER_PLACEHOLDER_URL}" data-src="${posterUrl}" alt="Poster for ${sanitize(title)}" class="poster-image lazyload-poster" loading="lazy" onerror="this.onerror=null; this.src='${config.POSTER_PLACEHOLDER_URL}'; this.classList.add('load-error');">
                <div class="poster-spinner spinner" style="display: ${posterUrl === config.POSTER_PLACEHOLDER_URL && !movie.tmdbDetails ? 'block' : 'none'};"></div>
                 <div class="quality-badges-overlay">${fourkLogoHtml}${hdrLogoHtml}</div>
            </div>
            <div class="item-info">
                <h3 class="item-title" title="${sanitize(movie.displayFilename)}">${sanitize(title)}</h3>
                ${year ? `<p class="item-year">${year}</p>` : ''}
            </div>
        `;

        // If poster isn't immediately available (and not already fetched/failed), try to fetch it
        // This is a simplified fetch on render; IntersectionObserver is better for many items.
        if (!movie.tmdbDetails?.posterPathFetched && !movie.tmdbDetails?.posterPathFetchFailed && movie.extractedTitle) {
            fetchPosterForItem(movie, card.querySelector('.poster-image'), card.querySelector('.poster-spinner'));
        } else if (movie.tmdbDetails?.posterPath) {
            // If already fetched (e.g. from previous detail view or cached), set it directly
            const img = card.querySelector('.poster-image');
            if(img) img.src = movie.tmdbDetails.posterPath;
            const spinner = card.querySelector('.poster-spinner');
            if(spinner) spinner.style.display = 'none';
        }

        return card;
    }

    async function fetchPosterForItem(movie, imgElement, spinnerElement) {
        if (!movie || !movie.extractedTitle || !imgElement || movie.tmdbDetails?.posterPathFetched || movie.tmdbDetails?.posterPathFetchFailed) {
            if(spinnerElement) spinnerElement.style.display = 'none';
            return;
        }
        if(spinnerElement) spinnerElement.style.display = 'block';

        try {
            const tmdbQuery = new URLSearchParams();
            tmdbQuery.set('query', movie.extractedTitle);
            tmdbQuery.set('type', movie.isSeries ? 'tv' : 'movie');
            if (!movie.isSeries && movie.extractedYear) {
                tmdbQuery.set('year', movie.extractedYear);
            }
            const tmdbUrl = `${config.TMDB_API_PROXY_URL}?${tmdbQuery.toString()}`;
            const tmdbController = new AbortController();
            const tmdbTimeoutId = setTimeout(() => tmdbController.abort(), config.TMDB_FETCH_TIMEOUT);

            const tmdbResponse = await fetch(tmdbUrl, { signal: tmdbController.signal });
            clearTimeout(tmdbTimeoutId);

            if (tmdbResponse.ok) {
                const fetchedTmdbData = await tmdbResponse.json();
                if (fetchedTmdbData && fetchedTmdbData.posterPath) {
                    imgElement.src = fetchedTmdbData.posterPath;
                    imgElement.classList.remove('load-error');
                    if (!movie.tmdbDetails) movie.tmdbDetails = {};
                    movie.tmdbDetails.posterPath = fetchedTmdbData.posterPath;
                    // Store other relevant minimal details if needed for the card
                    movie.tmdbDetails.title = fetchedTmdbData.title; // TMDb title for consistency
                } else {
                    imgElement.classList.add('load-error'); // Mark as error if no poster in valid response
                }
                if (!movie.tmdbDetails) movie.tmdbDetails = {}; // Ensure tmdbDetails object exists
                movie.tmdbDetails.posterPathFetched = true; // Mark as attempted
            } else {
                console.warn(`Failed to fetch TMDb poster for "${movie.extractedTitle}" (${tmdbResponse.status})`);
                imgElement.classList.add('load-error');
                if (!movie.tmdbDetails) movie.tmdbDetails = {};
                movie.tmdbDetails.posterPathFetchFailed = true;
            }
        } catch (tmdbError) {
            if (tmdbError.name !== 'AbortError') {
                console.error("Error fetching TMDb poster for grid:", tmdbError);
            }
            imgElement.classList.add('load-error');
            if (!movie.tmdbDetails) movie.tmdbDetails = {};
            movie.tmdbDetails.posterPathFetchFailed = true;
        } finally {
            if(spinnerElement) spinnerElement.style.display = 'none';
        }
    }


    // --- View Control (largely unchanged) ---
    function setViewMode(mode) {
        console.log(`Setting view mode to: ${mode}`);
        const previousMode = currentViewMode;
        currentViewMode = mode;
        if (mode !== previousMode) { closePlayerIfNeeded(null); }
        container.classList.toggle('results-active', mode === 'search');
        container.classList.toggle('item-detail-active', mode === 'itemDetail');
        const showHomepage = mode === 'homepage';
        const showSearch = mode === 'search';
        const showItemDetail = mode === 'itemDetail';
        if (searchFocusArea) searchFocusArea.style.display = (showHomepage || showSearch) ? 'flex' : 'none';
        if (resultsArea) resultsArea.style.display = showSearch ? 'block' : 'none';
        if (itemDetailView) itemDetailView.style.display = showItemDetail ? 'block' : 'none';
        if (updatesPreviewSection) updatesPreviewSection.style.display = showHomepage ? 'block' : 'none';
        if (pageFooter) pageFooter.style.display = (showHomepage || showSearch) ? 'flex' : 'none';

        if (showHomepage) {
            if (searchInput) searchInput.value = '';
            currentState.searchTerm = '';
            if (suggestionsContainer) suggestionsContainer.style.display = 'none';
            activeResultsTab = 'allFiles'; currentState.currentPage = 1; currentState.typeFilter = '';
            if (weeklyUpdatesData.length > 0) { displayInitialUpdates(); }
            else if (localSuggestionData.length > 0) {
                 if (updatesPreviewList) updatesPreviewList.innerHTML = '<div class="status-message grid-status-message">No recent updates found.</div>'; // Grid specific class
                 if (showMoreUpdatesButton) showMoreUpdatesButton.style.display = 'none';
            } else {
                if (updatesPreviewList) updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`;
            }
            document.title = "Cinema Ghar Index";
        } else if (showItemDetail) {
            if (searchFocusArea) searchFocusArea.style.display = 'none';
            if (resultsArea) resultsArea.style.display = 'none';
            if (updatesPreviewSection) updatesPreviewSection.style.display = 'none';
            if (pageFooter) pageFooter.style.display = 'none';
        }
        if (!isInitialLoad) { saveStateToLocalStorage(); }
    }
    window.resetToHomepage = function(event) {
        if (window.history.pushState) { const cleanUrl = window.location.origin + window.location.pathname; if (window.location.search !== '') { window.history.pushState({ path: cleanUrl }, '', cleanUrl); } }
        currentItemDetailData = null; isShareMode = false;
        if (itemDetailAbortController) { itemDetailAbortController.abort(); itemDetailAbortController = null; }
        lastFocusedElement = event?.target;
        setViewMode('homepage');
        if (searchInput) { setTimeout(() => searchInput.focus(), 100); }
    }
    window.goBackToResults = function() {
        currentItemDetailData = null; isShareMode = false;
         if (itemDetailAbortController) { itemDetailAbortController.abort(); itemDetailAbortController = null; }
        history.back();
    }
    window.addEventListener('popstate', (event) => { handleUrlChange(true); });
    function handleUrlChange(isPopState = false) {
        if (itemDetailAbortController) { itemDetailAbortController.abort(); itemDetailAbortController = null; }
        const urlParams = new URLSearchParams(window.location.search);
        const shareId = urlParams.get('shareId');
        const viewId = urlParams.get('viewId');
        if (shareId) {
            if (currentViewMode !== 'itemDetail' || !currentItemDetailData || currentItemDetailData.id !== shareId) {
                 displayItemDetail(shareId, true);
            } else {
                 setViewMode('itemDetail');
                 if (backToHomeButtonShared) backToHomeButtonShared.style.display = 'inline-flex';
                 if (backToResultsButton) backToResultsButton.style.display = 'none';
            }
        } else if (viewId) {
            if (currentViewMode !== 'itemDetail' || !currentItemDetailData || currentItemDetailData.id !== viewId) {
                displayItemDetail(viewId, false);
            } else {
                 setViewMode('itemDetail');
                 if (backToHomeButtonShared) backToHomeButtonShared.style.display = 'none';
                 if (backToResultsButton) backToResultsButton.style.display = 'inline-flex';
            }
        } else {
            if (currentViewMode === 'itemDetail') { currentItemDetailData = null; isShareMode = false; }
            if (currentViewMode === 'itemDetail' || (isInitialLoad && currentViewMode !== 'search')) {
                 setViewMode('homepage');
            } else {
                 if (isInitialLoad && currentViewMode === 'search') { setViewMode('search'); }
            }
        }
    }

    // --- Search and Suggestions Logic (largely unchanged) ---
    function handleSearchInput() { clearTimeout(suggestionDebounceTimeout); const searchTerm = searchInput.value.trim(); if (searchTerm.length < 2) { suggestionsContainer.style.display = 'none'; return; } suggestionDebounceTimeout = setTimeout(() => { fetchAndDisplaySuggestions(searchTerm); }, config.SUGGESTIONS_DEBOUNCE_DELAY); }
    function fetchAndDisplaySuggestions(term) { const normalizedTerm = normalizeTextForSearch(term); if (!normalizedTerm) { suggestionsContainer.style.display = 'none'; return; } const matchingItems = localSuggestionData.filter(movie => movie.searchText.includes(normalizedTerm)).slice(0, config.MAX_SUGGESTIONS); suggestionsContainer.innerHTML = ''; if (matchingItems.length > 0) { const fragment = document.createDocumentFragment(); matchingItems.forEach(item => { const div = document.createElement('div'); let displayText = item.displayFilename; let highlighted = false; if (term.length > 0) { try { const safeTerm = escapeRegExp(term); const regex = new RegExp(`(${safeTerm})`, 'i'); if ((item.displayFilename || '').match(regex)) { div.innerHTML = (item.displayFilename || '').replace(regex, '<strong>$1</strong>'); highlighted = true; } } catch (e) { console.warn("Regex error for highlight:", e); } } if (!highlighted) { div.textContent = item.displayFilename; } div.title = item.displayFilename; div.onclick = () => selectSuggestion(item.displayFilename); fragment.appendChild(div); }); suggestionsContainer.appendChild(fragment); suggestionsContainer.style.display = 'block'; } else { suggestionsContainer.style.display = 'none'; } }
    function selectSuggestion(selectedValue) { searchInput.value = selectedValue; suggestionsContainer.style.display = 'none'; handleSearchSubmit(); }
    window.handleSearchSubmit = function() { if (suggestionsContainer) { suggestionsContainer.style.display = 'none'; } const searchTerm = searchInput.value.trim(); if (searchInput) { searchInput.blur(); } if (searchTerm.length === 0 && currentViewMode !== 'homepage') { resetToHomepage(); return; } if (searchTerm.length === 0 && currentViewMode === 'homepage') { return; }
        if (currentViewMode === 'itemDetail') {
            if (itemDetailAbortController) { itemDetailAbortController.abort(); itemDetailAbortController = null; }
            currentItemDetailData = null; isShareMode = false;
            const cleanUrl = window.location.origin + window.location.pathname; if (window.location.search !== '') { history.pushState({ path: cleanUrl }, '', cleanUrl); }
        }
        setViewMode('search'); activeResultsTab = 'allFiles'; currentState.currentPage = 1; currentState.searchTerm = searchTerm; currentState.qualityFilter = qualityFilterSelect.value || ''; currentState.typeFilter = '';
        updateActiveTabAndPanel();
        showLoadingStateInGrids(`Searching for "${sanitize(searchTerm)}"...`); // Updated
        fetchAndRenderResults();
    }
    function handleSearchClear() { clearTimeout(suggestionDebounceTimeout); suggestionsContainer.style.display = 'none'; setTimeout(() => { if (searchInput.value.trim() === '') { if (currentViewMode === 'search') { resetToHomepage(); } else { currentState.searchTerm = ''; saveStateToLocalStorage(); } } }, 100); }
    // --- NEW: showLoadingStateInGrids ---
    function showLoadingStateInGrids(message = 'Loading...') {
        const loadingHTML = `<div class="loading-message grid-status-message"><div class="spinner"></div>${sanitize(message)}</div>`; // grid-status-message for full width
        Object.values(tabMappings).forEach(mapping => {
            if (mapping?.gridContainer) { // Target gridContainer
                mapping.gridContainer.innerHTML = loadingHTML;
            }
            if (mapping?.pagination) {
                mapping.pagination.style.display = 'none';
            }
        });
    }

    // --- Updates Preview Logic (Adapted for Grid) ---
    async function loadUpdatesPreview() { if (currentViewMode !== 'homepage' || !updatesPreviewList || !showMoreUpdatesButton) return; updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`; showMoreUpdatesButton.style.display = 'none'; updatesPreviewShownCount = 0; weeklyUpdatesData = []; try { const params = { sort: 'lastUpdated', sortDir: 'desc', limit: config.UPDATES_PREVIEW_INITIAL_COUNT, page: 1 }; const data = await fetchApiData(params); if (data && data.items && data.items.length > 0) { weeklyUpdatesData = data.items.map(preprocessMovieData); displayInitialUpdates(); } else { updatesPreviewList.innerHTML = '<div class="status-message grid-status-message">No recent updates found.</div>'; showMoreUpdatesButton.style.display = 'none'; } } catch (error) { if (error.name !== 'AbortError') { updatesPreviewList.innerHTML = `<div class="error-message grid-status-message">Could not load updates. ${error.message}</div>`; } showMoreUpdatesButton.style.display = 'none'; } }
    function displayInitialUpdates() { if (!updatesPreviewList || !showMoreUpdatesButton) return; updatesPreviewList.innerHTML = ''; updatesPreviewShownCount = 0; if (weeklyUpdatesData.length === 0) { updatesPreviewList.innerHTML = '<div class="status-message grid-status-message">No recent updates found.</div>'; showMoreUpdatesButton.style.display = 'none'; return; } const initialCount = Math.min(weeklyUpdatesData.length, config.UPDATES_PREVIEW_INITIAL_COUNT); appendUpdatesToPreview(0, initialCount); updatesPreviewShownCount = initialCount; const potentiallyMore = weeklyUpdatesData.length >= config.UPDATES_PREVIEW_INITIAL_COUNT; if (potentiallyMore) { showMoreUpdatesButton.style.display = 'block'; showMoreUpdatesButton.disabled = false; showMoreUpdatesButton.textContent = "Show More"; } else { showMoreUpdatesButton.style.display = 'none'; } }
    window.appendMoreUpdates = async function() { if (!updatesPreviewList || !showMoreUpdatesButton) return; showMoreUpdatesButton.disabled = true; showMoreUpdatesButton.textContent = "Loading..."; const currentPage = Math.floor(updatesPreviewShownCount / config.UPDATES_PREVIEW_LOAD_MORE_COUNT); const nextPage = currentPage + 1; try { const params = { sort: 'lastUpdated', sortDir: 'desc', limit: config.UPDATES_PREVIEW_LOAD_MORE_COUNT, page: nextPage }; const data = await fetchApiData(params); if (data && data.items && data.items.length > 0) { const newItems = data.items.map(preprocessMovieData); const startIndex = weeklyUpdatesData.length; weeklyUpdatesData.push(...newItems); appendUpdatesToPreview(startIndex, weeklyUpdatesData.length); updatesPreviewShownCount += newItems.length; if (data.page >= data.totalPages || newItems.length < config.UPDATES_PREVIEW_LOAD_MORE_COUNT) { showMoreUpdatesButton.textContent = "All Updates Shown"; showMoreUpdatesButton.disabled = true; } else { showMoreUpdatesButton.disabled = false; showMoreUpdatesButton.textContent = "Show More"; } } else { showMoreUpdatesButton.textContent = "No More Updates"; showMoreUpdatesButton.disabled = true; } } catch (error) { if (error.name !== 'AbortError') { showMoreUpdatesButton.textContent = "Error Loading"; showMoreUpdatesButton.disabled = false; } else { showMoreUpdatesButton.disabled = false; showMoreUpdatesButton.textContent = "Show More"; } } }
    // --- UPDATED: appendUpdatesToPreview for Grid ---
    function appendUpdatesToPreview(startIndex, endIndex) {
        if (!updatesPreviewList) return;
        const fragment = document.createDocumentFragment();
        const itemsToAppend = weeklyUpdatesData.slice(startIndex, endIndex);

        itemsToAppend.forEach((movie) => {
            if (!movie || !movie.id) return;
            const gridItemElement = createMovieGridItemHTML(movie); // Use new grid item function
            fragment.appendChild(gridItemElement);
        });

        const initialLoader = updatesPreviewList.querySelector('.loading-inline-spinner');
        if (initialLoader && startIndex === 0) { initialLoader.remove(); }
        updatesPreviewList.appendChild(fragment);
    }

    // --- Filtering, Sorting (Sorting UI assumes thead might still exist above grids) ---
    function triggerFilterChange() { if (!qualityFilterSelect || currentViewMode !== 'search') return; const newQualityFilter = qualityFilterSelect.value; if (newQualityFilter !== currentState.qualityFilter) { currentState.qualityFilter = newQualityFilter; currentState.currentPage = 1; closePlayerIfNeeded(null); showLoadingStateInGrids(`Applying filter: ${sanitize(newQualityFilter || 'All Qualities')}...`); fetchAndRenderResults(); } }
    function handleSort(event) { const header = event.target.closest('th.sortable'); if (!header || currentViewMode !== 'search') return; const sortKey = header.dataset.sortKey; if (!sortKey) return; const oldSortColumn = currentState.sortColumn; const oldSortDirection = currentState.sortDirection; if (currentState.sortColumn === sortKey) { currentState.sortDirection = currentState.sortDirection === 'asc' ? 'desc' : 'asc'; } else { currentState.sortColumn = sortKey; currentState.sortDirection = ['filename', 'quality'].includes(sortKey) ? 'asc' : 'desc'; } if (oldSortColumn !== currentState.sortColumn || oldSortDirection !== currentState.sortDirection) { currentState.currentPage = 1; closePlayerIfNeeded(null); showLoadingStateInGrids(`Sorting by ${sanitize(sortKey)} (${currentState.sortDirection})...`); fetchAndRenderResults(); } }

    // --- Rendering Logic (Adapted for Grid) ---
    function renderActiveResultsView(apiResponse) {
         if (currentViewMode !== 'search' || !tabMappings[activeResultsTab]) {
             if (currentViewMode === 'search') { showLoadingStateInGrids('Enter search term above.'); }
             return;
         }
         const { gridContainer, pagination, tableHead } = tabMappings[activeResultsTab]; // Use gridContainer
         if (!gridContainer || !pagination) { console.error("Missing grid container or pagination for tab:", activeResultsTab); return; }

         const itemsToRender = apiResponse.items || [];
         const totalItems = apiResponse.totalItems || 0;
         const currentPage = apiResponse.page || 1;
         const totalPages = apiResponse.totalPages || 1;

         currentSearchResultsData = itemsToRender.map(preprocessMovieData); // Store preprocessed data

         gridContainer.innerHTML = ''; // Clear previous grid items
         const fragment = document.createDocumentFragment();

         if (totalItems === 0) {
             let message = `No ${tabMappings[activeResultsTab].typeFilter || 'files'} found`;
             if (currentState.searchTerm) message += ` matching "${sanitize(currentState.searchTerm)}"`;
             if (currentState.qualityFilter) message += ` with quality "${sanitize(currentState.qualityFilter)}"`;
             message += '.';
             gridContainer.innerHTML = `<div class="status-message grid-status-message">${message}</div>`;
         } else {
             currentSearchResultsData.forEach((movie) => {
                 const gridItemElement = createMovieGridItemHTML(movie);
                 fragment.appendChild(gridItemElement);
             });
             gridContainer.appendChild(fragment);
         }
         renderPaginationControls(pagination, totalItems, currentPage, totalPages);
         updateActiveTabAndPanel();
         if (tableHead) updateSortIndicators(tableHead); // If thead is kept for sorting UI
         updateFilterIndicator();
     }
    function renderPaginationControls(targetContainer, totalItems, currentPage, totalPages) { if (!targetContainer) return; if (totalItems === 0 || totalPages <= 1) { targetContainer.innerHTML = ''; targetContainer.style.display = 'none'; return; } targetContainer.dataset.totalPages = totalPages; targetContainer.innerHTML = ''; let paginationHTML = ''; const maxPagesToShow = 5; const halfPages = Math.floor(maxPagesToShow / 2); paginationHTML += `<button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled title="First page"' : 'title="Previous page"'}>« Prev</button>`; let startPage, endPage; if (totalPages <= maxPagesToShow + 2) { startPage = 1; endPage = totalPages; } else { startPage = Math.max(2, currentPage - halfPages); endPage = Math.min(totalPages - 1, currentPage + halfPages); if (currentPage - halfPages < 2) { endPage = Math.min(totalPages - 1, maxPagesToShow); } if (currentPage + halfPages > totalPages - 1) { startPage = Math.max(2, totalPages - maxPagesToShow + 1); } } if (startPage > 1) { paginationHTML += `<button onclick="changePage(1)" title="Page 1">1</button>`; if (startPage > 2) { paginationHTML += `<span class="page-info" title="Skipped pages">...</span>`; } } for (let i = startPage; i <= endPage; i++) { paginationHTML += (i === currentPage) ? `<span class="current-page">${i}</span>` : `<button onclick="changePage(${i})" title="Page ${i}">${i}</button>`; } if (endPage < totalPages) { if (endPage < totalPages - 1) { paginationHTML += `<span class="page-info" title="Skipped pages">...</span>`; } paginationHTML += `<button onclick="changePage(${totalPages})" title="Page ${totalPages}">${totalPages}</button>`; } paginationHTML += `<button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled title="Last page"' : 'title="Next page"'}>Next »</button>`; targetContainer.innerHTML = paginationHTML; targetContainer.style.display = 'block'; }
    function updateSortIndicators(tableHeadElement) { if (!tableHeadElement) return; tableHeadElement.querySelectorAll('th.sortable').forEach(th => { th.classList.remove('sort-asc', 'sort-desc'); const sortKey = th.dataset.sortKey; if (sortKey === currentState.sortColumn) { const directionClass = currentState.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc'; th.classList.add(directionClass); th.setAttribute('aria-sort', currentState.sortDirection === 'asc' ? 'ascending' : 'descending'); } else { th.removeAttribute('aria-sort'); } }); }
    function updateFilterIndicator() { if(qualityFilterSelect) { qualityFilterSelect.classList.toggle('filter-active', !!currentState.qualityFilter); } }
    function updateActiveTabAndPanel() { Object.keys(tabMappings).forEach(tabId => { const mapping = tabMappings[tabId]; const isActive = tabId === activeResultsTab; if (mapping?.button) mapping.button.classList.toggle('active', isActive); if (mapping?.panel) mapping.panel.classList.toggle('active', isActive); }); }


    // --- Pagination and Tab Switching (Scroll target needs adjustment for grid) ---
    window.changePage = function(newPage) { if (currentViewMode !== 'search' || newPage < 1 || newPage === currentState.currentPage) { return; } const currentPagination = tabMappings[activeResultsTab]?.pagination; if(currentPagination && currentPagination.dataset.totalPages) { const totalP = parseInt(currentPagination.dataset.totalPages, 10); if(newPage > totalP) { return; } } currentState.currentPage = newPage; closePlayerIfNeeded(null); fetchAndRenderResults().then(() => { const activeGridContainer = tabMappings[activeResultsTab]?.gridContainer; scrollToTopOfActiveGrid(activeGridContainer); }); saveStateToLocalStorage(); }
    // --- UPDATED: scrollToTopOfActiveGrid ---
    function scrollToTopOfActiveGrid(gridContainerElement) {
        if (!gridContainerElement) return;
        // const parentPanel = gridContainerElement.closest('.active'); // Assuming panel is active
        let stickyHeaderHeight = 0;
        if (container.classList.contains('results-active')) {
            const searchBarArea = container.querySelector('#search-focus-area');
            const backButtonElem = resultsArea.querySelector('#backToHomeButtonResults');
            const filterArea = resultsArea.querySelector('.results-filter-area');
            const tabNavElem = resultsArea.querySelector('.tab-navigation'); // Renamed variable
            stickyHeaderHeight = (searchBarArea?.offsetHeight || 0) +
                                 (backButtonElem?.offsetHeight || 0) +
                                 (backButtonElem ? parseFloat(getComputedStyle(backButtonElem).marginBottom) : 0) +
                                 (filterArea?.offsetHeight || 0) +
                                 (tabNavElem?.offsetHeight || 0);
        }
        const elementTop = gridContainerElement.getBoundingClientRect().top + window.pageYOffset;
        const scrollPosition = elementTop - stickyHeaderHeight - 20; // 20px buffer
        window.scrollTo({ top: scrollPosition, behavior: 'smooth' });
    }
    window.switchTab = function(tabId) { if (currentViewMode !== 'search' || tabId === activeResultsTab || !tabMappings[tabId]) { return; } activeResultsTab = tabId; currentState.currentPage = 1; currentState.typeFilter = tabMappings[tabId].typeFilter; closePlayerIfNeeded(null); updateActiveTabAndPanel(); showLoadingStateInGrids(`Loading ${tabMappings[tabId].typeFilter || 'all files'}...`); fetchAndRenderResults(); saveStateToLocalStorage(); }

    // --- Navigation to Item Detail View (Unchanged in logic, triggered by grid item) ---
    function navigateToItemView(itemId) { if (!itemId) return; lastFocusedElement = document.activeElement; if (itemDetailAbortController) { itemDetailAbortController.abort(); itemDetailAbortController = null; } const newUrl = `${window.location.origin}${window.location.pathname}?viewId=${encodeURIComponent(itemId)}`; const currentParams = new URLSearchParams(window.location.search); const isSameView = currentParams.get('viewId') === String(itemId) && !currentParams.has('shareId'); if (!isSameView) { try { history.pushState({ viewId: itemId }, '', newUrl); } catch (e) { console.error("History pushState failed:", e); } } displayItemDetail(itemId, false); }

    // --- Share Logic (Unchanged) ---
    async function handleShareClick(buttonElement) { const itemId = buttonElement.dataset.id; const itemTitle = buttonElement.dataset.title || "Cinema Ghar Item"; const itemFilename = buttonElement.dataset.filename || ""; if (!itemId) { alert("Cannot share: Item ID missing."); return; } const shareUrl = `${window.location.origin}${window.location.pathname}?shareId=${encodeURIComponent(itemId)}`; const shareText = `Check out: ${itemTitle}\n${itemFilename ? `(${itemFilename})\n` : ''}`; const feedbackSpan = buttonElement.nextElementSibling; if (navigator.share) { try { await navigator.share({ title: itemTitle, text: shareText, url: shareUrl, }); } catch (error) { if (error.name !== 'AbortError') { if (feedbackSpan) showCopyFeedback(feedbackSpan, 'Share failed!', true); else alert(`Share failed: ${error.message}`); } } } else { await copyToClipboard(shareUrl, feedbackSpan); } }

    // --- Item Detail Display Logic (Unchanged) ---
    async function displayItemDetail(itemId, isFromShareLink) { if (!itemId || !itemDetailView || !itemDetailContent) return; if (itemDetailAbortController) { itemDetailAbortController.abort(); itemDetailAbortController = null; } itemDetailAbortController = new AbortController(); const signal = itemDetailAbortController.signal; isShareMode = isFromShareLink; setViewMode('itemDetail'); itemDetailContent.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading item details (ID: ${sanitize(itemId)})...</span></div>`; currentItemDetailData = null; if (backToHomeButtonShared) backToHomeButtonShared.style.display = isShareMode ? 'inline-flex' : 'none'; if (backToResultsButton) backToResultsButton.style.display = isShareMode ? 'none' : 'inline-flex'; try { const params = { id: itemId }; const internalData = await fetchApiData(params, signal); if (signal.aborted) return; if (internalData && internalData.items && internalData.items.length > 0) { const itemRaw = internalData.items[0]; currentItemDetailData = preprocessMovieData(itemRaw); document.title = `${currentItemDetailData.displayFilename || 'Item Detail'} - Cinema Ghar`; let tmdbFetchAttempted = false; if (currentItemDetailData.extractedTitle) { tmdbFetchAttempted = true; const tmdbQuery = new URLSearchParams(); tmdbQuery.set('query', currentItemDetailData.extractedTitle); tmdbQuery.set('type', currentItemDetailData.isSeries ? 'tv' : 'movie'); if (!currentItemDetailData.isSeries && currentItemDetailData.extractedYear) { tmdbQuery.set('year', currentItemDetailData.extractedYear); } const tmdbUrl = `${config.TMDB_API_PROXY_URL}?${tmdbQuery.toString()}`; const tmdbController = new AbortController(); const tmdbTimeoutId = setTimeout(() => tmdbController.abort(), config.TMDB_FETCH_TIMEOUT); try { const tmdbResponse = await fetch(tmdbUrl, { signal: tmdbController.signal }); clearTimeout(tmdbTimeoutId); if (tmdbResponse.ok) { currentItemDetailData.tmdbDetails = await tmdbResponse.json(); } else { currentItemDetailData.tmdbDetails = null; } } catch (tmdbError) { clearTimeout(tmdbTimeoutId); currentItemDetailData.tmdbDetails = null; if (tmdbError.name === 'AbortError') console.warn(`TMDb fetch timed out/aborted for: ${currentItemDetailData.extractedTitle}`); else console.error("Error fetching TMDb details:", tmdbError); } } else { currentItemDetailData.tmdbDetails = null; } if (signal.aborted) return; const contentHTML = createItemDetailContentHTML(currentItemDetailData, currentItemDetailData.tmdbDetails); itemDetailContent.innerHTML = contentHTML; if (videoContainer) videoContainer.style.display = 'none'; } else { itemDetailContent.innerHTML = `<div class="error-message" role="alert">Error: Item with ID <strong>${sanitize(itemId)}</strong> was not found.</div>`; document.title = "Item Not Found - Cinema Ghar"; currentItemDetailData = null; } } catch (error) { if (signal.aborted || error.name === 'AbortError') { console.log(`Item detail fetch aborted for ID: ${itemId} (caught).`); } else { itemDetailContent.innerHTML = `<div class="error-message" role="alert">Error loading item details for ID <strong>${sanitize(itemId)}</strong>: ${sanitize(error.message)}.</div>`; document.title = "Error Loading Item - Cinema Ghar"; currentItemDetailData = null; } } finally { if (itemDetailAbortController && itemDetailAbortController.signal === signal && !signal.aborted) { itemDetailAbortController = null; } if (itemDetailContent.innerHTML && !itemDetailContent.querySelector('.loading-inline-spinner')) { window.scrollTo({ top: 0, behavior: 'smooth' }); } if (pageLoader && pageLoader.style.display !== 'none') { pageLoader.style.display = 'none'; } } }
    function updateItemDetailAfterBypass(encodedFinalUrl) { if (!currentItemDetailData || !itemDetailContent) return; currentItemDetailData.url = encodedFinalUrl; const contentHTML = createItemDetailContentHTML(currentItemDetailData, currentItemDetailData.tmdbDetails); itemDetailContent.innerHTML = contentHTML; const playButton = itemDetailContent.querySelector('.play-button'); if(playButton) { setTimeout(() => playButton.focus(), 50); } if (videoContainer.parentElement && videoContainer.style.display !== 'none') { const separator = itemDetailContent.querySelector('hr.detail-separator'); const targetElement = separator ? separator.nextElementSibling : itemDetailContent.firstChild; if (targetElement && targetElement.nextSibling) { itemDetailContent.insertBefore(videoContainer, targetElement.nextSibling); } else { itemDetailContent.appendChild(videoContainer); } } }

    // --- Player Logic (largely unchanged) ---
    function streamVideo(title, url, filenameForAudioCheck, isFromCustom = false) { let currentActionContainer = null; if (isGlobalCustomUrlMode) {} else if (currentViewMode === 'itemDetail' && itemDetailContent) { currentActionContainer = itemDetailContent; } else { if (itemDetailContent) { currentActionContainer = itemDetailContent; } else { return; } } if (!videoContainer || !videoElement) return; if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none'; if (videoElement) videoElement.style.display = 'block'; if (customControlsContainer) customControlsContainer.style.display = 'flex'; if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; } if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; } clearCopyFeedback(); if (!isGlobalCustomUrlMode && currentActionContainer && videoContainer.parentElement !== currentActionContainer) { const separator = currentActionContainer.querySelector('hr.detail-separator'); const targetElement = separator ? separator.nextElementSibling : currentActionContainer.firstChild; if (videoContainer.parentElement) { videoContainer.parentElement.removeChild(videoContainer); } if (targetElement && targetElement.nextSibling) { currentActionContainer.insertBefore(videoContainer, targetElement.nextSibling); } else { currentActionContainer.appendChild(videoContainer); } if (videoElement.hasAttribute('src')) { videoElement.pause(); videoElement.removeAttribute('src'); videoElement.currentTime = 0; videoElement.load(); } if (vlcBox) vlcBox.style.display = 'none'; } const savedVolume = localStorage.getItem(config.PLAYER_VOLUME_KEY); const savedSpeed = localStorage.getItem(config.PLAYER_SPEED_KEY); videoElement.volume = (savedVolume !== null) ? Math.max(0, Math.min(1, parseFloat(savedVolume))) : 1; if (volumeSlider) volumeSlider.value = videoElement.volume; videoElement.muted = (videoElement.volume === 0); videoElement.playbackRate = (savedSpeed !== null) ? parseFloat(savedSpeed) : 1; if(playbackSpeedSelect) playbackSpeedSelect.value = String(videoElement.playbackRate); updateMuteButton(); videoElement.currentTime = 0; const ddp51Regex = /\bDDP?([ ._-]?5\.1)?\b/i; const advancedAudioRegex = /\b(DTS|ATMOS|TrueHD)\b/i; const multiAudioHintRegex = /\b(Multi|Dual)[ ._-]?Audio\b/i; let warningText = ""; if (filenameForAudioCheck && !isFromCustom) { const lowerFilename = (filenameForAudioCheck || '').toLowerCase(); if (ddp51Regex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DDP audio might not work. Use external player."; } else if (advancedAudioRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DTS/Atmos/TrueHD audio likely unsupported. Use external player."; } else if (multiAudioHintRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> May contain multiple audio tracks. Use selector below or external player."; } } if (warningText && audioWarningDiv) { audioWarningDiv.innerHTML = warningText; audioWarningDiv.style.display = 'block'; } if (videoTitle) videoTitle.innerText = title || "Video"; if (vlcText) vlcText.innerText = url; if (vlcBox) vlcBox.style.display = 'block'; videoElement.src = url; videoElement.load(); videoElement.play().catch(e => {}); if (videoContainer.style.display === 'none') { videoContainer.style.display = 'flex'; } if (!isGlobalCustomUrlMode) { const closeButton = videoContainer.querySelector('.close-btn'); if (closeButton) { setTimeout(() => closeButton.focus(), 100); } setTimeout(() => { videoContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150); } }
    window.closePlayer = function(elementToFocusAfter = null) { if (elementToFocusAfter instanceof Event) { elementToFocusAfter = elementToFocusAfter?.target; } if (!videoContainer || !videoElement) return; const parentContainer = videoContainer.parentElement; const wasGlobalMode = isGlobalCustomUrlMode; try { const fsElement = document.fullscreenElement || document.webkitFullscreenElement; if (fsElement && (fsElement === videoElement || fsElement === videoContainer)) { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } } catch(err) {} videoElement.pause(); videoElement.removeAttribute('src'); videoElement.currentTime = 0; videoElement.load(); videoContainer.style.display = 'none'; videoContainer.classList.remove('global-custom-url-mode', 'is-fullscreen'); isGlobalCustomUrlMode = false; if (vlcBox) vlcBox.style.display = 'none'; if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; } if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; } if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none'; if (playerCustomUrlInput) playerCustomUrlInput.value = ''; if (playerCustomUrlFeedback) playerCustomUrlFeedback.textContent = ''; clearCopyFeedback(); clearBypassFeedback(); if (videoTitle) videoTitle.innerText = ''; if (parentContainer && parentContainer.contains(videoContainer)) { parentContainer.removeChild(videoContainer); } if (wasGlobalMode) { resetToHomepage(); lastFocusedElement = null; return; } let finalFocusTarget = elementToFocusAfter || lastFocusedElement; if (!wasGlobalMode && currentViewMode === 'itemDetail' && itemDetailContent) { const playButton = itemDetailContent.querySelector('.play-button'); if (playButton) { finalFocusTarget = playButton; } else { const firstButton = itemDetailContent.querySelector('.button'); if (firstButton) finalFocusTarget = firstButton; else finalFocusTarget = itemDetailContent; } } if (finalFocusTarget && typeof finalFocusTarget.focus === 'function') { setTimeout(() => { try { finalFocusTarget.focus(); } catch(e) {} }, 50); } lastFocusedElement = null; }
    function closePlayerIfNeeded(elementToFocusAfter = null) { if (videoContainer?.style.display !== 'none') { closePlayer(elementToFocusAfter); } }
    window.seekVideo = function(seconds) { if (videoElement) videoElement.currentTime += seconds; }
    window.toggleMute = function() { if (videoElement) videoElement.muted = !videoElement.muted; }
    window.setVolume = function(value) { if (videoElement) { const vol = parseFloat(value); videoElement.volume = vol; videoElement.muted = (vol === 0); } }
    window.setPlaybackSpeed = function(value) { if (videoElement) videoElement.playbackRate = parseFloat(value); }
    window.toggleFullscreen = function() { const elementToMakeFullscreen = videoContainer; if (!elementToMakeFullscreen) return; const fsElement = document.fullscreenElement || document.webkitFullscreenElement; try { if (!fsElement) { if (elementToMakeFullscreen.requestFullscreen) elementToMakeFullscreen.requestFullscreen(); else if (elementToMakeFullscreen.webkitRequestFullscreen) elementToMakeFullscreen.webkitRequestFullscreen(); } else { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } } catch (err) { alert("Fullscreen mode failed."); } }
    window.changeAudioTrack = function(selectElement) { if (!videoElement || !videoElement.audioTracks) return; const selectedTrackValue = selectElement.value; const tracks = videoElement.audioTracks; for (let i = 0; i < tracks.length; i++) { const track = tracks[i]; const isSelectedTrack = (track.id && track.id === selectedTrackValue) || String(i) === selectedTrackValue; if (track.enabled !== isSelectedTrack) { try { track.enabled = isSelectedTrack; } catch (e) {} } } }
    function togglePlayPause() { if (videoElement) { if (videoElement.paused || videoElement.ended) videoElement.play().catch(e => {}); else videoElement.pause(); } }
    function updateMuteButton() { if (!videoElement || !muteButton) return; const isMuted = videoElement.muted || videoElement.volume === 0; muteButton.textContent = isMuted ? "Unmute" : "Mute"; muteButton.setAttribute('aria-pressed', String(isMuted)); if (volumeSlider) { volumeSlider.style.opacity = isMuted ? '0.5' : '1'; volumeSlider.disabled = isMuted; if (!isMuted && videoElement.volume === 0) { const defaultUnmuteVolume = 0.5; videoElement.volume = defaultUnmuteVolume; volumeSlider.value = defaultUnmuteVolume; } } }
    function handleFullscreenChange() { const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement); if (!videoContainer) return; videoContainer.classList.toggle('is-fullscreen', isFullscreen); }
    function populateAudioTrackSelector() { if (!videoElement || typeof videoElement.audioTracks === 'undefined' || !audioTrackSelect) { if(audioTrackSelect) audioTrackSelect.style.display = 'none'; return; } const tracks = videoElement.audioTracks; audioTrackSelect.innerHTML = ''; if (tracks.length <= 1) { audioTrackSelect.style.display = 'none'; return; } let hasEnabledTrack = false; for (let i = 0; i < tracks.length; i++) { if (tracks[i].enabled) hasEnabledTrack = true; } if (!hasEnabledTrack && tracks.length > 0) { try { tracks[0].enabled = true; } catch(e) {} } let preferredTrackIndex = -1; for (let i = 0; i < tracks.length; i++) { const track = tracks[i]; const option = document.createElement('option'); const trackValue = track.id || i; option.value = trackValue; let label = track.label || `Track ${i + 1}`; let languageName = ''; if (track.language) { try { languageName = new Intl.DisplayNames(['en'], { type: 'language' }).of(track.language.split('-')[0]); label += ` (${languageName || track.language})`; } catch (e) { label += ` (${track.language})`; } } option.textContent = label; option.selected = track.enabled; option.disabled = track.readyState === 'ended'; audioTrackSelect.appendChild(option); const lang = track.language?.toLowerCase(); const lbl = label.toLowerCase(); if (preferredTrackIndex === -1 && (lang?.startsWith('hi') || lbl.includes('hindi') || languageName?.toLowerCase() === 'hindi')) { preferredTrackIndex = i; } } if (preferredTrackIndex !== -1) { try { for (let i = 0; i < tracks.length; i++) { tracks[i].enabled = (i === preferredTrackIndex); } audioTrackSelect.value = tracks[preferredTrackIndex].id || preferredTrackIndex; } catch(e) {} } else { for (let i = 0; i < tracks.length; i++) { if (tracks[i].enabled) { audioTrackSelect.value = tracks[i].id || i; break; } } } audioTrackSelect.style.display = 'inline-block'; try { if (tracks.onchange === null) tracks.onchange = populateAudioTrackSelector; } catch(e) {} }
    function openWithIntent(url) { if (!url) return; const mime = getMimeTypeFromUrl(url); const titleEncoded = encodeURIComponent(videoTitle?.innerText || document.title || 'Video'); const intentUri = `intent:${url}#Intent;type=${mime};action=android.intent.action.VIEW;S.title=${titleEncoded};end`; window.location.href = intentUri; }
    function copyVLCLink(buttonElement, url) { if (!url) { alert("Cannot copy: URL missing."); return; } const feedbackSpan = buttonElement.nextElementSibling; copyToClipboard(url, feedbackSpan).catch(err => { if (feedbackSpan) { feedbackSpan.classList.remove('show', 'error'); feedbackSpan.style.display = 'none'; } }); }
    function showCopyFeedback(spanElement, message = 'Copied!', isError = false) { if (!spanElement) return; clearTimeout(copyFeedbackTimeout); spanElement.textContent = message; spanElement.classList.toggle('error', isError); spanElement.classList.remove('share-fallback'); if (spanElement.classList.contains('share-fallback')) { spanElement.classList.add('share-fallback'); } spanElement.style.display = 'inline-block'; spanElement.classList.add('show'); copyFeedbackTimeout = setTimeout(() => { spanElement.classList.remove('show', 'error'); setTimeout(() => { if (!spanElement.classList.contains('show')) { spanElement.style.display = 'none'; spanElement.textContent = spanElement.classList.contains('share-fallback') ? 'Link copied!' : 'Copied!'; } }, 300); }, 2500); }
    function clearCopyFeedback() { clearTimeout(copyFeedbackTimeout); document.querySelectorAll('.copy-feedback.show').forEach(span => { span.classList.remove('show', 'error'); span.style.display = 'none'; span.textContent = span.classList.contains('share-fallback') ? 'Link copied!' : 'Copied!'; }); }
    function clearBypassFeedback() { clearTimeout(bypassFeedbackTimeout); document.querySelectorAll('.bypass-feedback.show').forEach(span => { span.classList.remove('show', 'error', 'loading'); span.style.display = 'none'; span.textContent = ''; }); }
    function highlightVlcText() { const currentVlcText = itemDetailContent?.querySelector('#vlcBox code'); if (currentVlcText && currentVlcText.closest('#vlcBox')?.style.display !== 'none') { try { const range = document.createRange(); range.selectNodeContents(currentVlcText); const selection = window.getSelection(); if (selection) { selection.removeAllRanges(); selection.addRange(range); } } catch (selectErr) {} } }
    function handlePlayerKeyboardShortcuts(event) { if (!videoContainer || videoContainer.style.display === 'none' || !videoElement) return; const targetTagName = event.target.tagName.toLowerCase(); if (targetTagName === 'input' || targetTagName === 'select' || targetTagName === 'textarea') return; const key = event.key; let prevented = false; switch (key) { case ' ': case 'k': togglePlayPause(); prevented = true; break; case 'ArrowLeft': seekVideo(-10); prevented = true; break; case 'ArrowRight': seekVideo(10); prevented = true; break; case 'ArrowUp': setVolume(Math.min(videoElement.volume + 0.05, 1)); if(volumeSlider) volumeSlider.value = videoElement.volume; prevented = true; break; case 'ArrowDown': setVolume(Math.max(videoElement.volume - 0.05, 0)); if(volumeSlider) volumeSlider.value = videoElement.volume; prevented = true; break; case 'm': toggleMute(); prevented = true; break; case 'f': toggleFullscreen(); prevented = true; break; } if (prevented) event.preventDefault(); }

    // --- State Persistence (Unchanged) ---
    function saveStateToLocalStorage() { try { const stateToSave = {}; if (currentState.sortColumn !== 'lastUpdated') stateToSave.sortColumn = currentState.sortColumn; if (currentState.sortDirection !== 'desc') stateToSave.sortDirection = currentState.sortDirection; if (currentState.qualityFilter !== '') stateToSave.qualityFilter = currentState.qualityFilter; if (Object.keys(stateToSave).length > 0) { localStorage.setItem(config.LOCAL_STORAGE_KEY, JSON.stringify(stateToSave)); } else { localStorage.removeItem(config.LOCAL_STORAGE_KEY); } } catch (e) {} }
    function loadStateFromLocalStorage() { try { const savedState = localStorage.getItem(config.LOCAL_STORAGE_KEY); if (savedState) { const parsedState = JSON.parse(savedState); currentState.sortColumn = typeof parsedState.sortColumn === 'string' ? parsedState.sortColumn : 'lastUpdated'; currentState.sortDirection = (typeof parsedState.sortDirection === 'string' && ['asc', 'desc'].includes(parsedState.sortDirection)) ? parsedState.sortDirection : 'desc'; currentState.qualityFilter = typeof parsedState.qualityFilter === 'string' ? parsedState.qualityFilter : ''; } else { currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc'; currentState.qualityFilter = ''; } } catch (e) { localStorage.removeItem(config.LOCAL_STORAGE_KEY); currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc'; currentState.qualityFilter = ''; } currentState.searchTerm = ''; currentState.currentPage = 1; currentState.typeFilter = ''; activeResultsTab = 'allFiles'; currentItemDetailData = null; isShareMode = false; lastFocusedElement = null; }

    // --- Initial Data Loading and Setup (API fetch and quality filter population logic largely unchanged) ---
    async function fetchApiData(params = {}, signal = null) { if (!params.id && searchAbortController) { searchAbortController.abort(); } let currentSignal = signal; if (!currentSignal && !params.id) { searchAbortController = new AbortController(); currentSignal = searchAbortController.signal; } else if (signal) {} else { const tempController = new AbortController(); currentSignal = tempController.signal; } const query = new URLSearchParams(); if (!params.id) { query.set('page', params.page || currentState.currentPage); query.set('limit', params.limit || currentState.limit); query.set('sort', params.sort || currentState.sortColumn); query.set('sortDir', params.sortDir || currentState.sortDirection); const searchTerm = params.search !== undefined ? params.search : currentState.searchTerm; if (searchTerm) query.set('search', searchTerm); const qualityFilter = params.quality !== undefined ? params.quality : currentState.qualityFilter; if (qualityFilter) query.set('quality', qualityFilter); const typeFilter = params.type !== undefined ? params.type : currentState.typeFilter; if (typeFilter) query.set('type', typeFilter); } else { query.set('id', params.id); } const url = `${config.MOVIE_DATA_API_URL}?${query.toString()}`; try { const response = await fetch(url, { signal: currentSignal }); if (!response.ok) { let errorBody = null; try { errorBody = await response.json(); } catch (_) {} const errorDetails = errorBody?.error || errorBody?.details || `Status: ${response.status}`; throw new Error(`API Error: ${errorDetails}`); } const data = await response.json(); if (!params.id && tabMappings[activeResultsTab]) { const activePagination = tabMappings[activeResultsTab]?.pagination; if (activePagination && data.totalPages !== undefined) { activePagination.dataset.totalPages = data.totalPages; } } return data; } catch (error) { if (error.name === 'AbortError') { return null; } throw error; } finally { if (currentSignal === searchAbortController?.signal && !signal) { searchAbortController = null; } } }
    async function fetchAndRenderResults() { if (currentViewMode !== 'search') return; try { const apiResponse = await fetchApiData(); if (apiResponse === null) return; renderActiveResultsView(apiResponse); saveStateToLocalStorage(); } catch (error) { if (error.name !== 'AbortError') { const { gridContainer } = tabMappings[activeResultsTab]; if (gridContainer) { gridContainer.innerHTML = `<div class="error-message grid-status-message">Error loading results: ${error.message}. Please try again.</div>`; } Object.values(tabMappings).forEach(m => { if(m.pagination) m.pagination.style.display = 'none'; }); } } }
    function populateQualityFilter(items = []) { if (!qualityFilterSelect) return; const currentSelectedValue = qualityFilterSelect.value; items.forEach(item => { if (item.displayQuality && item.displayQuality !== 'N/A') { uniqueQualities.add(item.displayQuality); } }); const sortedQualities = [...uniqueQualities].sort((a, b) => { const getScore = (q) => { q = String(q || '').toUpperCase().trim(); const resMatch = q.match(/^(\d{3,4})P$/); if (q === '4K' || q === '2160P') return 100; if (resMatch) return parseInt(resMatch[1], 10); if (q === '1080P') return 90; if (q === '720P') return 80; if (q === '480P') return 70; if (['WEBDL', 'BLURAY', 'BDRIP', 'BRRIP'].includes(q)) return 60; if (['WEBIP', 'HDTV', 'HDRIP'].includes(q)) return 50; if (['DVD', 'DVDRIP'].includes(q)) return 40; if (['DVDSCR', 'HC', 'HDCAM', 'TC', 'TS', 'CAM'].includes(q)) return 30; if (['HDR', 'DOLBY VISION', 'DV', 'HEVC', 'X265'].includes(q)) return 20; return 0; }; const scoreA = getScore(a); const scoreB = getScore(b); if (scoreA !== scoreB) return scoreB - scoreA; return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' }); }); while (qualityFilterSelect.options.length > 1) { qualityFilterSelect.remove(1); } sortedQualities.forEach(quality => { if (quality && quality !== 'N/A') { const option = document.createElement('option'); option.value = quality; option.textContent = quality; qualityFilterSelect.appendChild(option); } }); qualityFilterSelect.value = [...qualityFilterSelect.options].some(opt => opt.value === currentSelectedValue) ? currentSelectedValue : ""; updateFilterIndicator(); }
    function displayLoadError(message) { const errorHtml = `<div class="error-container" role="alert">${sanitize(message)}</div>`; if (searchFocusArea) searchFocusArea.innerHTML = ''; searchFocusArea.style.display = 'none'; if (resultsArea) resultsArea.innerHTML = ''; resultsArea.style.display = 'none'; if (updatesPreviewSection) updatesPreviewSection.innerHTML = ''; updatesPreviewSection.style.display = 'none'; if (itemDetailContent) itemDetailContent.innerHTML = ''; if (itemDetailView) itemDetailView.style.display = 'none'; if (pageFooter) pageFooter.style.display = 'none'; container.classList.remove('results-active', 'item-detail-active'); if (mainErrorArea) { mainErrorArea.innerHTML = errorHtml; } else if (container) { container.insertAdjacentHTML('afterbegin', errorHtml); } if (pageLoader) pageLoader.style.display = 'none'; }
    async function initializeApp() { isInitialLoad = true; if (pageLoader) pageLoader.style.display = 'flex'; loadStateFromLocalStorage(); if (qualityFilterSelect) { qualityFilterSelect.value = currentState.qualityFilter || ''; updateFilterIndicator(); } handleUrlChange(); if (currentViewMode !== 'itemDetail') { try { fetchApiData({ limit: 5000, sort: 'lastUpdated', sortDir: 'desc' }).then(suggestionData => { if (suggestionData === null) return; if (suggestionData && suggestionData.items) { localSuggestionData = suggestionData.items.map(preprocessMovieData); populateQualityFilter(localSuggestionData); if (currentViewMode === 'homepage') { weeklyUpdatesData = localSuggestionData; displayInitialUpdates(); } } else { if (currentViewMode === 'homepage' && updatesPreviewList && !updatesPreviewList.hasChildNodes()) { updatesPreviewList.innerHTML = '<div class="status-message grid-status-message">Could not load recent updates.</div>'; } } }).catch(e => { if (e.name !== 'AbortError') { if (currentViewMode === 'homepage' && updatesPreviewList && !updatesPreviewList.hasChildNodes()) { updatesPreviewList.innerHTML = `<div class="error-message grid-status-message">Error loading updates: ${e.message}.</div>`; } } }); } catch (error) {} } if (currentViewMode !== 'itemDetail' && pageLoader && pageLoader.style.display !== 'none') { pageLoader.style.display = 'none'; } isInitialLoad = false; }

    // --- Event Handling Setup ---
    function handleActionClick(event) { const target = event.target; const button = target.closest('#item-detail-content .button:not(.close-btn):not(.vlc-button):not(.intent-button):not(.download-button):not(.share-button):not(.youtube-button):not(.tmdb-link-button):not(.imdb-button):not(.telegram-button):not(.gdflix-button):not(.hubcloud-button):not(.filepress-button):not(.gdtot-button), #playerCustomUrlSection .button'); const copyButton = target.closest('#item-detail-content .vlc-button[data-action="copy-vlc"]'); const intentButton = target.closest('#item-detail-content .intent-button[data-action="open-intent"]'); const shareButton = target.closest('#item-detail-content .share-button[data-action="share"]'); const customUrlToggle = target.closest('#item-detail-content .custom-url-toggle-button[data-action="toggle-custom-url"]'); const bypassHubCloudButton = target.closest('#item-detail-content .hubcloud-bypass-button[data-action="bypass-hubcloud"]'); const bypassGdflixButton = target.closest('#item-detail-content .gdflix-bypass-button[data-action="bypass-gdflix"]'); const playButton = target.closest('#item-detail-content .play-button[data-action="play"]'); let actionHandled = false; if (playButton) { const url = playButton.dataset.url; const title = playButton.dataset.title || currentItemDetailData?.displayFilename; const filename = playButton.dataset.filename || currentItemDetailData?.displayFilename; if (url) { event.preventDefault(); lastFocusedElement = playButton; isGlobalCustomUrlMode = false; streamVideo(title, url, filename); actionHandled = true; } } else if (copyButton) { const url = copyButton.dataset.url; if (url) { event.preventDefault(); lastFocusedElement = copyButton; copyVLCLink(copyButton, url); actionHandled = true; } } else if (intentButton) { const url = intentButton.dataset.url; if (url) { event.preventDefault(); lastFocusedElement = intentButton; openWithIntent(url); actionHandled = true; } } else if (shareButton) { const id = shareButton.dataset.id; if (id) { event.preventDefault(); lastFocusedElement = shareButton; handleShareClick(shareButton); actionHandled = true; } } else if (customUrlToggle) { event.preventDefault(); lastFocusedElement = customUrlToggle; toggleCustomUrlInput(customUrlToggle); actionHandled = true; } else if (bypassHubCloudButton) { event.preventDefault(); lastFocusedElement = bypassHubCloudButton; triggerHubCloudBypass(bypassHubCloudButton); actionHandled = true; } else if (bypassGdflixButton) { event.preventDefault(); lastFocusedElement = bypassGdflixButton; triggerGDFLIXBypass(bypassGdflixButton); actionHandled = true; } else if (button && button.matches('#playerPlayCustomUrlButton')) { event.preventDefault(); lastFocusedElement = button; if (isGlobalCustomUrlMode) { handleGlobalPlayCustomUrl(event); } else { playFromCustomUrlInput(event.target); } actionHandled = true; } if (!actionHandled && target.tagName === 'A' && target.href && target.target === '_blank' && target.closest('#item-detail-content')) {} else if (!actionHandled && button) {} }
    function handleGlobalCustomUrlClick(event) { event.preventDefault(); lastFocusedElement = event.target; if (!container || !videoContainer || !playerCustomUrlSection || !playerCustomUrlInput) return; closePlayerIfNeeded(null); if (videoContainer.parentElement !== container) { if (videoContainer.parentElement) { videoContainer.parentElement.removeChild(videoContainer); } container.appendChild(videoContainer); } else { if (!container.contains(videoContainer)) { container.appendChild(videoContainer); } } if(resultsArea) resultsArea.style.display = 'none'; if(itemDetailView) itemDetailView.style.display = 'none'; if(searchFocusArea) searchFocusArea.style.display = 'none'; if(pageFooter) pageFooter.style.display = 'none'; isGlobalCustomUrlMode = true; videoContainer.classList.add('global-custom-url-mode'); if (videoElement) videoElement.style.display = 'none'; if (customControlsContainer) customControlsContainer.style.display = 'none'; if (videoTitle) videoTitle.innerText = 'Play Custom URL'; if (vlcBox) vlcBox.style.display = 'none'; if (audioWarningDiv) audioWarningDiv.style.display = 'none'; playerCustomUrlSection.style.display = 'flex'; if (playerCustomUrlInput) playerCustomUrlInput.value = ''; if (playerCustomUrlFeedback) playerCustomUrlFeedback.textContent = ''; videoContainer.style.display = 'flex'; if (playerCustomUrlInput) { setTimeout(() => playerCustomUrlInput.focus(), 50); } }
    function handleGlobalPlayCustomUrl(event) { event.preventDefault(); if (!playerCustomUrlInput || !playerCustomUrlFeedback) return; const customUrlRaw = playerCustomUrlInput.value.trim(); playerCustomUrlFeedback.textContent = ''; if (!customUrlRaw) { playerCustomUrlFeedback.textContent = 'Please enter a URL.'; playerCustomUrlInput.focus(); return; } let customUrlEncoded = customUrlRaw; try { new URL(customUrlRaw); customUrlEncoded = customUrlRaw.replace(/ /g, '%20'); } catch (e) { playerCustomUrlFeedback.textContent = 'Invalid URL format.'; playerCustomUrlInput.focus(); return; } if(playerCustomUrlSection) playerCustomUrlSection.style.display = 'none'; if(videoElement) videoElement.style.display = 'block'; if(customControlsContainer) customControlsContainer.style.display = 'flex'; streamVideo("Custom URL Video", customUrlEncoded, null, true); }
    function toggleCustomUrlInput(toggleButton, triggeredByError = false) { const contextContainer = toggleButton.closest('#item-detail-content') || toggleButton.closest('#videoContainer'); if (!contextContainer || !videoContainer || !playerCustomUrlSection || !videoElement || !customControlsContainer) return; if (contextContainer.id === 'item-detail-content' && videoContainer.parentElement !== contextContainer) { const separator = contextContainer.querySelector('hr.detail-separator'); const targetElement = separator ? separator.nextElementSibling : contextContainer.firstChild; if(videoContainer.parentElement) videoContainer.parentElement.removeChild(videoContainer); if (targetElement && targetElement.nextSibling) { contextContainer.insertBefore(videoContainer, targetElement.nextSibling); } else { contextContainer.appendChild(videoContainer); } if (videoElement.hasAttribute('src')) { videoElement.pause(); videoElement.removeAttribute('src'); videoElement.currentTime = 0; videoElement.load(); } if (vlcBox) vlcBox.style.display = 'none'; if (audioWarningDiv) audioWarningDiv.style.display = 'none'; if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; } clearCopyFeedback(); } const isHidden = playerCustomUrlSection.style.display === 'none'; playerCustomUrlSection.style.display = isHidden ? 'flex' : 'none'; videoElement.style.display = isHidden ? 'none' : 'block'; customControlsContainer.style.display = isHidden ? 'none' : 'flex'; if(vlcBox) vlcBox.style.display = isHidden ? 'none' : 'block'; if(audioWarningDiv) { if (isHidden && audioWarningDiv.style.display !== 'none' && !audioWarningDiv.innerHTML.includes('Playback Error:')) { audioWarningDiv.style.display = 'none'; } else if (!isHidden && audioWarningDiv.style.display === 'none') { const movieData = currentItemDetailData; if (movieData && movieData.displayFilename) { const ddp51Regex = /\bDDP?([ ._-]?5\.1)?\b/i; const advancedAudioRegex = /\b(DTS|ATMOS|TrueHD)\b/i; const multiAudioHintRegex = /\b(Multi|Dual)[ ._-]?Audio\b/i; let warningText = ""; const lowerFilename = movieData.displayFilename.toLowerCase(); if (ddp51Regex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DDP audio might not work. Use external player."; } else if (advancedAudioRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DTS/Atmos/TrueHD audio likely unsupported. Use external player."; } else if (multiAudioHintRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> May contain multiple audio tracks. Use external player."; } if(warningText) { audioWarningDiv.innerHTML = warningText; audioWarningDiv.style.display = 'block'; } } } } if (videoContainer.style.display === 'none') { videoContainer.style.display = 'flex'; } toggleButton.setAttribute('aria-expanded', String(isHidden)); toggleButton.innerHTML = isHidden ? '<span aria-hidden="true">🔼</span> Hide Custom URL Input' : '<span aria-hidden="true">🔗</span> Play Custom URL'; if (isHidden && !triggeredByError) { if (playerCustomUrlInput) setTimeout(() => playerCustomUrlInput.focus(), 50); } else if (!isHidden) { setTimeout(() => toggleButton.focus(), 50); } setTimeout(() => { videoContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150); }
    function playFromCustomUrlInput(playButton) { const container = playButton.closest('#playerCustomUrlSection'); if (!container) return; const inputField = container.querySelector('#playerCustomUrlInput'); const feedbackSpan = container.querySelector('.player-custom-url-feedback'); const titleRef = "Custom URL Video"; if (!inputField || !feedbackSpan) return; const customUrlRaw = inputField.value.trim(); feedbackSpan.textContent = ''; if (!customUrlRaw) { feedbackSpan.textContent = 'Please enter a URL.'; inputField.focus(); return; } let customUrlEncoded = customUrlRaw; try { new URL(customUrlRaw); customUrlEncoded = customUrlRaw.replace(/ /g, '%20'); } catch (e) { feedbackSpan.textContent = 'Invalid URL format.'; inputField.focus(); return; } isGlobalCustomUrlMode = false; if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none'; if (videoElement) videoElement.style.display = 'block'; if (customControlsContainer) customControlsContainer.style.display = 'flex'; streamVideo(titleRef, customUrlEncoded, null, true); }

    // --- HubCloud/GDFLIX Bypass Logic (Unchanged) ---
    async function triggerHubCloudBypass(buttonElement) { const hubcloudUrl = buttonElement.dataset.hubcloudUrl; const movieRefType = buttonElement.dataset.movieRef; if (!hubcloudUrl) { setBypassButtonState(buttonElement, 'error', 'Missing URL'); return; } if (movieRefType !== 'detail' || !currentItemDetailData) { setBypassButtonState(buttonElement, 'error', 'Context Error'); return; } setBypassButtonState(buttonElement, 'loading'); const apiController = new AbortController(); const timeoutId = setTimeout(() => { apiController.abort(); setBypassButtonState(buttonElement, 'error', 'Timeout'); }, config.BYPASS_TIMEOUT); try { const response = await fetch(config.BYPASS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hubcloudUrl }), signal: apiController.signal }); clearTimeout(timeoutId); if (!response.ok) { let errorDetails = `HTTP Error: ${response.status}`; try { errorDetails = (await response.json()).details || errorDetails; } catch (_) {} throw new Error(errorDetails); } const result = await response.json(); if (result.success && result.finalUrl) { const encodedFinalUrl = result.finalUrl.replace(/ /g, '%20'); setBypassButtonState(buttonElement, 'success', 'Success!'); updateItemDetailAfterBypass(encodedFinalUrl); } else { throw new Error(result.details || result.error || 'Unknown HubCloud bypass failure'); } } catch (error) { clearTimeout(timeoutId); if (error.name === 'AbortError' && !apiController.signal.aborted) { setBypassButtonState(buttonElement, 'error', 'Timeout'); } else if (error.name === 'AbortError') { setBypassButtonState(buttonElement, 'idle'); } else { setBypassButtonState(buttonElement, 'error', `Failed: ${error.message.substring(0, 50)}`); } } }
    async function triggerGDFLIXBypass(buttonElement) { const gdflixUrl = buttonElement.dataset.gdflixUrl; const movieRefType = buttonElement.dataset.movieRef; if (!gdflixUrl) { setBypassButtonState(buttonElement, 'error', 'Missing URL'); return; } if (movieRefType !== 'detail' || !currentItemDetailData) { setBypassButtonState(buttonElement, 'error', 'Context Error'); return; } setBypassButtonState(buttonElement, 'loading'); const apiController = new AbortController(); const timeoutId = setTimeout(() => { apiController.abort(); setBypassButtonState(buttonElement, 'error', 'Timeout'); }, config.BYPASS_TIMEOUT); try { const response = await fetch(config.GDFLIX_BYPASS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gdflixUrl }), signal: apiController.signal }); clearTimeout(timeoutId); if (!response.ok) { let errorDetails = `HTTP Error: ${response.status}`; try { errorDetails = (await response.json()).error || errorDetails; } catch (_) {} throw new Error(errorDetails); } const result = await response.json(); if (result.success && result.finalUrl) { const encodedFinalUrl = result.finalUrl.replace(/ /g, '%20'); setBypassButtonState(buttonElement, 'success', 'Success!'); updateItemDetailAfterBypass(encodedFinalUrl); } else { throw new Error(result.error || 'Unknown GDFLIX bypass failure'); } } catch (error) { clearTimeout(timeoutId); if (error.name === 'AbortError' && !apiController.signal.aborted) { setBypassButtonState(buttonElement, 'error', 'Timeout'); } else if (error.name === 'AbortError') { setBypassButtonState(buttonElement, 'idle'); } else { setBypassButtonState(buttonElement, 'error', `Failed: ${error.message.substring(0, 50)}`); } } }
    function setBypassButtonState(buttonElement, state, message = null) { if (!buttonElement) return; const feedbackSpan = buttonElement.nextElementSibling; const iconSpan = buttonElement.querySelector('.button-icon'); const spinnerSpan = buttonElement.querySelector('.button-spinner'); const textSpan = buttonElement.querySelector('.button-text'); const isHubCloud = buttonElement.classList.contains('hubcloud-bypass-button'); const defaultText = isHubCloud ? 'Bypass HubCloud' : 'Bypass GDFLIX'; const defaultIconHTML = isHubCloud ? '☁️' : '🎬'; buttonElement.classList.remove('loading', 'error', 'success'); buttonElement.disabled = false; if (feedbackSpan) { feedbackSpan.style.display = 'none'; feedbackSpan.className = 'bypass-feedback'; } if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; clearTimeout(bypassFeedbackTimeout); switch (state) { case 'loading': buttonElement.classList.add('loading'); buttonElement.disabled = true; if (textSpan) textSpan.textContent = 'Bypassing...'; if (spinnerSpan) spinnerSpan.style.display = 'inline-block'; if (iconSpan) iconSpan.style.display = 'none'; if (feedbackSpan) { feedbackSpan.textContent = 'Please wait...'; feedbackSpan.classList.add('loading', 'show'); feedbackSpan.style.display = 'inline-block'; } break; case 'success': buttonElement.classList.add('success'); buttonElement.disabled = true; if (textSpan) textSpan.textContent = 'Success!'; if (iconSpan) iconSpan.innerHTML = '✅'; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.textContent = message || 'Success!'; feedbackSpan.classList.add('success', 'show'); feedbackSpan.style.display = 'inline-block'; } break; case 'error': buttonElement.classList.add('error'); buttonElement.disabled = false; if (textSpan) textSpan.textContent = defaultText; if (iconSpan) iconSpan.innerHTML = defaultIconHTML; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.textContent = message || 'Failed'; feedbackSpan.classList.add('error', 'show'); feedbackSpan.style.display = 'inline-block'; bypassFeedbackTimeout = setTimeout(() => { if (feedbackSpan.classList.contains('show')) { feedbackSpan.classList.remove('show', 'error', 'loading'); feedbackSpan.style.display = 'none'; feedbackSpan.textContent = ''; } }, 4000); } break; case 'idle': default: buttonElement.disabled = false; if (textSpan) textSpan.textContent = defaultText; if (iconSpan) iconSpan.innerHTML = defaultIconHTML; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.classList.remove('show', 'error', 'loading'); feedbackSpan.style.display = 'none'; feedbackSpan.textContent = ''; } break; } }

    // --- Event Delegation Setup (Adapted for Grid View) ---
     function handleContentClick(event) {
         const target = event.target;

         // 1. Check for clicks on Grid Items (Results or Updates Preview)
         const gridItemTrigger = target.closest('.grid-item'); // Targets the entire card
         if (gridItemTrigger) {
             event.preventDefault(); // Prevent default if card itself is an <a> or has other behaviors
             const itemId = gridItemTrigger.dataset.itemId;
             if (itemId) {
                 navigateToItemView(itemId);
             } else {
                 console.error("Could not find item ID for grid item navigation.");
             }
             return;
         }

         // 2. Check for action clicks within the Item Detail view (Unchanged)
         if (target.closest('#item-detail-content')) {
             handleActionClick(event);
         }

          // 3. Handle Player Close Button (Unchanged)
          if (target.matches('.close-btn') && target.closest('#videoContainer')) {
              event.preventDefault(); lastFocusedElement = target; closePlayer(lastFocusedElement); return;
          }

          // 4. Handle clicks on sortable table headers (If thead is kept)
         if (target.closest('th.sortable')) {
             handleSort(event);
             return;
         }
    }

    // --- Add Event Listeners ---
    document.addEventListener('DOMContentLoaded', async () => {
         await initializeApp();
         if (searchInput) { searchInput.addEventListener('input', handleSearchInput); searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSearchSubmit(); } else if (event.key === 'Escape') { suggestionsContainer.style.display = 'none'; } }); searchInput.addEventListener('search', handleSearchClear); searchInput.addEventListener('blur', () => { setTimeout(() => { const searchButton = document.getElementById('searchSubmitButton'); if (document.activeElement !== searchInput && !suggestionsContainer.contains(document.activeElement) && document.activeElement !== searchButton) { suggestionsContainer.style.display = 'none'; } }, 150); }); }
         if (qualityFilterSelect) { qualityFilterSelect.addEventListener('change', triggerFilterChange); }

         // Delegated Click Listener for main content areas (Updated for Grid)
         // resultsArea will contain the tab panels, which then contain gridContainers
         if (resultsArea) { resultsArea.addEventListener('click', handleContentClick); }
         if (updatesPreviewList) { updatesPreviewList.addEventListener('click', handleContentClick); } // updatesPreviewList is now a grid container
         if (itemDetailView) { itemDetailView.addEventListener('click', handleContentClick); }

         if (playCustomUrlGlobalButton) { playCustomUrlGlobalButton.addEventListener('click', handleGlobalCustomUrlClick); }
         document.addEventListener('keydown', handlePlayerKeyboardShortcuts);
         document.addEventListener('click', (event) => {
            if (searchInput && suggestionsContainer && suggestionsContainer.style.display === 'block') { const searchWrapper = searchInput.closest('.search-input-wrapper'); if (searchWrapper && !searchWrapper.contains(event.target)) { suggestionsContainer.style.display = 'none'; } }
            if (videoContainer && videoContainer.style.display !== 'none' && !isGlobalCustomUrlMode) { const clickedInsidePlayer = videoContainer.contains(event.target); const clickedInsideDetailContent = itemDetailContent?.contains(event.target); if (!clickedInsidePlayer && !clickedInsideDetailContent) { let clickedOnPotentialTrigger = false; if (lastFocusedElement) { clickedOnPotentialTrigger = lastFocusedElement === event.target || lastFocusedElement.contains(event.target); } if (!clickedOnPotentialTrigger) { closePlayer(event.target); } } }
            else if (videoContainer && videoContainer.style.display !== 'none' && isGlobalCustomUrlMode) { const clickedInsidePlayer = videoContainer.contains(event.target); const clickedOnGlobalTrigger = playCustomUrlGlobalButton && playCustomUrlGlobalButton.contains(event.target); if (!clickedInsidePlayer && !clickedOnGlobalTrigger) { closePlayer(event.target); } }
         }, false);
         if(videoElement) { videoElement.addEventListener('volumechange', () => { if (volumeSlider && Math.abs(parseFloat(volumeSlider.value) - videoElement.volume) > 0.01) { volumeSlider.value = videoElement.volume; } updateMuteButton(); try { localStorage.setItem(config.PLAYER_VOLUME_KEY, String(videoElement.volume)); } catch (e) {} }); videoElement.addEventListener('ratechange', () => { if(playbackSpeedSelect && playbackSpeedSelect.value !== String(videoElement.playbackRate)) { playbackSpeedSelect.value = String(videoElement.playbackRate); } try { localStorage.setItem(config.PLAYER_SPEED_KEY, String(videoElement.playbackRate)); } catch (e) {} }); videoElement.addEventListener('loadedmetadata', populateAudioTrackSelector); videoElement.removeEventListener('error', handleVideoError); videoElement.addEventListener('error', handleVideoError); }
         document.addEventListener('fullscreenchange', handleFullscreenChange); document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
     });

})();
// --- END OF script.js (MODIFIED FOR GRID VIEW) ---
