// --- START OF script.js (MODIFIED FOR ITEM DETAIL VIEW NAVIGATION + HUBCLEOUD & GDFLIX BYPASS + URL SPACE ENCODING + TMDb INTEGRATION) ---
(function() {
    'use strict';

    // ===========================================================
    // JAVASCRIPT SECTION (Updated for TMDb Integration)
    // ===========================================================
    const config = {
        HDR_LOGO_URL: "https://as1.ftcdn.net/v2/jpg/05/32/83/72/1000_F_532837228_v8CGZRU0jy39uCtqFRnJz6xDntrGuLLx.webp",
        FOURK_LOGO_URL: "https://i.pinimg.com/736x/85/c4/b0/85c4b0a2fb8612825d0cd2f53460925f.jpg",
        ITEMS_PER_PAGE: 50,
        LOCAL_STORAGE_KEY: 'cinemaGharState_v15_tmdb', // Incremented version for TMDb
        PLAYER_VOLUME_KEY: 'cinemaGharPlayerVolume',
        PLAYER_SPEED_KEY: 'cinemaGharPlayerSpeed',
        SEARCH_DEBOUNCE_DELAY: 300,
        SUGGESTIONS_DEBOUNCE_DELAY: 250,
        MAX_SUGGESTIONS: 50,
        UPDATES_PREVIEW_INITIAL_COUNT: 10,
        UPDATES_PREVIEW_LOAD_MORE_COUNT: 10,
        MOVIE_DATA_API_URL: '/api/movies', // Your backend API for movie list/search/details
        BYPASS_API_URL: 'https://hubcloud-bypass.onrender.com/api/hubcloud', // HubCloud Bypass API
        GDFLIX_BYPASS_API_URL: 'https://gdflix-bypass.onrender.com/api/gdflix', // GDFLIX Bypass API
        BYPASS_TIMEOUT: 60000, // 60 seconds timeout for bypass API calls (Shared)
        TMDB_API_PROXY_URL: '/api/tmdb', // Your backend proxy route for TMDb
        TMDB_FETCH_TIMEOUT: 15000 // Timeout for TMDb fetch (15 seconds)
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
    const updatesPreviewList = document.getElementById('updates-preview-list');
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
    const tabContent = document.querySelector('.tab-content');
    const allFilesTabButton = document.getElementById('allFilesTabButton');
    const moviesTabButton = document.getElementById('moviesTabButton');
    const seriesTabButton = document.getElementById('seriesTabButton');
    const allFilesTabPanel = document.getElementById('allFilesTabPanel');
    const moviesTabPanel = document.getElementById('moviesTabPanel');
    const seriesTabPanel = document.getElementById('seriesTabPanel');
    const allFilesTableBody = document.getElementById('allFilesTableBody');
    const moviesTableBody = document.getElementById('moviesTableBody');
    const seriesTableBody = document.getElementById('seriesTableBody');
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
    let localSuggestionData = [];
    let currentSearchResultsData = [];
    let weeklyUpdatesData = [];
    let currentItemDetailData = null; // Holds the *internal* data for the currently displayed item
    let updatesPreviewShownCount = 0;
    let uniqueQualities = new Set();
    let copyFeedbackTimeout;
    let bypassFeedbackTimeout;
    let suggestionDebounceTimeout;
    let searchAbortController = null;
    let isInitialLoad = true;
    let currentViewMode = 'homepage'; // 'homepage', 'search', 'itemDetail'
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

    const tabMappings = {
        allFiles: { button: allFilesTabButton, panel: allFilesTabPanel, tableBody: allFilesTableBody, pagination: allFilesPaginationControls, typeFilter: '', tableHead: allFilesTableHead },
        movies: { button: moviesTabButton, panel: moviesTabPanel, tableBody: moviesTableBody, pagination: moviesPaginationControls, typeFilter: 'movies', tableHead: moviesTableHead },
        series: { button: seriesTabButton, panel: seriesTabPanel, tableBody: seriesTableBody, pagination: seriesPaginationControls, typeFilter: 'series', tableHead: seriesTableHead }
    };

    // --- Utility Functions ---
    const sanitize = (str) => { if (str === null || typeof str === 'undefined') return ""; const temp = document.createElement('div'); temp.textContent = String(str); return temp.innerHTML; };
    const TimeAgo = { MINUTE: 60, HOUR: 3600, DAY: 86400, WEEK: 604800, MONTH: 2592000, YEAR: 31536000, format: (isoString) => { if (!isoString) return 'N/A'; try { const date = new Date(isoString); const seconds = Math.floor((new Date() - date) / 1000); if (isNaN(seconds) || seconds < 0) { console.warn(`TimeAgo: Invalid seconds calculation for ${isoString}. Parsed date: ${date}. Returning full date.`); return TimeAgo.formatFullDate(date); } if (seconds < 2) return "just now"; if (seconds < TimeAgo.MINUTE) return `${seconds} sec${seconds > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.HOUR) return `${Math.floor(seconds / TimeAgo.MINUTE)} min${Math.floor(seconds / TimeAgo.MINUTE) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY) return `${Math.floor(seconds / TimeAgo.HOUR)} hr${Math.floor(seconds / TimeAgo.HOUR) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY * 2) return "Yesterday"; if (seconds < TimeAgo.WEEK) return `${Math.floor(seconds / TimeAgo.DAY)} days ago`; if (seconds < TimeAgo.MONTH) return `${Math.floor(seconds / TimeAgo.WEEK)} wk${Math.floor(seconds / TimeAgo.WEEK) > 1 ? 's' : ''} ago`; return TimeAgo.formatFullDate(date, true); } catch (e) { console.error("Date Format Error (TimeAgo):", isoString, e); return 'Invalid Date'; } }, formatFullDate: (date, short = false) => { if (!(date instanceof Date) || isNaN(date.getTime())) return 'Invalid Date'; const optsDate = short ? { year: 'numeric', month: 'numeric', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }; const optsTime = { hour: 'numeric', minute: '2-digit', hour12: true }; try { return `${date.toLocaleDateString(undefined, optsDate)}${short ? '' : ', ' + date.toLocaleTimeString(undefined, optsTime)}`; } catch (e) { console.error("toLocaleDateString/Time failed:", e); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; } } };
    function extractSizeData(inputString) { if (!inputString) return { value: 0, unit: '', display: 'N/A', bytes: 0 }; const r = /(?<size>[\d.]+)\s?(?<unit>GB|MB)/i; const m = String(inputString).match(r); if (m?.groups?.size && m?.groups?.unit) { const value = parseFloat(m.groups.size); const unit = m.groups.unit.toUpperCase(); if (!isNaN(value)) { const bytes = unit === 'GB' ? value * 1024 * 1024 * 1024 : value * 1024 * 1024; return { value: value, unit: unit, display: `${value} ${unit}`, bytes: isNaN(bytes) ? 0 : bytes }; } } return { value: 0, unit: '', display: 'N/A', bytes: 0 }; }
    function getMimeTypeFromUrl(url) { if (!url) return 'video/*'; const m = url.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/); if (!m) return 'video/*'; const ext = m[1].toLowerCase(); const mimeMap = { 'mkv': 'video/x-matroska', 'mp4': 'video/mp4', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo', 'webm': 'video/webm', 'wmv': 'video/x-ms-wmv', 'flv': 'video/x-flv', 'ts': 'video/mp2t', 'm4v': 'video/x-m4v', 'ogv': 'video/ogg' }; return mimeMap[ext] || 'video/*'; }
    function handleVideoError(event) {
         console.error("HTML5 Video Error:", event, videoElement?.error);
         let msg = "An unknown error occurred while trying to play the video.";
         if (videoElement?.error) {
             switch (videoElement.error.code) {
                 case MediaError.MEDIA_ERR_ABORTED: msg = 'Playback was aborted.'; break;
                 case MediaError.MEDIA_ERR_NETWORK: msg = 'A network error caused the video download to fail.'; break;
                 case MediaError.MEDIA_ERR_DECODE: msg = 'Video decoding error (unsupported codec or corrupt file?).'; break;
                 case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = 'Video format not supported or server/network failed.'; break;
                 default: msg = `An unknown video error occurred (Code: ${videoElement.error.code}).`; break;
             }
         }
         if (audioWarningDiv) {
             audioWarningDiv.innerHTML = `<strong>Playback Error:</strong> ${sanitize(msg)} <br>Consider using 'Copy URL' with an external player (VLC/MX), 'Play in VLC or MX Player' (Android), or the 'Play Custom URL' option below.`;
             audioWarningDiv.style.display = 'block';
         }
         if (!isGlobalCustomUrlMode && currentViewMode === 'itemDetail' && itemDetailContent) {
             const customUrlToggleButton = itemDetailContent.querySelector('.custom-url-toggle-button');
             if (customUrlToggleButton) {
                 console.log("Playback error occurred in item detail view, showing item's custom URL toggle button.");
                 customUrlToggleButton.style.display = 'inline-flex';
                 if (playerCustomUrlSection && playerCustomUrlSection.style.display === 'none') {
                     toggleCustomUrlInput(customUrlToggleButton, true);
                 }
                 setTimeout(() => { customUrlToggleButton.focus(); }, 100);
             } else { console.warn("Could not find custom URL toggle button in item detail view after video error."); }
         } else if (isGlobalCustomUrlMode) {
             if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'flex';
             if (videoElement) videoElement.style.display = 'none';
             if (customControlsContainer) customControlsContainer.style.display = 'none';
         } else {
             console.warn("Video error occurred, but couldn't determine context to show custom URL toggle.");
         }
     }
    function extractQualityFromFilename(filename) { if (!filename) return null; const safeFilename = String(filename); const patterns = [ /(?:^|\.|\[|\(|\s|_|-)((?:4k|2160p|1080p|720p|480p))(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(WEB-?DL|WEBRip|BluRay|BDRip|BRRip|HDTV|HDRip|DVDrip|DVDScr|HDCAM|HC|TC|TS|CAM)(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(HDR|DV|Dolby.?Vision|HEVC|x265)(?=$|\.|\]|\)|\s|_|-)/i ]; let foundQuality = null; for (const regex of patterns) { const match = safeFilename.match(regex); if (match && match[1]) { let quality = match[1].toUpperCase(); quality = quality.replace(/WEB-?DL/i, 'WEBDL'); quality = quality.replace(/BLURAY/i, 'BluRay'); quality = quality.replace(/DVDRIP/i, 'DVD'); quality = quality.replace(/DOLBY.?VISION/i, 'Dolby Vision'); if (quality === '2160P') quality = '4K'; if (patterns.indexOf(regex) < 2) return quality; if (patterns.indexOf(regex) === 2 && !foundQuality) foundQuality = quality; } } return foundQuality; }
    function normalizeTextForSearch(text) { if (!text) return ""; return String(text) .toLowerCase() .replace(/[.\-_\(\)\[\]]/g, '') .replace(/\s+/g, ' ') .trim(); }
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    async function copyToClipboard(text, feedbackSpan) { console.log("Attempting to copy:", text); let success = false; if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) { try { await navigator.clipboard.writeText(text); success = true; console.log("navigator.clipboard.writeText SUCCEEDED"); } catch (err) { console.error("Async clipboard write failed:", err); success = false; } } if (!success) { console.warn("Using fallback copy method (execCommand)."); const textArea = document.createElement("textarea"); textArea.value = text; textArea.style.position = "fixed"; textArea.style.top = "-9999px"; textArea.style.left = "-9999px"; textArea.style.opacity = "0"; textArea.setAttribute("readonly", ""); document.body.appendChild(textArea); try { textArea.select(); textArea.setSelectionRange(0, textArea.value.length); success = document.execCommand('copy'); console.log("Fallback execCommand result:", success); } catch (err) { console.error('Fallback copy execCommand failed:', err); success = false; } finally { document.body.removeChild(textArea); } } if (success) { console.log("Copy successful!"); if (feedbackSpan) { showCopyFeedback(feedbackSpan, 'Copied!', false); } } else { console.error("Copy FAILED."); if (feedbackSpan) { showCopyFeedback(feedbackSpan, 'Copy Failed!', true); } else { alert("Copy failed. Please try again or copy manually. Check console for errors (F12)."); } } return success; }

    // --- Data Preprocessing ---
    function preprocessMovieData(movie) {
        const processed = { ...movie };
        processed.id = movie.original_id;
        processed.url = (movie.url && typeof movie.url === 'string' && movie.url.toLowerCase() !== 'null' && movie.url.trim() !== '') ? movie.url : null;
        if (processed.url) {
            processed.url = processed.url.replace(/ /g, '%20'); // Encode spaces
        }
        processed.hubcloud_link = (movie.hubcloud_link && typeof movie.hubcloud_link === 'string' && movie.hubcloud_link.toLowerCase() !== 'null' && movie.hubcloud_link.trim() !== '') ? movie.hubcloud_link : null;
        processed.gdflix_link = (movie.gdflix_link && typeof movie.gdflix_link === 'string' && movie.gdflix_link.toLowerCase() !== 'null' && movie.gdflix_link.trim() !== '') ? movie.gdflix_link : null;

        processed.displayFilename = sanitize(movie.filename || '');
        processed.sizeData = extractSizeData(movie.size_display);
        if (!processed.size_bytes && processed.sizeData.bytes > 0) { processed.size_bytes = processed.sizeData.bytes; }
        processed.displayQuality = sanitize(movie.quality || extractQualityFromFilename(processed.displayFilename) || 'N/A'); // Added fallback extraction
        if (processed.displayQuality && processed.displayQuality !== 'N/A') { uniqueQualities.add(processed.displayQuality); }
        const tsString = movie.last_updated_ts;
        let dateObject = null;
        if (tsString) { try { dateObject = new Date(tsString); } catch(e) { console.warn("Date parse error in preprocessMovieData:", e); } }
        processed.lastUpdatedTimestamp = (dateObject && !isNaN(dateObject)) ? dateObject.getTime() : 0;
        if (processed.lastUpdatedTimestamp === 0 && tsString) { console.warn(`Invalid date format received for movie ID ${processed.id}, filename "${processed.displayFilename}":`, tsString); }
        processed.numericId = typeof processed.id === 'number' ? processed.id : Infinity;
        processed.searchText = normalizeTextForSearch(`${processed.id || ''} ${processed.displayFilename}`);
        processed.isSeries = !!movie.is_series; // Keep original series flag

        // Extract Title, Year, Season for TMDb search
        processed.extractedTitle = null; processed.extractedYear = null; processed.extractedSeason = null;
        const filename = processed.displayFilename;
        if (filename) {
            // Prioritize Series matching first (SXXEXX or SXX)
            const seriesMatch = filename.match(/[. ]S(\d{1,2})(?:E\d{1,2}|[. ])/i);
            if (seriesMatch && seriesMatch[1]) {
                processed.extractedSeason = parseInt(seriesMatch[1], 10);
                processed.isSeries = true; // Force series if SXX is found
                const titleEndIndex = seriesMatch.index;
                 // Try to get year before season for title extraction
                 const yearMatchBeforeSeason = filename.substring(0, titleEndIndex).match(/[.(_[](\d{4})[.)_\]]/);
                 const effectiveTitleEnd = yearMatchBeforeSeason ? yearMatchBeforeSeason.index : titleEndIndex;
                 processed.extractedTitle = filename.substring(0, effectiveTitleEnd).replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
                 if(yearMatchBeforeSeason && yearMatchBeforeSeason[1]) {
                    const year = parseInt(yearMatchBeforeSeason[1], 10);
                    if (year > 1900 && year < 2050) processed.extractedYear = year; // Store year even for series if found before SXX
                 }
            }

            // If not detected as series, look for year for movies
            if (!processed.extractedSeason) {
                const yearMatch = filename.match(/[.(_[](\d{4})[.)_\]]/);
                if (yearMatch && yearMatch[1]) {
                    const year = parseInt(yearMatch[1], 10);
                    if (year > 1900 && year < 2050) {
                        processed.extractedYear = year;
                        const titleEndIndex = yearMatch.index;
                        processed.extractedTitle = filename.substring(0, titleEndIndex).replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
                    }
                }
            }

            // Fallback title extraction if others failed
            if (!processed.extractedTitle) {
                processed.extractedTitle = filename.split(/[\.({\[]/)[0].replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
            }

            // Clean common quality/source tags from extracted title
            if (processed.extractedTitle) {
                processed.extractedTitle = processed.extractedTitle.replace(/ (4k|2160p|1080p|720p|480p|web[- ]?dl|webrip|bluray|bdrip|brrip|hdtv|hdrip|dvdrip|dvdscr|hdr|dv|dolby[- ]?vision|hevc|x265)$/i, '').trim();
            }
        }
        return processed;
    }


    // --- HTML Generation (Includes TMDb, HubCloud and GDFLIX Bypass Buttons) ---
    function createItemDetailContentHTML(movie, tmdbDetails) { // Added tmdbDetails parameter
        // --- Existing variable setup ---
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
        const escapedUrl = movie.url ? movie.url.replace(/'/g, "\\'") : ''; // Already space-encoded if needed
        const escapedId = movie.id ? String(movie.id).replace(/[^a-zA-Z0-9-_]/g, '') : '';
        const escapedHubcloudUrl = movie.hubcloud_link ? movie.hubcloud_link.replace(/'/g, "\\'") : '';
        const escapedGdflixUrl = movie.gdflix_link ? movie.gdflix_link.replace(/'/g, "\\'") : '';

        // --- Trailer/IMDb/TMDb Link Logic ---
        let youtubeTrailerButtonHTML = '';
        let imdbSearchButtonHTML = ''; // Will become TMDb link if available
        if (movie.extractedTitle) {
            // YouTube Trailer
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

            // TMDb/IMDb Link
            const imdbIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"></path></svg>`; // Placeholder icon
            if (tmdbDetails && tmdbDetails.tmdbLink) {
                // Use direct TMDb link if we fetched it
                 const tmdbLabel = movie.isSeries ? "View on TMDb (TV)" : "View on TMDb (Movie)";
                 imdbSearchButtonHTML = `<a href="${sanitize(tmdbDetails.tmdbLink)}" target="_blank" rel="noopener noreferrer" class="button tmdb-link-button">${imdbIconSVG} ${tmdbLabel}</a>`;
            } else {
                // Fallback to Google "I'm Feeling Lucky" IMDb search
                let imdbQueryTerms = [`"${movie.extractedTitle}"`];
                if (!movie.isSeries && movie.extractedYear) { imdbQueryTerms.push(String(movie.extractedYear)); }
                imdbQueryTerms.push("IMDb");
                const imdbSearchQuery = imdbQueryTerms.join(' ');
                const imdbSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(imdbSearchQuery)}&btnI=1`;
                imdbSearchButtonHTML = `<a href="${imdbSearchUrl}" target="_blank" rel="noopener noreferrer" class="button imdb-button">${imdbIconSVG} Find on IMDb</a>`;
            }
        }

        // --- TMDb Details Section ---
        let tmdbSectionHTML = '';
        if (tmdbDetails && tmdbDetails.id) {
            const posterHTML = tmdbDetails.posterPath
                ? `<img src="${sanitize(tmdbDetails.posterPath)}" alt="Poster for ${sanitize(tmdbDetails.title)}" class="tmdb-poster" loading="lazy">` // Added lazy loading
                : '<div class="tmdb-poster-placeholder">No Poster</div>';

            const ratingHTML = tmdbDetails.voteAverage && tmdbDetails.voteCount
                 ? `<span class="tmdb-rating" title="${tmdbDetails.voteCount} votes">⭐ ${sanitize(tmdbDetails.voteAverage)}/10</span>`
                 : '';

            const genresHTML = tmdbDetails.genres && tmdbDetails.genres.length > 0
                 ? `<div class="tmdb-genres"><strong>Genres:</strong> ${tmdbDetails.genres.map(g => `<span class="genre-tag">${sanitize(g)}</span>`).join(' ')}</div>`
                 : '';

            const overviewHTML = tmdbDetails.overview
                ? `<div class="tmdb-overview"><strong>Overview:</strong><p>${sanitize(tmdbDetails.overview)}</p></div>`
                : '';

             const releaseDateHTML = tmdbDetails.releaseDate
                 ? `<div><strong>Released:</strong> ${sanitize(TimeAgo.formatFullDate(new Date(tmdbDetails.releaseDate), true))}</div>` // Use short format
                 : '';

             const runtimeHTML = tmdbDetails.runtime
                 ? `<div><strong>Runtime:</strong> ${sanitize(tmdbDetails.runtime)} min</div>`
                 : '';

             const taglineHTML = tmdbDetails.tagline
                 ? `<div class="tmdb-tagline"><em>${sanitize(tmdbDetails.tagline)}</em></div>`
                 : '';

            // Basic Actor list
             const actorsHTML = tmdbDetails.actors && tmdbDetails.actors.length > 0
                 ? `<div class="tmdb-actors">
                      <strong>Starring:</strong>
                      <ul>
                        ${tmdbDetails.actors.map(actor => `<li>${sanitize(actor.name)} ${actor.character ? `(${sanitize(actor.character)})` : ''}</li>`).join('')}
                      </ul>
                    </div>`
                 : '';


            tmdbSectionHTML = `
                <div class="tmdb-details-container">
                    <div class="tmdb-poster-column">
                        ${posterHTML}
                    </div>
                    <div class="tmdb-info-column">
                        ${tmdbDetails.title ? `<h3 class="tmdb-title">${sanitize(tmdbDetails.title)}</h3>` : ''}
                        ${taglineHTML}
                        <div class="tmdb-meta">
                            ${ratingHTML}
                            ${releaseDateHTML}
                            ${runtimeHTML}
                        </div>
                        ${genresHTML}
                        ${overviewHTML}
                         ${actorsHTML} ${ /* Optional: Added actors */}
                    </div>
                </div>
            `;
        } else if (movie.extractedTitle) {
             // Show a message if TMDb fetch was attempted but failed or timed out
             // Find the loading indicator within itemDetailContent and replace it
             const loadingSpinner = itemDetailContent?.querySelector('.loading-inline-spinner');
             if (!loadingSpinner) { // Only show failure message if main content already rendered
                tmdbSectionHTML = `<div class="tmdb-fetch-failed">Could not fetch additional details from TMDb.</div>`;
             }
        }


        // --- Button Logic (Existing + Adjustments) ---
        let urlDependentButtonsHTML = '';
        let bypassButtonsHTML = '';
        let otherLinkButtonsHTML = '';

        // 1. URL Dependent Buttons
        if (movie.url) {
             urlDependentButtonsHTML += `<button class="button play-button" data-action="play" data-title="${escapedStreamTitle}" data-url="${escapedUrl}" data-filename="${escapedFilename}"><span aria-hidden="true">▶️</span> Play here</button>`;
             urlDependentButtonsHTML += `<a class="button download-button" href="${movie.url}" download="${displayFilename}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">💾</span> Direct Download</a>`;
             urlDependentButtonsHTML += `<button class="button vlc-button" data-action="copy-vlc" data-url="${escapedUrl}"><span aria-hidden="true">📋</span> Copy URL (for VLC/MX)</button><span class="copy-feedback" role="status" aria-live="polite">Copied!</span>`;
             if (navigator.userAgent.toLowerCase().includes("android")) {
                 urlDependentButtonsHTML += `<button class="button intent-button" data-action="open-intent" data-url="${escapedUrl}"><span aria-hidden="true">📱</span> Play in VLC or MX Player</button>`;
             }
         }
         urlDependentButtonsHTML = `<div class="url-actions-container" id="url-actions-container-${escapedId}">${urlDependentButtonsHTML}</div>`;

        // 2. Bypass Buttons
        const movieRefAttr = `data-movie-ref="detail"`;
        if (movie.hubcloud_link) {
            bypassButtonsHTML += `<button class="button hubcloud-bypass-button" data-action="bypass-hubcloud" data-hubcloud-url="${escapedHubcloudUrl}" ${movieRefAttr}><span aria-hidden="true" class="button-icon">☁️</span><span class="button-spinner spinner"></span><span class="button-text">Bypass HubCloud</span></button><span class="bypass-feedback" role="status" aria-live="polite"></span>`;
        }
        if (movie.gdflix_link) {
            bypassButtonsHTML += `<button class="button gdflix-bypass-button" data-action="bypass-gdflix" data-gdflix-url="${escapedGdflixUrl}" ${movieRefAttr}><span aria-hidden="true" class="button-icon">🎬</span><span class="button-spinner spinner"></span><span class="button-text">Bypass GDFLIX</span></button><span class="bypass-feedback" role="status" aria-live="polite"></span>`;
        }

         // 3. Other Link Buttons
         otherLinkButtonsHTML += youtubeTrailerButtonHTML;
         otherLinkButtonsHTML += imdbSearchButtonHTML; // Now includes TMDb link if available
         otherLinkButtonsHTML += `<button class="button custom-url-toggle-button" data-action="toggle-custom-url" aria-expanded="false" style="display: none;"><span aria-hidden="true">🔗</span> Play Custom URL</button>`;
         if (movie.telegram_link && movie.telegram_link.toLowerCase() !== 'null') otherLinkButtonsHTML += `<a class="button telegram-button" href="${sanitize(movie.telegram_link)}" target="_blank" rel="noopener noreferrer">Telegram File</a>`;
         // Show original link only if no bypass button for that type exists OR if URL is missing
         if (movie.gdflix_link && (!movie.url || !bypassButtonsHTML.includes('bypass-gdflix'))) {
             otherLinkButtonsHTML += `<a class="button gdflix-button" href="${sanitize(movie.gdflix_link)}" target="_blank" rel="noopener noreferrer">GDFLIX Link</a>`;
         }
         if (movie.hubcloud_link && movie.hubcloud_link.toLowerCase() !== 'null' && (!movie.url || !bypassButtonsHTML.includes('bypass-hubcloud'))) {
             otherLinkButtonsHTML += `<a class="button hubcloud-button" href="${sanitize(movie.hubcloud_link)}" target="_blank" rel="noopener noreferrer">HubCloud Link</a>`;
         }
         if (movie.filepress_link) otherLinkButtonsHTML += `<a class="button filepress-button" href="${sanitize(movie.filepress_link)}" target="_blank" rel="noopener noreferrer">Filepress</a>`;
         if (movie.gdtot_link) otherLinkButtonsHTML += `<a class="button gdtot-button" href="${sanitize(movie.gdtot_link)}" target="_blank" rel="noopener noreferrer">GDToT</a>`;
         if (movie.id) { otherLinkButtonsHTML += `<button class="button share-button" data-action="share" data-id="${escapedId}" data-title="${escapedStreamTitle}" data-filename="${escapedFilename}"><span aria-hidden="true">🔗</span> Share Post</button><span class="copy-feedback share-fallback" role="status" aria-live="polite">Link copied!</span>`; }


        // --- Combine all parts ---
        const internalInfoHTML = `
            <div class="action-info" data-stream-title="${escapedStreamTitle}">
                <span class="info-item"><strong>Filename:</strong> ${displayFilename}</span>
                <span class="info-item"><strong>Quality:</strong> ${displayQuality} ${fourkLogoHtml}${hdrLogoHtml}</span>
                <span class="info-item"><strong>Size:</strong> ${displaySize}</span>
                <span class="info-item"><strong>Language:</strong> ${sanitize(movie.languages || 'N/A')}</span>
                <span class="info-item"><strong>Updated:</strong> ${formattedDateFull} (${formattedDateRelative})</span>
                ${movie.originalFilename ? `<span class="info-item"><strong>Original Name:</strong> ${sanitize(movie.originalFilename)}</span>` : ''}
            </div>
        `;

        const buttonsHTML = `
             <div class="action-buttons-container">
                 ${urlDependentButtonsHTML}
                 ${bypassButtonsHTML}
                 ${otherLinkButtonsHTML}
             </div>
        `;

        // Assemble final structure with TMDb section potentially at the top
        return `
            ${tmdbSectionHTML} ${ /* Add TMDb section */ }
            <hr class="detail-separator"> ${ /* Add a separator */ }
            ${internalInfoHTML}
            ${buttonsHTML}
            ${ /* The video player container will be appended here by JS if needed */ }
        `;
    }


    // --- Table Row HTML (View button now triggers navigation) ---
    function createMovieTableRowHTML(movie, dataIndex) {
        const displayFilename = movie.displayFilename;
        const displaySize = movie.sizeData.display;
        const displayQuality = movie.displayQuality;
        const timestampString = movie.last_updated_ts;
        const formattedDateRelative = TimeAgo.format(timestampString);
        const dateObject = timestampString ? new Date(timestampString) : null;
        const formattedDateFull = (dateObject && !isNaN(dateObject)) ? TimeAgo.formatFullDate(dateObject) : 'N/A';
        let hdrLogoHtml = ''; let fourkLogoHtml = '';
        const lowerFilename = (displayFilename || '').toLowerCase();
        if (displayQuality === '4K' || lowerFilename.includes('2160p') || lowerFilename.includes('.4k.')) { fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo fourk-logo" title="4K Ultra HD" />`; }
        if ((displayQuality || '').includes('HDR') || (displayQuality || '').includes('DOLBY VISION') || displayQuality === 'DV' || lowerFilename.includes('hdr') || lowerFilename.includes('dolby.vision') || lowerFilename.includes('.dv.')) { hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo hdr-logo" title="HDR / Dolby Vision Content" />`; }

        const mainRowHTML = `
        <tr class="movie-data-row" data-index="${dataIndex}" data-item-id="${sanitize(movie.id)}">
            <td class="col-id">${sanitize(movie.id || 'N/A')}</td>
            <td class="col-filename" title="View details for: ${displayFilename}" data-item-id="${sanitize(movie.id)}">
                ${displayFilename}${fourkLogoHtml}${hdrLogoHtml}
            </td>
            <td class="col-size">${displaySize}</td>
            <td class="col-quality">${displayQuality}</td>
            <td class="col-updated" title="${formattedDateFull}">${formattedDateRelative}</td>
            <td class="col-view">
                <button class="button view-button" data-item-id="${sanitize(movie.id)}">View</button>
            </td>
        </tr>`;
        return mainRowHTML;
    }


    // --- View Control ---
    function setViewMode(mode) {
        console.log(`Setting view mode to: ${mode}`);
        const previousMode = currentViewMode;
        currentViewMode = mode;

        if (mode !== previousMode) {
            closePlayerIfNeeded(null);
        }

        container.classList.toggle('results-active', mode === 'search');
        container.classList.toggle('item-detail-active', mode === 'itemDetail');

        const showHomepage = mode === 'homepage';
        const showSearch = mode === 'search';
        const showItemDetail = mode === 'itemDetail';

        if (searchFocusArea) searchFocusArea.style.display = (showHomepage || showSearch) ? 'flex' : 'none';
        if (resultsArea) resultsArea.style.display = showSearch ? 'block' : 'none';
        if (itemDetailView) itemDetailView.style.display = showItemDetail ? 'block' : 'none';
        if (updatesPreviewSection) updatesPreviewSection.style.display = showHomepage ? 'block' : 'none';
        if (pageFooter) pageFooter.style.display = (showHomepage || showSearch || isShareMode) ? 'flex' : 'none'; // Show footer in share mode too, hide otherwise in detail

        if (showHomepage) {
            if (searchInput) searchInput.value = '';
            currentState.searchTerm = '';
            if (suggestionsContainer) suggestionsContainer.style.display = 'none';
            activeResultsTab = 'allFiles';
            currentState.currentPage = 1;
            currentState.typeFilter = '';
            currentItemDetailData = null;
            isShareMode = false;
            if (weeklyUpdatesData.length > 0) {
                displayInitialUpdates();
            } else if (localSuggestionData.length > 0) {
                 if (updatesPreviewList) updatesPreviewList.innerHTML = '<div class="status-message" style="text-align:center; padding: 15px 0;">No recent updates found.</div>';
                 if (showMoreUpdatesButton) showMoreUpdatesButton.style.display = 'none';
            } else {
                if (updatesPreviewList) updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`;
            }
            document.title = "Cinema Ghar Index";
        } else if (showSearch) {
             currentItemDetailData = null;
             isShareMode = false;
             document.title = "Cinema Ghar Index"; // Or update with search term later
        } else if (showItemDetail) {
            // Title is set when item data loads
        }

        saveStateToLocalStorage();
        isInitialLoad = false;
    }

    window.resetToHomepage = function(event) {
        console.log("Resetting to homepage...");
        if (window.history.pushState) {
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.pushState({ path: cleanUrl }, '', cleanUrl);
        } else {
            window.location.hash = '';
        }
        isShareMode = false;
        currentItemDetailData = null;
        lastFocusedElement = event?.target;
        setViewMode('homepage');
        if (searchInput) {
            setTimeout(() => searchInput.focus(), 100);
        }
    }

    window.goBackToResults = function() {
        console.log("Navigating back from item detail view...");
        currentItemDetailData = null;
        isShareMode = false;
        // Don't clear URL here, let popstate handle it
        history.back();
    }

    window.addEventListener('popstate', (event) => {
        console.log("Popstate event triggered", event.state);
        handleUrlChange(true); // Pass true to indicate it's a popstate navigation
    });

    function handleUrlChange(isPopState = false) {
        const urlParams = new URLSearchParams(window.location.search);
        const shareId = urlParams.get('shareId');
        const viewId = urlParams.get('viewId');

        console.log(`Handling URL Change: shareId=${shareId}, viewId=${viewId}, isPopState=${isPopState}, isInitialLoad=${isInitialLoad}`);

        closePlayerIfNeeded(); // Close player on navigation

        if (shareId) {
            console.log("Displaying shared item:", shareId);
            displayItemDetail(shareId, true); // true for isShare
        } else if (viewId) {
            console.log("Displaying viewed item:", viewId);
            displayItemDetail(viewId, false); // false for isShare
        } else {
             // If we are navigating *back* to a state without shareId/viewId
             if (!isInitialLoad) {
                 console.log("Navigating back to homepage or search results view.");
                  // If the previous state was search with a term, try to restore it?
                  // For now, always go to homepage when clearing view/share ID unless search term exists
                  if (currentState.searchTerm) {
                      setViewMode('search');
                       // Re-render search results if needed (or rely on state)
                       // Might need to re-fetch if results aren't cached well
                       if (currentSearchResultsData.length === 0) {
                           fetchAndRenderResults();
                       } else {
                           // Re-render from cached data if sufficient
                           // This part needs careful state management if we want perfect back navigation
                           // For simplicity, just ensuring the view is 'search' might be enough initially
                           updateActiveTabAndPanel();
                           updateSortIndicators(tabMappings[activeResultsTab]?.tableHead);
                           updateFilterIndicator();
                       }
                  } else {
                     setViewMode('homepage');
                  }
             } else {
                 // Initial load, no specific item, ensure homepage is set
                  if (currentViewMode !== 'homepage') { // Avoid redundant call
                     setViewMode('homepage');
                  }
             }
         }
        isInitialLoad = false;
    }


    // --- Search and Suggestions Logic ---
    function handleSearchInput() { clearTimeout(suggestionDebounceTimeout); const searchTerm = searchInput.value.trim(); if (searchTerm.length < 2) { suggestionsContainer.style.display = 'none'; return; } suggestionDebounceTimeout = setTimeout(() => { fetchAndDisplaySuggestions(searchTerm); }, config.SUGGESTIONS_DEBOUNCE_DELAY); }
    function fetchAndDisplaySuggestions(term) { const normalizedTerm = normalizeTextForSearch(term); if (!normalizedTerm) { suggestionsContainer.style.display = 'none'; return; } const matchingItems = localSuggestionData.filter(movie => movie.searchText.includes(normalizedTerm)).slice(0, config.MAX_SUGGESTIONS); suggestionsContainer.innerHTML = ''; if (matchingItems.length > 0) { const fragment = document.createDocumentFragment(); matchingItems.forEach(item => { const div = document.createElement('div'); let displayText = item.displayFilename; let highlighted = false; if (term.length > 0) { try { const safeTerm = escapeRegExp(term); const regex = new RegExp(`(${safeTerm})`, 'i'); if ((item.displayFilename || '').match(regex)) { div.innerHTML = (item.displayFilename || '').replace(regex, '<strong>$1</strong>'); highlighted = true; } } catch (e) { console.warn("Regex error during highlighting:", e); } } if (!highlighted) { div.textContent = item.displayFilename; } div.title = item.displayFilename; div.onclick = () => selectSuggestion(item.displayFilename); fragment.appendChild(div); }); suggestionsContainer.appendChild(fragment); suggestionsContainer.style.display = 'block'; } else { suggestionsContainer.style.display = 'none'; } }
    function selectSuggestion(selectedValue) { searchInput.value = selectedValue; suggestionsContainer.style.display = 'none'; handleSearchSubmit(); }
    window.handleSearchSubmit = function() { if (suggestionsContainer) { suggestionsContainer.style.display = 'none'; } const searchTerm = searchInput.value.trim(); console.log("Handling search submit for:", searchTerm); if (searchInput) { searchInput.blur(); } if (searchTerm.length === 0 && currentViewMode !== 'homepage') { resetToHomepage(); return; } if (searchTerm.length === 0 && currentViewMode === 'homepage') { return; }
        if (currentViewMode === 'itemDetail') {
            const cleanUrl = window.location.origin + window.location.pathname;
             history.pushState({ path: cleanUrl }, '', cleanUrl);
        }
        setViewMode('search');
        activeResultsTab = 'allFiles';
        currentState.currentPage = 1;
        currentState.searchTerm = searchTerm;
        currentState.qualityFilter = qualityFilterSelect.value || '';
        currentState.typeFilter = ''; // Reset to 'all' on new search
        updateActiveTabAndPanel();
        showLoadingStateInTables(`Searching for "${sanitize(searchTerm)}"...`);
        fetchAndRenderResults();
    }
    function handleSearchClear() { clearTimeout(suggestionDebounceTimeout); suggestionsContainer.style.display = 'none';
        setTimeout(() => {
            if (searchInput.value.trim() === '') {
                 if (currentViewMode === 'search') {
                    console.log("Search input cleared via 'x' while in search view, resetting to homepage.");
                    resetToHomepage();
                 } else {
                    currentState.searchTerm = '';
                    saveStateToLocalStorage();
                 }
            }
        }, 100);
    }
    function showLoadingStateInTables(message = 'Loading...') { const loadingHTML = `<tr><td colspan="6" class="loading-message" role="status" aria-live="polite"><div class="spinner"></div>${sanitize(message)}</td></tr>`; Object.values(tabMappings).forEach(mapping => { if (mapping?.tableBody) { mapping.tableBody.innerHTML = loadingHTML; } if (mapping?.pagination) { mapping.pagination.style.display = 'none'; } }); }

    // --- Updates Preview Logic ---
    async function loadUpdatesPreview() { if (currentViewMode !== 'homepage' || !updatesPreviewSection || !updatesPreviewList || !showMoreUpdatesButton) return; updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`; showMoreUpdatesButton.style.display = 'none'; updatesPreviewShownCount = 0; weeklyUpdatesData = []; try { const params = { sort: 'lastUpdated', sortDir: 'desc', limit: config.UPDATES_PREVIEW_INITIAL_COUNT + config.UPDATES_PREVIEW_LOAD_MORE_COUNT, page: 1 }; // Fetch a bit more initially
         const data = await fetchApiData(params); if (data && data.items && data.items.length > 0) { weeklyUpdatesData = data.items.map(preprocessMovieData); displayInitialUpdates(); console.log(`Loaded initial ${weeklyUpdatesData.length} updates. Total pages from API: ${data.totalPages}`); } else { updatesPreviewList.innerHTML = '<div class="status-message" style="text-align:center; padding: 15px 0;">No recent updates found.</div>'; showMoreUpdatesButton.style.display = 'none'; } } catch (error) { console.error("Failed to load updates preview:", error); updatesPreviewList.innerHTML = `<div class="error-message" style="text-align:center; padding: 15px 0;">Could not load updates. ${error.message}</div>`; showMoreUpdatesButton.style.display = 'none'; } }
    function displayInitialUpdates() { if (!updatesPreviewList || !showMoreUpdatesButton) return; updatesPreviewList.innerHTML = ''; updatesPreviewShownCount = 0; if (weeklyUpdatesData.length === 0) { updatesPreviewList.innerHTML = '<div class="status-message" style="text-align:center; padding: 15px 0;">No recent updates found.</div>'; showMoreUpdatesButton.style.display = 'none'; return; } const initialCount = Math.min(weeklyUpdatesData.length, config.UPDATES_PREVIEW_INITIAL_COUNT); appendUpdatesToPreview(0, initialCount); updatesPreviewShownCount = initialCount; const potentiallyMore = weeklyUpdatesData.length > initialCount; // Check if more *fetched* data exists
         if (potentiallyMore) { showMoreUpdatesButton.style.display = 'block'; showMoreUpdatesButton.disabled = false; showMoreUpdatesButton.textContent = "Show More"; } else { showMoreUpdatesButton.style.display = 'none'; } }
    window.appendMoreUpdates = async function() { if (!updatesPreviewList || !showMoreUpdatesButton) return;
        const currentlyDisplayed = updatesPreviewShownCount;
        const nextBatchEnd = Math.min(currentlyDisplayed + config.UPDATES_PREVIEW_LOAD_MORE_COUNT, weeklyUpdatesData.length);

        if (nextBatchEnd > currentlyDisplayed) { // More data already fetched
            showMoreUpdatesButton.disabled = true; showMoreUpdatesButton.textContent = "Loading...";
            await new Promise(resolve => setTimeout(resolve, 150)); // Simulate loading
            appendUpdatesToPreview(currentlyDisplayed, nextBatchEnd);
            updatesPreviewShownCount = nextBatchEnd;
            if (updatesPreviewShownCount < weeklyUpdatesData.length) {
                 showMoreUpdatesButton.disabled = false; showMoreUpdatesButton.textContent = "Show More";
            } else {
                 // We've shown all fetched, check if API might have more
                 const currentApiPageEstimate = Math.ceil(weeklyUpdatesData.length / (config.UPDATES_PREVIEW_INITIAL_COUNT + config.UPDATES_PREVIEW_LOAD_MORE_COUNT)); // Rough estimate
                 // Ideally, the initial fetch response would tell us totalItems or totalPages
                 // Without that, assume there might be more and try fetching again
                 console.log("Displayed all fetched updates, attempting to load more from API.");
                 await loadMoreUpdatesFromApi();
            }
        } else { // No more fetched data, try API
             await loadMoreUpdatesFromApi();
        }
    }
    async function loadMoreUpdatesFromApi() {
         if (!showMoreUpdatesButton) return;
         showMoreUpdatesButton.disabled = true; showMoreUpdatesButton.textContent = "Loading...";
         const nextPage = Math.ceil(weeklyUpdatesData.length / config.UPDATES_PREVIEW_LOAD_MORE_COUNT) + 1; // Calculate next page based on total items fetched so far
         console.log(`Attempting to load page ${nextPage} for updates preview from API.`);
         try {
             const params = { sort: 'lastUpdated', sortDir: 'desc', limit: config.UPDATES_PREVIEW_LOAD_MORE_COUNT, page: nextPage };
             const data = await fetchApiData(params);
             if (data && data.items && data.items.length > 0) {
                 const newItems = data.items.map(preprocessMovieData);
                 const startIndex = weeklyUpdatesData.length;
                 weeklyUpdatesData.push(...newItems);
                 const appendEndIndex = Math.min(startIndex + config.UPDATES_PREVIEW_LOAD_MORE_COUNT, weeklyUpdatesData.length); // Append only the newly fetched count
                 appendUpdatesToPreview(startIndex, appendEndIndex);
                 updatesPreviewShownCount = appendEndIndex; // Update count based on what was just added
                 console.log(`Loaded ${newItems.length} more updates from API. Total fetched: ${weeklyUpdatesData.length}. Displayed: ${updatesPreviewShownCount}. API page: ${data.page}, Total API pages: ${data.totalPages}`);

                 if (updatesPreviewShownCount < weeklyUpdatesData.length || (data.page < data.totalPages)) {
                     showMoreUpdatesButton.disabled = false; showMoreUpdatesButton.textContent = "Show More";
                 } else {
                     showMoreUpdatesButton.textContent = "All Updates Shown";
                 }
             } else {
                 console.log("No more updates found from API.");
                 showMoreUpdatesButton.textContent = "No More Updates";
             }
         } catch (error) {
             console.error("Failed to load more updates from API:", error);
             showMoreUpdatesButton.textContent = "Error Loading";
             showMoreUpdatesButton.disabled = false; // Allow retry
         }
     }
    function appendUpdatesToPreview(startIndex, endIndex) {
        if (!updatesPreviewList) return;
        const fragment = document.createDocumentFragment();
        const itemsToAppend = weeklyUpdatesData.slice(startIndex, endIndex);
        itemsToAppend.forEach((movie, indexInSlice) => {
            const overallIndex = startIndex + indexInSlice;
            if (!movie || !movie.id) return;

            const itemDiv = document.createElement('div');
            itemDiv.className = 'update-item';
            itemDiv.dataset.index = overallIndex;
            itemDiv.dataset.itemId = sanitize(movie.id);

            let hdrLogoHtml = ''; let fourkLogoHtml = '';
            const lowerFilename = (movie.displayFilename || '').toLowerCase();
            if (movie.displayQuality === '4K' || lowerFilename.includes('2160p') || lowerFilename.includes('.4k.')) { fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo fourk-logo" title="4K Ultra HD" />`; }
            if ((movie.displayQuality || '').includes('HDR') || (movie.displayQuality || '').includes('DOLBY VISION') || movie.displayQuality === 'DV' || lowerFilename.includes('hdr') || lowerFilename.includes('dolby.vision') || lowerFilename.includes('.dv.')) { hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo hdr-logo" title="HDR / Dolby Vision Content" />`; }
            const timestampString = movie.last_updated_ts;
            const formattedDateRelative = TimeAgo.format(timestampString);
            const dateObject = timestampString ? new Date(timestampString) : null;
            const formattedDateFull = (dateObject && !isNaN(dateObject)) ? TimeAgo.formatFullDate(dateObject) : 'N/A';

            itemDiv.innerHTML = `
                <div class="preview-col-id" title="ID: ${sanitize(movie.id || 'N/A')}">${sanitize(movie.id || 'N/A')}</div>
                <div class="preview-col-filename" title="View details for: ${movie.displayFilename}" data-item-id="${sanitize(movie.id)}">
                    ${sanitize(movie.displayFilename)}${fourkLogoHtml}${hdrLogoHtml}
                </div>
                <div class="preview-col-date" title="${formattedDateFull}">
                    ${formattedDateRelative}
                </div>
                <div class="preview-col-view">
                    <button class="button view-button" data-item-id="${sanitize(movie.id)}">View</button>
                </div>
            `;
            fragment.appendChild(itemDiv);
        });
        const initialLoader = updatesPreviewList.querySelector('.loading-inline-spinner');
        if (initialLoader && startIndex === 0) {
            initialLoader.remove();
        }
        updatesPreviewList.appendChild(fragment);
    }


    // --- Filtering, Sorting ---
    function triggerFilterChange() { if (!qualityFilterSelect || currentViewMode !== 'search') return; const newQualityFilter = qualityFilterSelect.value; if (newQualityFilter !== currentState.qualityFilter) { currentState.qualityFilter = newQualityFilter; currentState.currentPage = 1; closePlayerIfNeeded(null); showLoadingStateInTables(`Applying filter: ${sanitize(newQualityFilter || 'All Qualities')}...`); fetchAndRenderResults(); } }
    function handleSort(event) { const header = event.target.closest('th.sortable'); if (!header || currentViewMode !== 'search') return; const sortKey = header.dataset.sortKey; if (!sortKey) return; const oldSortColumn = currentState.sortColumn; const oldSortDirection = currentState.sortDirection; if (currentState.sortColumn === sortKey) { currentState.sortDirection = currentState.sortDirection === 'asc' ? 'desc' : 'asc'; } else { currentState.sortColumn = sortKey; currentState.sortDirection = ['filename', 'quality'].includes(sortKey) ? 'asc' : ['id','size','lastUpdated'].includes(sortKey) ? 'desc' : 'desc'; } // Default sort direction
        if (oldSortColumn !== currentState.sortColumn || oldSortDirection !== currentState.sortDirection) { currentState.currentPage = 1; closePlayerIfNeeded(null); showLoadingStateInTables(`Sorting by ${sanitize(sortKey)} (${currentState.sortDirection})...`); fetchAndRenderResults(); } }

    // --- Rendering Logic ---
     function renderActiveResultsView(apiResponse) {
         if (currentViewMode !== 'search' || !tabMappings[activeResultsTab]) {
             if (currentViewMode === 'search') { showLoadingStateInTables('Enter search term above.'); }
             return;
         }
         console.log(`Rendering results for tab: ${activeResultsTab}`, apiResponse);
         console.time("renderActiveResultsView");
         const { tableBody, pagination, tableHead } = tabMappings[activeResultsTab];
         if (!tableBody || !pagination) { console.error("Missing table body or pagination controls for tab:", activeResultsTab); console.timeEnd("renderActiveResultsView"); return; }
         const itemsToRender = apiResponse.items || [];
         const totalItems = apiResponse.totalItems || 0;
         const currentPage = apiResponse.page || 1;
         const totalPages = apiResponse.totalPages || 1;

         // Store *processed* results data specific to this search/tab state
         currentSearchResultsData = itemsToRender.map(preprocessMovieData);

         let tableHtml = '';
         if (totalItems === 0) {
             let message = `No ${tabMappings[activeResultsTab].typeFilter || 'files'} found`;
             if (currentState.searchTerm) message += ` matching "${sanitize(currentState.searchTerm)}"`;
             if (currentState.qualityFilter) message += ` with quality "${sanitize(currentState.qualityFilter)}"`;
             message += '.';
             tableHtml = `<tr><td colspan="6" class="status-message">${message}</td></tr>`;
         } else {
             currentSearchResultsData.forEach((movie, indexOnPage) => {
                 tableHtml += createMovieTableRowHTML(movie, indexOnPage);
             });
         }
         tableBody.innerHTML = tableHtml;
         renderPaginationControls(pagination, totalItems, currentPage, totalPages);
         updateActiveTabAndPanel();
         if (tableHead) updateSortIndicators(tableHead);
         updateFilterIndicator();
         console.timeEnd("renderActiveResultsView");
     }
    function renderPaginationControls(targetContainer, totalItems, currentPage, totalPages) { if (!targetContainer) return; if (totalItems === 0 || totalPages <= 1) { targetContainer.innerHTML = ''; targetContainer.style.display = 'none'; return; } targetContainer.dataset.totalPages = totalPages; targetContainer.innerHTML = ''; let paginationHTML = ''; const maxPagesToShow = 5; const halfPages = Math.floor(maxPagesToShow / 2); paginationHTML += `<button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled title="First page"' : 'title="Previous page"'}>« Prev</button>`; let startPage, endPage; if (totalPages <= maxPagesToShow + 2) { startPage = 1; endPage = totalPages; } else { startPage = Math.max(2, currentPage - halfPages); endPage = Math.min(totalPages - 1, currentPage + halfPages); if (currentPage - halfPages < 2) { endPage = Math.min(totalPages - 1, maxPagesToShow); } if (currentPage + halfPages > totalPages - 1) { startPage = Math.max(2, totalPages - maxPagesToShow + 1); } } if (startPage > 1) { paginationHTML += `<button onclick="changePage(1)" title="Page 1">1</button>`; if (startPage > 2) { paginationHTML += `<span class="page-info" title="Skipped pages">...</span>`; } } for (let i = startPage; i <= endPage; i++) { paginationHTML += (i === currentPage) ? `<span class="current-page">${i}</span>` : `<button onclick="changePage(${i})" title="Page ${i}">${i}</button>`; } if (endPage < totalPages) { if (endPage < totalPages - 1) { paginationHTML += `<span class="page-info" title="Skipped pages">...</span>`; } paginationHTML += `<button onclick="changePage(${totalPages})" title="Page ${totalPages}">${totalPages}</button>`; } paginationHTML += `<button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled title="Last page"' : 'title="Next page"'}>Next »</button>`; targetContainer.innerHTML = paginationHTML; targetContainer.style.display = 'block'; }
    function updateSortIndicators(tableHeadElement) { if (!tableHeadElement) return; tableHeadElement.querySelectorAll('th.sortable').forEach(th => { th.classList.remove('sort-asc', 'sort-desc'); const sortKey = th.dataset.sortKey; if (sortKey === currentState.sortColumn) { const directionClass = currentState.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc'; th.classList.add(directionClass); th.setAttribute('aria-sort', currentState.sortDirection === 'asc' ? 'ascending' : 'descending'); } else { th.removeAttribute('aria-sort'); } }); }
    function updateFilterIndicator() { if(qualityFilterSelect) { qualityFilterSelect.classList.toggle('filter-active', !!currentState.qualityFilter); } }
    function updateActiveTabAndPanel() { Object.keys(tabMappings).forEach(tabId => { const mapping = tabMappings[tabId]; const isActive = tabId === activeResultsTab; if (mapping?.button) mapping.button.classList.toggle('active', isActive); if (mapping?.panel) mapping.panel.classList.toggle('active', isActive); }); }


    // --- Pagination and Tab Switching ---
    window.changePage = function(newPage) { if (currentViewMode !== 'search' || newPage < 1 || newPage === currentState.currentPage) { return; } const currentPagination = tabMappings[activeResultsTab]?.pagination; if(currentPagination && currentPagination.dataset.totalPages) { const totalP = parseInt(currentPagination.dataset.totalPages, 10); if(newPage > totalP) { console.log(`Change page request to ${newPage} denied, exceeds total pages (${totalP}).`); return; } } currentState.currentPage = newPage; closePlayerIfNeeded(null); showLoadingStateInTables(`Loading page ${newPage}...`); fetchAndRenderResults().then(() => { const activeTableBody = tabMappings[activeResultsTab]?.tableBody; scrollToTopOfActiveTable(activeTableBody); }); saveStateToLocalStorage(); }
    function scrollToTopOfActiveTable(tableBodyElement) { if (!tableBodyElement) return; const tableContainer = tableBodyElement.closest('.table-container'); if (tableContainer) { const searchBarArea = container.querySelector('#search-focus-area'); const backButtonElem = resultsArea.querySelector('#backToHomeButtonResults'); const filterArea = resultsArea.querySelector('.results-filter-area'); const tabNav = resultsArea.querySelector('.tab-navigation'); let stickyHeaderHeight = 0; if (container.classList.contains('results-active')) { stickyHeaderHeight = (searchBarArea?.offsetHeight || 0) + (backButtonElem?.offsetHeight || 0) + (backButtonElem ? parseFloat(getComputedStyle(backButtonElem).marginBottom) : 0) + (filterArea?.offsetHeight || 0) + (tabNav?.offsetHeight || 0); } const elementTop = tableContainer.getBoundingClientRect().top + window.pageYOffset; const scrollPosition = elementTop - stickyHeaderHeight - 20; window.scrollTo({ top: scrollPosition, behavior: 'smooth' }); } }
    window.switchTab = function(tabId) { if (currentViewMode !== 'search' || tabId === activeResultsTab || !tabMappings[tabId]) { return; } activeResultsTab = tabId; currentState.currentPage = 1; currentState.typeFilter = tabMappings[tabId].typeFilter; closePlayerIfNeeded(null);
         updateActiveTabAndPanel(); showLoadingStateInTables(`Loading ${tabMappings[tabId].typeFilter || 'all files'}...`); fetchAndRenderResults(); saveStateToLocalStorage(); }

    // --- Action Row Logic - REMOVED ---

    // --- Navigation to Item Detail View ---
    function navigateToItemView(itemId) {
        if (!itemId) {
            console.error("Cannot navigate: Item ID is missing.");
            return;
        }
        console.log(`Navigating to view item: ${itemId}`);
        lastFocusedElement = document.activeElement;

        const newUrl = `${window.location.origin}${window.location.pathname}?viewId=${encodeURIComponent(itemId)}`;

        try {
            history.pushState({ viewId: itemId }, '', newUrl);
            displayItemDetail(itemId, false); // false = not a share link
        } catch (e) {
            console.error("History pushState failed:", e);
            // Fallback: Reload page with the new URL?
             // window.location.href = newUrl; // Uncomment if pushState fails catastrophically
        }
    }


    // --- Share Logic ---
    async function handleShareClick(buttonElement) { const itemId = buttonElement.dataset.id; const itemTitle = buttonElement.dataset.title || "Cinema Ghar Item"; const itemFilename = buttonElement.dataset.filename || ""; if (!itemId) { console.error("Share failed: Item ID missing."); alert("Cannot share this item (missing ID)."); return; } const shareUrl = `${window.location.origin}${window.location.pathname}?shareId=${encodeURIComponent(itemId)}`; const shareText = `Check out: ${itemTitle}\n${itemFilename ? `(${itemFilename})\n` : ''}`; const feedbackSpan = buttonElement.nextElementSibling; if (!feedbackSpan || !feedbackSpan.classList.contains('copy-feedback')) { console.warn("Share fallback feedback span not found next to button:", buttonElement); } if (navigator.share) { try { await navigator.share({ title: itemTitle, text: shareText, url: shareUrl, }); console.log('Successful share'); } catch (error) { console.error('Error sharing:', error); if (error.name !== 'AbortError') { if (feedbackSpan) { showCopyFeedback(feedbackSpan, 'Share failed!', true); } else { alert(`Share failed: ${error.message}`); } } } } else { console.log('Web Share API not supported, falling back to copy.'); await copyToClipboard(shareUrl, feedbackSpan); } }

    // --- Item Detail Display Logic (Handles both shareId and viewId + TMDb) ---
    async function displayItemDetail(itemId, isFromShareLink) {
        if (!itemId || !itemDetailView || !itemDetailContent) return;

        isShareMode = isFromShareLink; // Set the mode flag
        itemDetailContent.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading item details...</span></div>`;
        setViewMode('itemDetail'); // Set the main view mode
        currentItemDetailData = null; // Clear previous internal data
        let tmdbDetails = null; // Variable to hold TMDb data

        // Show the correct back button
        if (backToHomeButtonShared) backToHomeButtonShared.style.display = isShareMode ? 'inline-flex' : 'none';
        if (backToResultsButton) backToResultsButton.style.display = isShareMode ? 'none' : 'inline-flex';

        try {
            // 1. Fetch internal item data first
            const params = { id: itemId };
            const internalData = await fetchApiData(params);

            if (internalData && internalData.items && internalData.items.length > 0) {
                const itemRaw = internalData.items[0];
                currentItemDetailData = preprocessMovieData(itemRaw); // Store the fetched internal data
                console.log(`Displaying item detail for: ${currentItemDetailData.displayFilename} (isShare: ${isShareMode})`);

                // Set title early based on internal data
                document.title = `${currentItemDetailData.displayFilename || 'Item Detail'} - Cinema Ghar`;

                // Render initial content without TMDb first (optional, improves perceived speed)
                // const initialContentHTML = createItemDetailContentHTML(currentItemDetailData, null);
                // itemDetailContent.innerHTML = initialContentHTML;

                // --- START TMDb Fetch ---
                if (currentItemDetailData.extractedTitle) {
                    console.log(`Fetching TMDb details for: ${currentItemDetailData.extractedTitle}`);
                    const tmdbQuery = new URLSearchParams();
                    tmdbQuery.set('query', currentItemDetailData.extractedTitle);
                    tmdbQuery.set('type', currentItemDetailData.isSeries ? 'tv' : 'movie');
                    if (!currentItemDetailData.isSeries && currentItemDetailData.extractedYear) {
                        tmdbQuery.set('year', currentItemDetailData.extractedYear);
                    }

                    const tmdbUrl = `${config.TMDB_API_PROXY_URL}?${tmdbQuery.toString()}`;
                    const tmdbController = new AbortController();
                    const tmdbTimeoutId = setTimeout(() => tmdbController.abort(), config.TMDB_FETCH_TIMEOUT);

                    try {
                        const tmdbResponse = await fetch(tmdbUrl, { signal: tmdbController.signal });
                        clearTimeout(tmdbTimeoutId);
                        if (tmdbResponse.ok) {
                            tmdbDetails = await tmdbResponse.json();
                            console.log("TMDb details fetched successfully:", tmdbDetails);
                        } else {
                            const errorBody = await tmdbResponse.text(); // Read body even if not JSON
                            console.warn(`Failed to fetch TMDb details (${tmdbResponse.status}): ${errorBody}`);
                        }
                    } catch (tmdbError) {
                        clearTimeout(tmdbTimeoutId);
                        if (tmdbError.name === 'AbortError') {
                           console.warn(`TMDb fetch timed out or aborted for: ${currentItemDetailData.extractedTitle}`);
                        } else {
                           console.error("Error fetching TMDb details:", tmdbError);
                        }
                    }
                } else {
                    console.warn("Cannot fetch TMDb details: No extracted title found.");
                }
                // --- END TMDb Fetch ---

                // 2. Render (or re-render) content using BOTH internal and TMDb data
                const finalContentHTML = createItemDetailContentHTML(currentItemDetailData, tmdbDetails);
                itemDetailContent.innerHTML = finalContentHTML;

                // Ensure player is hidden initially when showing details
                if (videoContainer) videoContainer.style.display = 'none';

            } else {
                console.error(`Item not found via API for ID: ${itemId}`);
                itemDetailContent.innerHTML = `<div class="error-message" role="alert">Error: Item with ID ${sanitize(itemId)} was not found. It might have been removed or the link is incorrect.</div>`;
                document.title = "Item Not Found - Cinema Ghar Index";
            }
        } catch (error) {
            console.error("Failed to fetch or display item detail:", error);
            itemDetailContent.innerHTML = `<div class="error-message" role="alert">Error loading item: ${error.message}. Please try again.</div>`;
            document.title = "Error Loading Item - Cinema Ghar Index";
        } finally {
            // Ensure view mode is correct and scroll to top
            setViewMode('itemDetail'); // Re-affirm view mode
            window.scrollTo({ top: 0, behavior: 'smooth' });
             // Hide page loader if it's still visible
             if (pageLoader && pageLoader.style.display !== 'none') {
                pageLoader.style.display = 'none';
             }
        }
    }

    // --- Player Logic ---
    function streamVideo(title, url, filenameForAudioCheck, isFromCustom = false) {
        let currentActionContainer = null;
        if (isGlobalCustomUrlMode) {
             // Player stays in its global container (usually attached to #cinemaghar-container)
             currentActionContainer = container;
        } else if (currentViewMode === 'itemDetail' && itemDetailContent) {
            currentActionContainer = itemDetailContent; // Player goes inside item detail content
        } else {
            console.error("Cannot determine where to place the video player.");
            return;
        }

        if (!videoContainer || !videoElement || !currentActionContainer) { console.error("Cannot stream: player, video element, or target container missing."); return; }

        if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none';
        if (videoElement) videoElement.style.display = 'block';
        if (customControlsContainer) customControlsContainer.style.display = 'flex';
        if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; }
        if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; }
        clearCopyFeedback();

        // Move the player container if needed
         if (videoContainer.parentElement !== currentActionContainer) {
             console.log("Moving video container to:", currentActionContainer.id || currentActionContainer.tagName);
             if (videoContainer.parentElement) {
                 videoContainer.parentElement.removeChild(videoContainer);
             }
             currentActionContainer.appendChild(videoContainer);
             // Reset source if moving to prevent issues
             if (videoElement.hasAttribute('src')) {
                 videoElement.pause();
                 videoElement.removeAttribute('src');
                 videoElement.currentTime = 0;
                 videoElement.load(); // Important to reset internal state
             }
             if (vlcBox) vlcBox.style.display = 'none'; // Hide VLC box when moving
         }


        const savedVolume = localStorage.getItem(config.PLAYER_VOLUME_KEY);
        const savedSpeed = localStorage.getItem(config.PLAYER_SPEED_KEY);
        videoElement.volume = (savedVolume !== null) ? Math.max(0, Math.min(1, parseFloat(savedVolume))) : 1;
        if (volumeSlider) volumeSlider.value = videoElement.volume;
        videoElement.muted = (videoElement.volume === 0);
        videoElement.playbackRate = (savedSpeed !== null) ? parseFloat(savedSpeed) : 1;
        if(playbackSpeedSelect) playbackSpeedSelect.value = String(videoElement.playbackRate);
        updateMuteButton();
        videoElement.currentTime = 0;

        const ddp51Regex = /\bDDP?([ ._-]?5\.1)?\b/i; const advancedAudioRegex = /\b(DTS|ATMOS|TrueHD)\b/i; const multiAudioHintRegex = /\b(Multi|Dual)[ ._-]?Audio\b/i;
        let warningText = "";
        if (filenameForAudioCheck && !isFromCustom) { const lowerFilename = (filenameForAudioCheck || '').toLowerCase(); if (ddp51Regex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DDP audio might not work in browser. Use 'Copy URL' or 'Play in VLC or MX Player'."; } else if (advancedAudioRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DTS/Atmos/TrueHD audio likely unsupported. Use external player."; } else if (multiAudioHintRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> May contain multiple audio tracks. Use selector below or external player."; } }
        if (warningText && audioWarningDiv) { audioWarningDiv.innerHTML = warningText; audioWarningDiv.style.display = 'block'; }

        if (videoTitle) videoTitle.innerText = title || "Video";
        if (vlcText) vlcText.innerText = url;
        if (vlcBox) vlcBox.style.display = 'block';

        videoElement.src = url;
        videoElement.load(); // Explicitly load the new source
        videoElement.play().catch(e => { console.log("Autoplay was prevented or failed:", e.message); });

        if (videoContainer.style.display === 'none') {
            videoContainer.style.display = 'flex';
        }

         // Scroll and focus logic
         const elementToFocus = videoContainer.querySelector('.close-btn');
         if (elementToFocus) { setTimeout(() => elementToFocus.focus(), 100); }
         // Scroll only if not in global mode (which is fixed position)
         if (!isGlobalCustomUrlMode) {
             setTimeout(() => {
                 const containerTop = videoContainer.getBoundingClientRect().top + window.pageYOffset;
                 const offset = 20; // Space from the top edge
                 const headerHeight = container.classList.contains('item-detail-active') ? 0 : (searchFocusArea?.offsetHeight || 0); // Approx header height if applicable
                 window.scrollTo({ top: containerTop - headerHeight - offset, behavior: 'smooth' });
             }, 150);
         }
    }
    window.closePlayer = function(elementToFocusAfter = null) {
         if (elementToFocusAfter instanceof Event) { elementToFocusAfter = elementToFocusAfter?.target; }
         if (!videoContainer || !videoElement) return;

         const wasPlaying = videoContainer.style.display !== 'none';
         const parentContainer = videoContainer.parentElement;
         const wasGlobalMode = isGlobalCustomUrlMode;

         try { const fsElement = document.fullscreenElement || document.webkitFullscreenElement; if (fsElement && (fsElement === videoElement || fsElement === videoContainer)) { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } } catch(err) { console.error("Error exiting fullscreen:", err); }

         videoElement.pause(); videoElement.removeAttribute('src'); videoElement.currentTime = 0; videoElement.load();

         videoContainer.style.display = 'none';
         videoContainer.classList.remove('global-custom-url-mode', 'is-fullscreen');
         isGlobalCustomUrlMode = false;

         if (vlcBox) vlcBox.style.display = 'none';
         if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; }
         if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; }
         if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none'; if (playerCustomUrlInput) playerCustomUrlInput.value = '';
         if (playerCustomUrlFeedback) playerCustomUrlFeedback.textContent = '';
         clearCopyFeedback();
         clearBypassFeedback();
         if (videoTitle) videoTitle.innerText = '';

         // Move player back to main container only if it's not already there
          if (container && videoContainer.parentElement !== container) {
              if (parentContainer && parentContainer.contains(videoContainer)) {
                  parentContainer.removeChild(videoContainer);
                  container.appendChild(videoContainer); // Re-attach to main container
                  console.log("Moved video player back to main container.");
              }
          }

         // Restore focus
         let finalFocusTarget = elementToFocusAfter || lastFocusedElement;
          if (!wasGlobalMode && currentViewMode === 'itemDetail') {
              const playButton = itemDetailContent?.querySelector('.play-button');
              if (playButton) {
                  finalFocusTarget = playButton;
              } else {
                  const firstButton = itemDetailContent?.querySelector('.button');
                  if (firstButton) finalFocusTarget = firstButton;
                   else if (backToResultsButton && backToResultsButton.style.display !== 'none') finalFocusTarget = backToResultsButton;
                   else if (backToHomeButtonShared && backToHomeButtonShared.style.display !== 'none') finalFocusTarget = backToHomeButtonShared;
              }
          } else if (wasGlobalMode) {
              // Focus the global button that triggered it
              finalFocusTarget = playCustomUrlGlobalButton || lastFocusedElement;
          }


         if (finalFocusTarget && typeof finalFocusTarget.focus === 'function') {
             console.log("Returning focus to:", finalFocusTarget);
             setTimeout(() => finalFocusTarget.focus(), 50);
         } else if (searchInput && currentViewMode === 'homepage') {
             // Fallback focus to search on homepage if no specific target
             setTimeout(() => searchInput.focus(), 50);
         }
         lastFocusedElement = null;
    }
    function closePlayerIfNeeded(elementToFocusAfter = null) { if (videoContainer?.style.display !== 'none') { closePlayer(elementToFocusAfter); } }
    window.seekVideo = function(seconds) { if (videoElement) videoElement.currentTime += seconds; }
    window.toggleMute = function() { if (videoElement) videoElement.muted = !videoElement.muted; updateMuteButton(); /* Update UI immediately */ }
    window.setVolume = function(value) { if (videoElement) { const vol = parseFloat(value); videoElement.volume = vol; videoElement.muted = (vol === 0); updateMuteButton(); /* Update UI */ } }
    window.setPlaybackSpeed = function(value) { if (videoElement) videoElement.playbackRate = parseFloat(value); }
    window.toggleFullscreen = function() { const elementToMakeFullscreen = videoContainer; if (!elementToMakeFullscreen) return; const fsElement = document.fullscreenElement || document.webkitFullscreenElement; try { if (!fsElement) { if (elementToMakeFullscreen.requestFullscreen) elementToMakeFullscreen.requestFullscreen(); else if (elementToMakeFullscreen.webkitRequestFullscreen) elementToMakeFullscreen.webkitRequestFullscreen(); } else { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } } catch (err) { console.error("Fullscreen API error:", err); alert("Fullscreen mode failed. Browser might block it."); } }
    window.changeAudioTrack = function(selectElement) { if (!videoElement || !videoElement.audioTracks) return; const selectedTrackValue = selectElement.value; const tracks = videoElement.audioTracks; let trackChanged = false; for (let i = 0; i < tracks.length; i++) { const track = tracks[i]; const isSelectedTrack = (track.id && track.id === selectedTrackValue) || String(i) === selectedTrackValue; if (track.enabled !== isSelectedTrack) { try { track.enabled = isSelectedTrack; if (isSelectedTrack) console.log("Enabled audio track:", track.label || track.id || i); trackChanged = true; } catch (e) { console.error("Error changing audio track state for track:", track.id || i, e); } } } if (!trackChanged) console.warn("Selected audio track already active or no change applied."); }
    function togglePlayPause() { if (videoElement) { if (videoElement.paused || videoElement.ended) videoElement.play().catch(e => console.log("Play error:", e.message)); else videoElement.pause(); } }
    function updateMuteButton() { if (!videoElement || !muteButton) return; const isMuted = videoElement.muted || videoElement.volume === 0; muteButton.textContent = isMuted ? "Unmute" : "Mute"; muteButton.setAttribute('aria-pressed', String(isMuted)); if (volumeSlider) { volumeSlider.style.opacity = isMuted ? '0.5' : '1'; volumeSlider.disabled = isMuted; if (isMuted && videoElement.volume > 0) { // If muted by button but volume exists, keep slider value
            // Do nothing to slider value
         } else if (!isMuted && videoElement.volume === 0) { // If unmuted but volume is 0, set a default
             const defaultUnmuteVolume = 0.5;
             videoElement.volume = defaultUnmuteVolume;
             volumeSlider.value = defaultUnmuteVolume;
         } else { // Sync slider with current volume if not muted
             volumeSlider.value = videoElement.volume;
         } } }
    function handleFullscreenChange() { const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement); if (!videoContainer) return; videoContainer.classList.toggle('is-fullscreen', isFullscreen); console.log("Fullscreen state changed:", isFullscreen); }
    function populateAudioTrackSelector() { if (!videoElement || typeof videoElement.audioTracks === 'undefined' || !audioTrackSelect) { if(audioTrackSelect) audioTrackSelect.style.display = 'none'; return; } const tracks = videoElement.audioTracks; audioTrackSelect.innerHTML = ''; if (tracks.length <= 1) { audioTrackSelect.style.display = 'none'; return; } let hasEnabledTrack = false; for (let i = 0; i < tracks.length; i++) { if (tracks[i].enabled) hasEnabledTrack = true; } if (!hasEnabledTrack && tracks.length > 0) { try { tracks[0].enabled = true; } catch(e) { console.warn("Could not auto-enable first audio track:", e); } } let preferredTrackIndex = -1; for (let i = 0; i < tracks.length; i++) { const track = tracks[i]; const option = document.createElement('option'); const trackValue = track.id || i; option.value = trackValue; let label = track.label || `Track ${i + 1}`; let languageName = ''; if (track.language) { try { languageName = new Intl.DisplayNames(['en'], { type: 'language' }).of(track.language.split('-')[0]); label += ` (${languageName || track.language})`; } catch (e) { label += ` (${track.language})`; } } option.textContent = label; option.selected = track.enabled; option.disabled = track.readyState === 'ended'; audioTrackSelect.appendChild(option); const lang = track.language?.toLowerCase(); const lbl = label.toLowerCase(); if (preferredTrackIndex === -1 && (lang?.startsWith('hi') || lbl.includes('hindi') || languageName?.toLowerCase() === 'hindi')) { preferredTrackIndex = i; } } if (preferredTrackIndex !== -1) { console.log(`Preferred track found at index ${preferredTrackIndex}. Attempting auto-selection.`); try { let trackChanged = false; for (let i = 0; i < tracks.length; i++) { const shouldBeEnabled = (i === preferredTrackIndex); if (tracks[i].enabled !== shouldBeEnabled) { tracks[i].enabled = shouldBeEnabled; trackChanged = true; } } const preferredTrackValue = tracks[preferredTrackIndex].id || preferredTrackIndex; audioTrackSelect.value = preferredTrackValue; if (trackChanged) console.log("Successfully auto-selected preferred track."); } catch(e) { console.error("Error auto-selecting preferred audio track:", e); } } else { console.log("No preferred audio track found."); for (let i = 0; i < tracks.length; i++) { if (tracks[i].enabled) { audioTrackSelect.value = tracks[i].id || i; break; } } } audioTrackSelect.style.display = 'inline-block'; try { if (tracks.onchange === null) tracks.onchange = populateAudioTrackSelector; } catch(e) { console.warn("Browser might not support 'onchange' on AudioTrackList", e)} }
    function openWithIntent(url) { if (!url) return; const mime = getMimeTypeFromUrl(url); const titleEncoded = encodeURIComponent(videoTitle?.innerText || document.title || 'Video'); const intentUri = `intent:${url}#Intent;type=${mime};action=android.intent.action.VIEW;S.title=${titleEncoded};end`; console.log("Intent:", intentUri); window.location.href = intentUri; }
    function copyVLCLink(buttonElement, url) { console.log("Copy VLC button clicked. URL:", url); if (!url) { console.error("copyVLCLink: No URL provided."); alert("Cannot copy: URL is missing."); return; } const feedbackSpan = buttonElement.nextElementSibling; if (!feedbackSpan || !feedbackSpan.classList.contains('copy-feedback')) { console.warn("copyVLCLink: Could not find feedback span immediately after the button:", buttonElement); copyToClipboard(url, null); return; } copyToClipboard(url, feedbackSpan).catch(err => { console.error("Error during copyVLCLink process:", err); alert("Copy failed. Please try again."); if (feedbackSpan) { feedbackSpan.classList.remove('show', 'error'); feedbackSpan.style.display = 'none'; } }); }
    function showCopyFeedback(spanElement, message = 'Copied!', isError = false) { if (!spanElement) return; clearTimeout(copyFeedbackTimeout); spanElement.textContent = message; spanElement.classList.toggle('error', isError); spanElement.classList.remove('share-fallback'); if (spanElement.classList.contains('share-fallback')) { spanElement.classList.add('share-fallback'); } spanElement.style.display = 'inline-block'; spanElement.classList.add('show'); copyFeedbackTimeout = setTimeout(() => { spanElement.classList.remove('show', 'error'); setTimeout(() => { if (!spanElement.classList.contains('show')) { spanElement.style.display = 'none'; spanElement.textContent = spanElement.classList.contains('share-fallback') ? 'Link copied!' : 'Copied!'; } }, 300); }, 2500); }
    function clearCopyFeedback() { clearTimeout(copyFeedbackTimeout); document.querySelectorAll('.copy-feedback.show').forEach(span => { span.classList.remove('show', 'error'); span.style.display = 'none'; span.textContent = span.classList.contains('share-fallback') ? 'Link copied!' : 'Copied!'; }); }
    function clearBypassFeedback() { clearTimeout(bypassFeedbackTimeout); document.querySelectorAll('.bypass-feedback.show').forEach(span => { span.classList.remove('show', 'error', 'loading'); span.style.display = 'none'; span.textContent = ''; }); }
    function highlightVlcText() { const activeContext = (currentViewMode === 'itemDetail') ? itemDetailContent : null; if (!activeContext) return; const currentVlcText = activeContext.querySelector('#vlcBox code'); if (currentVlcText && currentVlcText.closest('#vlcBox')?.style.display !== 'none') { try { const range = document.createRange(); range.selectNodeContents(currentVlcText); const selection = window.getSelection(); if (selection) { selection.removeAllRanges(); selection.addRange(range); } console.log("Highlighted VLC text as fallback."); } catch (selectErr) { console.warn("Could not highlight VLC text:", selectErr); } } }
    function handlePlayerKeyboardShortcuts(event) { if (!videoContainer || videoContainer.style.display === 'none' || !videoElement) return; const targetTagName = event.target.tagName.toLowerCase(); if (targetTagName === 'input' || targetTagName === 'select' || targetTagName === 'textarea') return; const key = event.key; let prevented = false; switch (key) { case ' ': case 'k': togglePlayPause(); prevented = true; break; case 'ArrowLeft': seekVideo(-10); prevented = true; break; case 'ArrowRight': seekVideo(10); prevented = true; break; case 'ArrowUp': setVolume(Math.min(videoElement.volume + 0.05, 1)); prevented = true; break; case 'ArrowDown': setVolume(Math.max(videoElement.volume - 0.05, 0)); prevented = true; break; case 'm': toggleMute(); prevented = true; break; case 'f': toggleFullscreen(); prevented = true; break; } if (prevented) event.preventDefault(); }


    // --- State Persistence ---
    function saveStateToLocalStorage() { try { const stateToSave = {}; if (currentState.sortColumn !== 'lastUpdated') stateToSave.sortColumn = currentState.sortColumn; if (currentState.sortDirection !== 'desc') stateToSave.sortDirection = currentState.sortDirection; if (currentState.qualityFilter !== '') stateToSave.qualityFilter = currentState.qualityFilter; if (currentState.searchTerm !== '') stateToSave.searchTerm = currentState.searchTerm; // Save search term
         if (currentViewMode === 'search') stateToSave.lastView = 'search'; // Save last view if search
         if (Object.keys(stateToSave).length > 0) { localStorage.setItem(config.LOCAL_STORAGE_KEY, JSON.stringify(stateToSave)); console.log("Saved state:", stateToSave); } else { localStorage.removeItem(config.LOCAL_STORAGE_KEY); console.log("State is default, removed saved state."); } } catch (e) { console.error("Failed to save state to localStorage:", e); } }
    function loadStateFromLocalStorage() { try { const savedState = localStorage.getItem(config.LOCAL_STORAGE_KEY); if (savedState) { const parsedState = JSON.parse(savedState); currentState.sortColumn = typeof parsedState.sortColumn === 'string' ? parsedState.sortColumn : 'lastUpdated'; currentState.sortDirection = (typeof parsedState.sortDirection === 'string' && ['asc', 'desc'].includes(parsedState.sortDirection)) ? parsedState.sortDirection : 'desc'; currentState.qualityFilter = typeof parsedState.qualityFilter === 'string' ? parsedState.qualityFilter : ''; // Restore searchTerm if needed for initial load scenario
          // currentState.searchTerm = typeof parsedState.searchTerm === 'string' ? parsedState.searchTerm : '';
          // const lastView = parsedState.lastView;
          console.log("Loaded state:", { sortColumn: currentState.sortColumn, sortDirection: currentState.sortDirection, qualityFilter: currentState.qualityFilter /*, searchTerm: currentState.searchTerm, lastView: lastView */ }); // Return lastView if needed by initializeApp
          // return lastView;
         } else { currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc'; currentState.qualityFilter = ''; console.log("No saved state found, using defaults."); } } catch (e) { console.error("Failed to load or parse state from localStorage:", e); localStorage.removeItem(config.LOCAL_STORAGE_KEY); currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc'; currentState.qualityFilter = ''; } // Reset potentially conflicting state variables
         currentState.searchTerm = ''; currentState.currentPage = 1; currentState.typeFilter = ''; activeResultsTab = 'allFiles'; currentItemDetailData = null; isShareMode = false; lastFocusedElement = null; // return null; // No last view found
     }

    // --- Initial Data Loading and Setup ---
    async function fetchApiData(params = {}) { if (searchAbortController) { searchAbortController.abort(); } searchAbortController = new AbortController(); const signal = searchAbortController.signal; const query = new URLSearchParams();
         if (!params.id) { // Search/List view params
             query.set('page', params.page || currentState.currentPage);
             query.set('limit', params.limit || currentState.limit);
             query.set('sort', params.sort || currentState.sortColumn);
             query.set('sortDir', params.sortDir || currentState.sortDirection);
             const searchTerm = params.search !== undefined ? params.search : currentState.searchTerm;
             if (searchTerm) query.set('search', searchTerm);
             const qualityFilter = params.quality !== undefined ? params.quality : currentState.qualityFilter;
             if (qualityFilter) query.set('quality', qualityFilter);
             const typeFilter = params.type !== undefined ? params.type : currentState.typeFilter;
             if (typeFilter) query.set('type', typeFilter);
         } else { // Item Detail view params
             query.set('id', params.id);
             // Optionally add other relevant params if your backend supports them for single item fetch
         } const url = `${config.MOVIE_DATA_API_URL}?${query.toString()}`; console.log(`Fetching API: ${url}`); try { const response = await fetch(url, { signal }); if (!response.ok) { let errorBody = null; try { errorBody = await response.json(); } catch (_) {} const errorDetails = errorBody?.error || errorBody?.details || `Status: ${response.status}`; throw new Error(`API Error: ${errorDetails}`); } const data = await response.json(); console.log(`API data received:`, data);
             if (!params.id && tabMappings[activeResultsTab]) {
                const activePagination = tabMappings[activeResultsTab]?.pagination;
                if (activePagination && data.totalPages !== undefined) {
                    activePagination.dataset.totalPages = data.totalPages;
                }
             } return data; } catch (error) { if (error.name === 'AbortError') { console.log('API fetch aborted.'); return null; } console.error(`Error fetching data from ${url}:`, error); throw error; } finally { if (signal === searchAbortController?.signal) { searchAbortController = null; } } }
    async function fetchAndRenderResults() { if (currentViewMode !== 'search') return; try { const apiResponse = await fetchApiData(); if (apiResponse === null) return; // Aborted
         renderActiveResultsView(apiResponse); saveStateToLocalStorage(); } catch (error) { console.error("Failed to fetch/render search results:", error); const { tableBody } = tabMappings[activeResultsTab]; if (tableBody) { tableBody.innerHTML = `<tr><td colspan="6" class="error-message">Error loading results: ${error.message}. Please try again.</td></tr>`; } Object.values(tabMappings).forEach(m => { if(m.pagination) m.pagination.style.display = 'none'; }); } }
    function populateQualityFilter(items = []) { if (!qualityFilterSelect) return; const currentSelectedValue = qualityFilterSelect.value; uniqueQualities.clear(); // Clear before repopulating
         items.forEach(item => { if (item.displayQuality && item.displayQuality !== 'N/A') { uniqueQualities.add(item.displayQuality); } }); const sortedQualities = [...uniqueQualities].sort((a, b) => { const getScore = (q) => { q = String(q || '').toUpperCase().trim(); const resMatch = q.match(/^(\d{3,4})P$/); if (q === '4K' || q === '2160P') return 100; if (resMatch) return parseInt(resMatch[1], 10); if (q === '1080P') return 90; if (q === '720P') return 80; if (q === '480P') return 70; if (['WEBDL', 'BLURAY', 'BDRIP', 'BRRIP'].includes(q)) return 60; if (['WEBIP', 'HDTV', 'HDRIP'].includes(q)) return 50; if (['DVD', 'DVDRIP'].includes(q)) return 40; if (['DVDSCR', 'HC', 'HDCAM', 'TC', 'TS', 'CAM'].includes(q)) return 30; if (['HDR', 'DOLBY VISION', 'DV', 'HEVC', 'X265'].includes(q)) return 20; return 0; }; const scoreA = getScore(a); const scoreB = getScore(b); if (scoreA !== scoreB) return scoreB - scoreA; return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' }); }); while (qualityFilterSelect.options.length > 1) { qualityFilterSelect.remove(1); } sortedQualities.forEach(quality => { if (quality && quality !== 'N/A') { const option = document.createElement('option'); option.value = quality; option.textContent = quality; qualityFilterSelect.appendChild(option); } }); qualityFilterSelect.value = [...qualityFilterSelect.options].some(opt => opt.value === currentSelectedValue) ? currentSelectedValue : ""; updateFilterIndicator(); }
    function displayLoadError(message) { const errorHtml = `<div class="error-container" role="alert">${sanitize(message)}</div>`; if (searchFocusArea) searchFocusArea.innerHTML = ''; searchFocusArea.style.display = 'none'; if (resultsArea) resultsArea.innerHTML = ''; resultsArea.style.display = 'none'; if (updatesPreviewSection) updatesPreviewSection.innerHTML = ''; updatesPreviewSection.style.display = 'none'; if (itemDetailContent) itemDetailContent.innerHTML = ''; if (itemDetailView) itemDetailView.style.display = 'none'; if (pageFooter) pageFooter.style.display = 'none'; container.classList.remove('results-active', 'item-detail-active'); if (mainErrorArea) { mainErrorArea.innerHTML = errorHtml; } else if (container) { container.insertAdjacentHTML('afterbegin', errorHtml); } if (pageLoader) pageLoader.style.display = 'none'; }
    async function initializeApp() {
        isInitialLoad = true;
        if (pageLoader) pageLoader.style.display = 'flex';

        // Load state FIRST to potentially restore search term etc.
        loadStateFromLocalStorage();

        // Determine initial view based on URL (overrides loaded state view)
        handleUrlChange(); // This sets the initial view mode

        // Apply loaded quality filter state
        if (qualityFilterSelect) {
            qualityFilterSelect.value = currentState.qualityFilter || '';
            updateFilterIndicator();
        }
        // If loaded state included search term and last view was search, apply it
        // (handleUrlChange might override this if URL has view/share ID)
        // if (lastView === 'search' && currentState.searchTerm && currentViewMode !== 'itemDetail') {
        //    if (searchInput) searchInput.value = currentState.searchTerm;
        //    setViewMode('search');
        //    fetchAndRenderResults(); // Fetch results for restored search
        // }

        try {
            // Fetch suggestion/quality data in the background
            console.log("Fetching initial data for suggestions/quality filter...");
            // Limit initial fetch for faster loading, rely on search for specifics
            fetchApiData({ limit: 2000, sort: 'lastUpdated', sortDir: 'desc' })
                .then(suggestionData => {
                    if (suggestionData && suggestionData.items) {
                        localSuggestionData = suggestionData.items.map(preprocessMovieData);
                        console.log(`Loaded ${localSuggestionData.length} items for suggestions.`);
                        populateQualityFilter(localSuggestionData);
                        // Load updates preview only if currently on homepage
                        if (currentViewMode === 'homepage') {
                            loadUpdatesPreview();
                        }
                    } else {
                        console.warn("Could not load initial data for suggestions/quality filter.");
                         if (currentViewMode === 'homepage' && updatesPreviewList) {
                             updatesPreviewList.innerHTML = '<div class="status-message" style="text-align:center; padding: 15px 0;">Could not load recent updates.</div>';
                         }
                    }
                }).catch(e => {
                    console.error("Background suggestion/quality fetch failed:", e);
                     if (currentViewMode === 'homepage' && updatesPreviewList) {
                        updatesPreviewList.innerHTML = `<div class="error-message" style="text-align:center; padding: 15px 0;">Error loading updates: ${e.message}.</div>`;
                     }
                });

        } catch (error) {
            console.error('FATAL: Failed during app initialization:', error);
            displayLoadError(`Error initializing app: ${error.message}. Try refreshing.`);
        } finally {
             // Hide loader only if NOT already in item detail view (which handles its own loader)
             if (pageLoader && currentViewMode !== 'itemDetail') {
                  pageLoader.style.display = 'none';
             }
             // isInitialLoad is set to false within handleUrlChange after first run
        }
    }


    // --- Event Handling Setup ---
    function handleActionClick(event) {
         const target = event.target;
         const button = target.closest('#item-detail-content .button, #playerCustomUrlSection button');

         if (button) {
            const action = button.dataset.action;
            const url = button.dataset.url;
            let title = button.dataset.title || button.dataset.titleRef || currentItemDetailData?.displayFilename;
            const filename = button.dataset.filename || currentItemDetailData?.displayFilename;
            const id = button.dataset.id || currentItemDetailData?.id;
            lastFocusedElement = button;

            if (button.tagName === 'A' && button.href && button.target === '_blank') {
                return; // Allow browser handling
            }
             // Prevent default only if it's not handled by browser or is a button action
            if (button.tagName !== 'A' || action) {
                 event.preventDefault();
            }

            console.log(`Action clicked: ${action || 'link navigation'}`);

            if (action === 'play' && url) {
                isGlobalCustomUrlMode = false;
                streamVideo(title, url, filename);
            } else if (action === 'copy-vlc' && url) {
                copyVLCLink(button, url);
            } else if (action === 'open-intent' && url) {
                openWithIntent(url);
            } else if (action === 'share' && id) {
                handleShareClick(button);
            } else if (action === 'toggle-custom-url') {
                toggleCustomUrlInput(button);
            } else if (action === 'bypass-hubcloud') {
                triggerHubCloudBypass(button);
            } else if (action === 'bypass-gdflix') {
                triggerGDFLIXBypass(button);
            } else if (target.matches('#playerPlayCustomUrlButton')) {
                 if (isGlobalCustomUrlMode) {
                     handleGlobalPlayCustomUrl(event);
                 } else {
                     playFromCustomUrlInput(event.target);
                 }
            }
         }
    }
    function handleGlobalCustomUrlClick(event) {
         event.preventDefault(); lastFocusedElement = event.target;
         if (!videoContainer || !playerCustomUrlSection || !playerCustomUrlInput) return;
         console.log("Global Play Custom URL clicked."); closePlayerIfNeeded();
         if(resultsArea) resultsArea.style.display = 'none';
         if(itemDetailView) itemDetailView.style.display = 'none';
         if(searchFocusArea) searchFocusArea.style.display = 'none';

         isGlobalCustomUrlMode = true; videoContainer.classList.add('global-custom-url-mode');
         if (videoElement) videoElement.style.display = 'none'; if (customControlsContainer) customControlsContainer.style.display = 'none';
         if (videoTitle) videoTitle.innerText = 'Play Custom URL'; if (vlcBox) vlcBox.style.display = 'none'; if (audioWarningDiv) audioWarningDiv.style.display = 'none';
         playerCustomUrlSection.style.display = 'flex'; playerCustomUrlInput.value = '';
         if (playerCustomUrlFeedback) playerCustomUrlFeedback.textContent = '';
         // Ensure player is appended to main container for global mode if not already
         if (container && videoContainer.parentElement !== container) {
            if (videoContainer.parentElement) videoContainer.parentElement.removeChild(videoContainer);
            container.appendChild(videoContainer);
         }
         videoContainer.style.display = 'flex';
         setTimeout(() => playerCustomUrlInput.focus(), 50);
    }
    function handleGlobalPlayCustomUrl(event) {
         event.preventDefault(); if (!playerCustomUrlInput || !playerCustomUrlFeedback) return;
         const customUrlRaw = playerCustomUrlInput.value.trim(); playerCustomUrlFeedback.textContent = '';
         if (!customUrlRaw) { playerCustomUrlFeedback.textContent = 'Please enter a URL.'; playerCustomUrlInput.focus(); return; }
         let customUrlEncoded = customUrlRaw;
         try { new URL(customUrlRaw); customUrlEncoded = customUrlRaw.replace(/ /g, '%20'); } catch (e) { playerCustomUrlFeedback.textContent = 'Invalid URL format.'; playerCustomUrlInput.focus(); return; }
         console.log(`Attempting to play global custom URL: ${customUrlEncoded}`);
         if(playerCustomUrlSection) playerCustomUrlSection.style.display = 'none'; if(videoElement) videoElement.style.display = 'block'; if(customControlsContainer) customControlsContainer.style.display = 'flex';
         streamVideo("Custom URL Video", customUrlEncoded, null, true);
    }
    function toggleCustomUrlInput(toggleButton, triggeredByError = false) {
         const contextContainer = toggleButton.closest('#item-detail-content') || toggleButton.closest('#videoContainer');
         if (!contextContainer || !videoContainer || !playerCustomUrlSection) {
             console.error("Cannot toggle custom URL input: context or player elements missing.");
             return;
         }

         // Ensure player is inside the correct container
         if (contextContainer.id === 'item-detail-content' && videoContainer.parentElement !== contextContainer) {
             console.warn("Player not in item detail container, moving it for custom URL toggle.");
             if(videoContainer.parentElement) videoContainer.parentElement.removeChild(videoContainer);
             contextContainer.appendChild(videoContainer);
             if (videoElement && videoElement.hasAttribute('src')) { videoElement.pause(); videoElement.removeAttribute('src'); videoElement.currentTime = 0; videoElement.load(); }
             if (vlcBox) vlcBox.style.display = 'none';
             if (audioWarningDiv) audioWarningDiv.style.display = 'none';
             if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; }
             clearCopyFeedback();
         }

         const isHidden = playerCustomUrlSection.style.display === 'none';
         playerCustomUrlSection.style.display = isHidden ? 'flex' : 'none';
         if(videoElement) videoElement.style.display = isHidden ? 'none' : 'block';
         if(customControlsContainer) customControlsContainer.style.display = isHidden ? 'none' : 'flex';
         if(vlcBox) vlcBox.style.display = isHidden ? 'none' : 'block';

         if(audioWarningDiv) {
             if (isHidden && audioWarningDiv.style.display !== 'none' && !audioWarningDiv.innerHTML.includes('Playback Error:')) {
                 audioWarningDiv.style.display = 'none';
             }
             else if (!isHidden && audioWarningDiv.style.display === 'none') {
                 const movieData = currentItemDetailData;
                 if (movieData && movieData.displayFilename) {
                     const ddp51Regex = /\bDDP?([ ._-]?5\.1)?\b/i;
                     const advancedAudioRegex = /\b(DTS|ATMOS|TrueHD)\b/i;
                     const multiAudioHintRegex = /\b(Multi|Dual)[ ._-]?Audio\b/i;
                     let warningText = "";
                     const lowerFilename = movieData.displayFilename.toLowerCase();
                     if (ddp51Regex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DDP audio might not work in browser. Use 'Copy URL' or 'Play in VLC or MX Player'."; }
                     else if (advancedAudioRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DTS/Atmos/TrueHD audio likely unsupported. Use external player."; }
                     else if (multiAudioHintRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> May contain multiple audio tracks. Use selector below or external player."; }
                     if(warningText) { audioWarningDiv.innerHTML = warningText; audioWarningDiv.style.display = 'block'; }
                 }
             }
         }

         if (videoContainer.style.display === 'none') {
             videoContainer.style.display = 'flex';
         }

         toggleButton.setAttribute('aria-expanded', String(isHidden));
         toggleButton.innerHTML = isHidden ? '<span aria-hidden="true">🔼</span> Hide Custom URL Input' : '<span aria-hidden="true">🔗</span> Play Custom URL';

          if (isHidden && !triggeredByError) {
             if (playerCustomUrlInput) setTimeout(() => playerCustomUrlInput.focus(), 50);
          } else if (!isHidden) {
             setTimeout(() => toggleButton.focus(), 50);
          }

          setTimeout(() => {
              if (videoContainer.scrollIntoView) {
                  videoContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
          }, 150);
    }
    function playFromCustomUrlInput(playButton) {
         const container = playButton.closest('#playerCustomUrlSection');
         if (!container) return;
         const inputField = container.querySelector('#playerCustomUrlInput');
         const feedbackSpan = container.querySelector('.player-custom-url-feedback');
         const titleRef = "Custom URL Video";
         if (!inputField || !feedbackSpan) return;

         const customUrlRaw = inputField.value.trim();
         feedbackSpan.textContent = '';
         if (!customUrlRaw) { feedbackSpan.textContent = 'Please enter a URL.'; inputField.focus(); return; }

         let customUrlEncoded = customUrlRaw;
         try { new URL(customUrlRaw); customUrlEncoded = customUrlRaw.replace(/ /g, '%20'); } catch (e) { feedbackSpan.textContent = 'Invalid URL format.'; inputField.focus(); return; }

         console.log(`Attempting to play custom URL from item context: ${customUrlEncoded}`);
         isGlobalCustomUrlMode = false; // Ensure not in global mode

         if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none';
         if (videoElement) videoElement.style.display = 'block';
         if (customControlsContainer) customControlsContainer.style.display = 'flex';

         streamVideo(titleRef, customUrlEncoded, null, true);
    }


    // --- HubCloud/GDFLIX Bypass Logic ---
    async function triggerHubCloudBypass(buttonElement) {
         const hubcloudUrl = buttonElement.dataset.hubcloudUrl;
         const movieRefType = buttonElement.dataset.movieRef;
         if (!hubcloudUrl) { console.error("Bypass failed: HubCloud URL missing from button data."); setBypassButtonState(buttonElement, 'error', 'Missing URL'); return; }
         if (movieRefType !== 'detail' || !currentItemDetailData) { console.error("Bypass failed: Invalid context or missing item data."); setBypassButtonState(buttonElement, 'error', 'Context Error'); return; }

         console.log(`Attempting HubCloud bypass for: ${hubcloudUrl} (Context: ${movieRefType})`);
         setBypassButtonState(buttonElement, 'loading');
         const apiController = new AbortController(); const timeoutId = setTimeout(() => { apiController.abort(); console.error(`HubCloud Bypass API call timed out after ${config.BYPASS_TIMEOUT / 1000}s`); setBypassButtonState(buttonElement, 'error', 'Timeout'); }, config.BYPASS_TIMEOUT);
         try {
             const response = await fetch(config.BYPASS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hubcloudUrl }), signal: apiController.signal }); clearTimeout(timeoutId);
             if (!response.ok) { let errorDetails = `HTTP Error: ${response.status}`; try { errorDetails = (await response.json()).details || errorDetails; } catch (_) {} throw new Error(errorDetails); }
             const result = await response.json();
             if (result.success && result.finalUrl) {
                 console.log(`HubCloud Bypass successful! Raw Final URL: ${result.finalUrl}`); const encodedFinalUrl = result.finalUrl.replace(/ /g, '%20'); console.log(`Encoded Final URL: ${encodedFinalUrl}`);
                 setBypassButtonState(buttonElement, 'success', 'Success!');
                 updateItemDetailAfterBypass(encodedFinalUrl);
             } else { throw new Error(result.details || result.error || 'Unknown HubCloud bypass failure'); }
         } catch (error) {
             clearTimeout(timeoutId);
             if (error.name === 'AbortError' && !apiController.signal.aborted) { console.error("HubCloud Bypass aborted due to timeout."); setBypassButtonState(buttonElement, 'error', 'Timeout'); }
             else if (error.name === 'AbortError') { console.log("HubCloud Bypass fetch aborted by user/navigation."); setBypassButtonState(buttonElement, 'idle'); }
             else { console.error("HubCloud Bypass failed:", error); setBypassButtonState(buttonElement, 'error', `Failed`); } // Shorter error
         }
     }
    async function triggerGDFLIXBypass(buttonElement) {
         const gdflixUrl = buttonElement.dataset.gdflixUrl;
         const movieRefType = buttonElement.dataset.movieRef;
         if (!gdflixUrl) { console.error("Bypass failed: GDFLIX URL missing from button data."); setBypassButtonState(buttonElement, 'error', 'Missing URL'); return; }
         if (movieRefType !== 'detail' || !currentItemDetailData) { console.error("Bypass failed: Invalid context or missing item data."); setBypassButtonState(buttonElement, 'error', 'Context Error'); return; }

         console.log(`Attempting GDFLIX bypass for: ${gdflixUrl} (Context: ${movieRefType})`);
         setBypassButtonState(buttonElement, 'loading');
         const apiController = new AbortController(); const timeoutId = setTimeout(() => { apiController.abort(); console.error(`GDFLIX Bypass API call timed out after ${config.BYPASS_TIMEOUT / 1000}s`); setBypassButtonState(buttonElement, 'error', 'Timeout'); }, config.BYPASS_TIMEOUT);
         try {
             const response = await fetch(config.GDFLIX_BYPASS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gdflixUrl }), signal: apiController.signal }); clearTimeout(timeoutId);
             if (!response.ok) { let errorDetails = `HTTP Error: ${response.status}`; try { errorDetails = (await response.json()).error || errorDetails; } catch (_) {} throw new Error(errorDetails); }
             const result = await response.json();
             if (result.success && result.finalUrl) {
                 console.log(`GDFLIX Bypass successful! Raw Final URL: ${result.finalUrl}`); const encodedFinalUrl = result.finalUrl.replace(/ /g, '%20'); console.log(`Encoded Final URL: ${encodedFinalUrl}`);
                 setBypassButtonState(buttonElement, 'success', 'Success!');
                 updateItemDetailAfterBypass(encodedFinalUrl);
             } else { throw new Error(result.error || 'Unknown GDFLIX bypass failure'); }
         } catch (error) {
             clearTimeout(timeoutId);
             if (error.name === 'AbortError' && !apiController.signal.aborted) { console.error("GDFLIX Bypass aborted due to timeout."); setBypassButtonState(buttonElement, 'error', 'Timeout'); }
             else if (error.name === 'AbortError') { console.log("GDFLIX Bypass fetch aborted by user/navigation."); setBypassButtonState(buttonElement, 'idle'); }
             else { console.error("GDFLIX Bypass failed:", error); setBypassButtonState(buttonElement, 'error', `Failed`); } // Shorter error
         }
     }
    function updateItemDetailAfterBypass(encodedFinalUrl) {
          if (!currentItemDetailData || !itemDetailContent) {
              console.error("Cannot update item detail view: missing data or container.");
              return;
          }
          currentItemDetailData.url = encodedFinalUrl;
          console.log(`Updated item detail data (ID: ${currentItemDetailData.id}) in memory with bypassed URL.`);

          // --- Re-render content WITHOUT re-fetching TMDb details ---
          // Find existing TMDb details if they were already rendered
          const existingTmdbContainer = itemDetailContent.querySelector('.tmdb-details-container');
          const existingSeparator = itemDetailContent.querySelector('hr.detail-separator');
          let existingTmdbHTML = '';
          if (existingTmdbContainer) {
              existingTmdbHTML = existingTmdbContainer.outerHTML;
              if (existingSeparator) {
                  existingTmdbHTML += existingSeparator.outerHTML;
              }
          }

          // Generate the internal info and buttons parts again with the new URL
          const internalInfoHTML = `
              <div class="action-info" data-stream-title="${escape(currentItemDetailData.displayFilename.split(/[\.\(\[]/)[0].replace(/[_ ]+/g, ' ').trim())}">
                  <span class="info-item"><strong>Filename:</strong> ${currentItemDetailData.displayFilename}</span>
                  <span class="info-item"><strong>Quality:</strong> ${currentItemDetailData.displayQuality} ${currentItemDetailData.displayQuality === '4K' ? `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo fourk-logo" title="4K Ultra HD" />` : ''}${(currentItemDetailData.displayQuality || '').includes('HDR') ? `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo hdr-logo" title="HDR / Dolby Vision Content" />` : ''}</span>
                  <span class="info-item"><strong>Size:</strong> ${currentItemDetailData.sizeData.display}</span>
                  <span class="info-item"><strong>Language:</strong> ${sanitize(currentItemDetailData.languages || 'N/A')}</span>
                   <span class="info-item"><strong>Updated:</strong> ${TimeAgo.formatFullDate(new Date(currentItemDetailData.lastUpdatedTimestamp))} (${TimeAgo.format(currentItemDetailData.last_updated_ts)})</span>
                  ${currentItemDetailData.originalFilename ? `<span class="info-item"><strong>Original Name:</strong> ${sanitize(currentItemDetailData.originalFilename)}</span>` : ''}
              </div>`;

          // Re-generate buttons (similar logic as in createItemDetailContentHTML but simplified)
           let urlDependentButtonsHTML = '';
           let bypassButtonsHTML = ''; // Keep bypass buttons rendered (maybe disable the successful one)
           let otherLinkButtonsHTML = '';

           // URL Buttons
           if (currentItemDetailData.url) {
               urlDependentButtonsHTML += `<button class="button play-button" data-action="play" data-title="${escape(currentItemDetailData.displayFilename.split(/[\.\(\[]/)[0].replace(/[_ ]+/g, ' ').trim())}" data-url="${escape(currentItemDetailData.url)}" data-filename="${escape(currentItemDetailData.displayFilename)}"><span aria-hidden="true">▶️</span> Play here</button>`;
               urlDependentButtonsHTML += `<a class="button download-button" href="${currentItemDetailData.url}" download="${currentItemDetailData.displayFilename}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">💾</span> Direct Download</a>`;
               urlDependentButtonsHTML += `<button class="button vlc-button" data-action="copy-vlc" data-url="${escape(currentItemDetailData.url)}"><span aria-hidden="true">📋</span> Copy URL (for VLC/MX)</button><span class="copy-feedback" role="status" aria-live="polite">Copied!</span>`;
               if (navigator.userAgent.toLowerCase().includes("android")) {
                  urlDependentButtonsHTML += `<button class="button intent-button" data-action="open-intent" data-url="${escape(currentItemDetailData.url)}"><span aria-hidden="true">📱</span> Play in VLC or MX Player</button>`;
               }
           }
           urlDependentButtonsHTML = `<div class="url-actions-container" id="url-actions-container-${escape(String(currentItemDetailData.id).replace(/[^a-zA-Z0-9-_]/g, ''))}">${urlDependentButtonsHTML}</div>`;


           // Find existing buttons to potentially update/reuse state
           const existingButtons = itemDetailContent.querySelector('.action-buttons-container')?.cloneNode(true);

           // Re-render buttons section (simple approach: regenerate essential ones)
           // This might lose the 'success' state visually on bypass buttons,
           // but ensures the links/actions are correct.
            const escapedId = escape(String(currentItemDetailData.id).replace(/[^a-zA-Z0-9-_]/g, ''));
            const escapedStreamTitle = escape(currentItemDetailData.displayFilename.split(/[\.\(\[]/)[0].replace(/[_ ]+/g, ' ').trim() + (currentItemDetailData.displayQuality !== 'N/A' ? ` (${currentItemDetailData.displayQuality})` : ''));
            const escapedFilename = escape(currentItemDetailData.displayFilename);
            const escapedHubcloudUrl = currentItemDetailData.hubcloud_link ? escape(currentItemDetailData.hubcloud_link) : '';
            const escapedGdflixUrl = currentItemDetailData.gdflix_link ? escape(currentItemDetailData.gdflix_link) : '';

            // Bypass Buttons (regenerate, state might be lost visually)
            const movieRefAttr = `data-movie-ref="detail"`;
            if (currentItemDetailData.hubcloud_link) {
                bypassButtonsHTML += `<button class="button hubcloud-bypass-button" data-action="bypass-hubcloud" data-hubcloud-url="${escapedHubcloudUrl}" ${movieRefAttr}><span aria-hidden="true" class="button-icon">☁️</span><span class="button-spinner spinner"></span><span class="button-text">Bypass HubCloud</span></button><span class="bypass-feedback" role="status" aria-live="polite"></span>`;
            }
            if (currentItemDetailData.gdflix_link) {
                bypassButtonsHTML += `<button class="button gdflix-bypass-button" data-action="bypass-gdflix" data-gdflix-url="${escapedGdflixUrl}" ${movieRefAttr}><span aria-hidden="true" class="button-icon">🎬</span><span class="button-spinner spinner"></span><span class="button-text">Bypass GDFLIX</span></button><span class="bypass-feedback" role="status" aria-live="polite"></span>`;
            }

            // Other buttons (regenerate links)
            // Note: This simplified regeneration might not perfectly preserve dynamic states like toggle buttons
             otherLinkButtonsHTML = itemDetailContent.querySelector('.youtube-button')?.outerHTML || '';
             otherLinkButtonsHTML += itemDetailContent.querySelector('.imdb-button, .tmdb-link-button')?.outerHTML || '';
             otherLinkButtonsHTML += `<button class="button custom-url-toggle-button" data-action="toggle-custom-url" aria-expanded="false" style="display: none;"><span aria-hidden="true">🔗</span> Play Custom URL</button>`; // Reset toggle state
             if (currentItemDetailData.telegram_link && currentItemDetailData.telegram_link.toLowerCase() !== 'null') otherLinkButtonsHTML += `<a class="button telegram-button" href="${sanitize(currentItemDetailData.telegram_link)}" target="_blank" rel="noopener noreferrer">Telegram File</a>`;
             if (currentItemDetailData.gdflix_link && !bypassButtonsHTML.includes('bypass-gdflix')) otherLinkButtonsHTML += `<a class="button gdflix-button" href="${sanitize(currentItemDetailData.gdflix_link)}" target="_blank" rel="noopener noreferrer">GDFLIX Link</a>`;
             if (currentItemDetailData.hubcloud_link && currentItemDetailData.hubcloud_link.toLowerCase() !== 'null' && !bypassButtonsHTML.includes('bypass-hubcloud')) otherLinkButtonsHTML += `<a class="button hubcloud-button" href="${sanitize(currentItemDetailData.hubcloud_link)}" target="_blank" rel="noopener noreferrer">HubCloud Link</a>`;
             if (currentItemDetailData.filepress_link) otherLinkButtonsHTML += `<a class="button filepress-button" href="${sanitize(currentItemDetailData.filepress_link)}" target="_blank" rel="noopener noreferrer">Filepress</a>`;
             if (currentItemDetailData.gdtot_link) otherLinkButtonsHTML += `<a class="button gdtot-button" href="${sanitize(currentItemDetailData.gdtot_link)}" target="_blank" rel="noopener noreferrer">GDToT</a>`;
             if (currentItemDetailData.id) otherLinkButtonsHTML += `<button class="button share-button" data-action="share" data-id="${escapedId}" data-title="${escapedStreamTitle}" data-filename="${escapedFilename}"><span aria-hidden="true">🔗</span> Share Post</button><span class="copy-feedback share-fallback" role="status" aria-live="polite">Link copied!</span>`;


           const buttonsHTML = `
                <div class="action-buttons-container">
                    ${urlDependentButtonsHTML}
                    ${bypassButtonsHTML}
                    ${otherLinkButtonsHTML}
                </div>
           `;

          // Combine existing TMDb + new internal info + new buttons
          const finalHTML = existingTmdbHTML + internalInfoHTML + buttonsHTML;
          itemDetailContent.innerHTML = finalHTML;

          console.log(`Successfully partially re-rendered item detail content for item ID: ${currentItemDetailData.id} after bypass.`);

          // Focus the new play button if it exists
          const playButton = itemDetailContent.querySelector('.play-button');
          if(playButton) {
              setTimeout(() => playButton.focus(), 50);
          }

           // If player was open, re-attach it inside the new content
          if (videoContainer.parentElement && videoContainer.style.display !== 'none') {
             console.log("Re-attaching player to updated item detail content.");
             // Find appropriate place, perhaps end of itemDetailContent
             itemDetailContent.appendChild(videoContainer);
           }
     }
    function setBypassButtonState(buttonElement, state, message = null) {
         if (!buttonElement) return;
         const feedbackSpan = buttonElement.nextElementSibling; const iconSpan = buttonElement.querySelector('.button-icon'); const spinnerSpan = buttonElement.querySelector('.button-spinner'); const textSpan = buttonElement.querySelector('.button-text');
         const isHubCloud = buttonElement.classList.contains('hubcloud-bypass-button'); const defaultText = isHubCloud ? 'Bypass HubCloud' : 'Bypass GDFLIX'; const defaultIconHTML = isHubCloud ? '☁️' : '🎬';
         buttonElement.classList.remove('loading', 'error', 'success'); buttonElement.disabled = false;
         if (feedbackSpan) feedbackSpan.style.display = 'none'; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) { iconSpan.style.display = 'inline-block'; iconSpan.innerHTML = defaultIconHTML; } // Reset icon too
         clearTimeout(bypassFeedbackTimeout);
         switch (state) {
             case 'loading': buttonElement.classList.add('loading'); buttonElement.disabled = true; if (textSpan) textSpan.textContent = 'Bypassing...'; if (spinnerSpan) spinnerSpan.style.display = 'inline-block'; if (iconSpan) iconSpan.style.display = 'none'; if (feedbackSpan) { feedbackSpan.textContent = 'Please wait...'; feedbackSpan.className = 'bypass-feedback loading show'; feedbackSpan.style.display = 'inline-block'; } break;
             case 'success': buttonElement.classList.add('success'); buttonElement.disabled = true; /* Keep disabled */ if (textSpan) textSpan.textContent = 'Success!'; if (iconSpan) iconSpan.innerHTML = '✅'; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.textContent = message || 'Success! Play button updated.'; feedbackSpan.className = 'bypass-feedback success show'; feedbackSpan.style.display = 'inline-block'; } break;
             case 'error': buttonElement.classList.add('error'); buttonElement.disabled = false; /* Allow retry */ if (textSpan) textSpan.textContent = defaultText; if (iconSpan) iconSpan.innerHTML = defaultIconHTML; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.textContent = message || 'Failed'; feedbackSpan.className = 'bypass-feedback error show'; feedbackSpan.style.display = 'inline-block'; bypassFeedbackTimeout = setTimeout(() => { feedbackSpan.classList.remove('show', 'error', 'loading'); feedbackSpan.style.display = 'none'; feedbackSpan.textContent = ''; }, 4000); } break;
             case 'idle': default: buttonElement.disabled = false; if (textSpan) textSpan.textContent = defaultText; if (iconSpan) iconSpan.innerHTML = defaultIconHTML; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.classList.remove('show', 'error', 'loading'); feedbackSpan.style.display = 'none'; feedbackSpan.textContent = ''; } break;
         }
     }


    // --- Event Delegation Setup ---
     function handleContentClick(event) {
         const target = event.target;

         // 1. Navigate from Results/Updates Preview to Item Detail
         const viewTrigger = target.closest('.movie-data-row .view-button, .movie-data-row .col-filename, .update-item .view-button, .update-item .preview-col-filename');
         if (viewTrigger) {
             event.preventDefault();
             const itemId = viewTrigger.dataset.itemId || viewTrigger.closest('[data-item-id]')?.dataset.itemId;
             if (itemId) {
                 navigateToItemView(itemId);
             } else {
                 console.error("Could not find item ID for navigation.");
             }
             return;
         }

         // 2. Handle Actions within Item Detail or Player
         const actionTrigger = target.closest('#item-detail-content .button, #playerCustomUrlSection button, #videoContainer .button:not(.close-btn):not(.custom-controls button)');
         if (actionTrigger) {
             handleActionClick(event);
             return;
         }

          // 3. Handle Player Close Button
          if (target.matches('.close-btn') && target.closest('#videoContainer')) {
              closePlayer(target); // Pass button as focus target
              return;
          }

          // 4. Handle Sortable Table Headers
         if (target.closest('th.sortable')) {
             handleSort(event);
             return;
         }

         // 5. Handle Player Media Controls (Seek, Mute, Vol, Speed, Fullscreen) - Native or handled by direct onclicks
         const playerControl = target.closest('.custom-controls button, .custom-controls select, .custom-controls input');
         if(playerControl) {
             // Actions are handled by direct onclick attributes or input events
             // We might still want to store lastFocusedElement here
             lastFocusedElement = playerControl;
             return;
         }
    }

    // --- Add Event Listeners ---
    document.addEventListener('DOMContentLoaded', async () => {
         await initializeApp(); // Handles initial URL and setup

         if (searchInput) {
             searchInput.addEventListener('input', handleSearchInput);
             searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSearchSubmit(); } else if (event.key === 'Escape') { suggestionsContainer.style.display = 'none'; } });
             searchInput.addEventListener('search', handleSearchClear);
             searchInput.addEventListener('blur', () => { setTimeout(() => { const searchButton = document.getElementById('searchSubmitButton'); if (document.activeElement !== searchInput && !suggestionsContainer.contains(document.activeElement) && document.activeElement !== searchButton) { suggestionsContainer.style.display = 'none'; } }, 150); });
         }

         if (qualityFilterSelect) { qualityFilterSelect.addEventListener('change', triggerFilterChange); }

         // Delegated Click Listener
         if (container) { container.addEventListener('click', handleContentClick); } // Delegate clicks from main container

         if (playCustomUrlGlobalButton) { playCustomUrlGlobalButton.addEventListener('click', handleGlobalCustomUrlClick); }

         document.addEventListener('keydown', handlePlayerKeyboardShortcuts);

         // Click outside player/suggestions handler
         document.addEventListener('click', (event) => {
             // Close suggestions
             if (searchInput && suggestionsContainer && suggestionsContainer.style.display === 'block') { const searchWrapper = searchInput.closest('.search-input-wrapper'); if (searchWrapper && !searchWrapper.contains(event.target)) { suggestionsContainer.style.display = 'none'; } }

             // Close player if clicked outside its context
             if (videoContainer && videoContainer.style.display !== 'none') {
                 const clickedInsidePlayer = videoContainer.contains(event.target);
                 const clickedInsideDetailContent = currentViewMode === 'itemDetail' && itemDetailContent?.contains(event.target);
                 const clickedOnGlobalTrigger = isGlobalCustomUrlMode && playCustomUrlGlobalButton?.contains(event.target);

                 if (!clickedInsidePlayer && !clickedInsideDetailContent && !clickedOnGlobalTrigger) {
                     // Only close if click is truly outside the player's relevant area
                     console.log("Clicked outside player context. Closing player.");
                     closePlayer(event.target);
                 }
             }
         }, false);

         if(videoElement) {
             videoElement.addEventListener('volumechange', () => { if (volumeSlider && Math.abs(parseFloat(volumeSlider.value) - videoElement.volume) > 0.01) { volumeSlider.value = videoElement.volume; } updateMuteButton(); try { localStorage.setItem(config.PLAYER_VOLUME_KEY, String(videoElement.volume)); } catch (e) { console.warn("LocalStorage volume save failed", e); } });
             videoElement.addEventListener('ratechange', () => { if(playbackSpeedSelect && playbackSpeedSelect.value !== String(videoElement.playbackRate)) { playbackSpeedSelect.value = String(videoElement.playbackRate); } try { localStorage.setItem(config.PLAYER_SPEED_KEY, String(videoElement.playbackRate)); } catch (e) { console.warn("LocalStorage speed save failed", e); } });
             videoElement.addEventListener('loadedmetadata', populateAudioTrackSelector);
             videoElement.removeEventListener('error', handleVideoError); videoElement.addEventListener('error', handleVideoError);
             // Listen for mute state changes directly on the element if possible (browser dependent)
             videoElement.addEventListener('mute', updateMuteButton);
             videoElement.addEventListener('unmute', updateMuteButton);
         }

         document.addEventListener('fullscreenchange', handleFullscreenChange); document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

         // Initial player volume/speed setup from storage
         try {
             const savedVolume = localStorage.getItem(config.PLAYER_VOLUME_KEY);
             if (savedVolume !== null && videoElement) {
                 videoElement.volume = Math.max(0, Math.min(1, parseFloat(savedVolume)));
                 if (volumeSlider) volumeSlider.value = videoElement.volume;
                 videoElement.muted = videoElement.volume === 0;
             }
             const savedSpeed = localStorage.getItem(config.PLAYER_SPEED_KEY);
             if (savedSpeed !== null && videoElement) {
                 videoElement.playbackRate = parseFloat(savedSpeed);
                 if(playbackSpeedSelect) playbackSpeedSelect.value = String(videoElement.playbackRate);
             }
             updateMuteButton(); // Update button based on initial state
         } catch (e) {
            console.warn("Failed to load player settings from storage", e);
         }

     }); // End DOMContentLoaded

})(); // End of IIFE
// --- END OF script.js ---
