// --- START OF script.js (MODIFIED FOR ITEM DETAIL VIEW NAVIGATION + HUBCLEOUD & GDFLIX BYPASS + URL SPACE ENCODING + TMDb + Updates Function Order Fix) ---
(function() {
    'use strict';

    // ===========================================================
    // JAVASCRIPT SECTION (Updated for TMDb Integration & Function Order)
    // ===========================================================
    const config = {
        HDR_LOGO_URL: "https://as1.ftcdn.net/v2/jpg/05/32/83/72/1000_F_532837228_v8CGZRU0jy39uCtqFRnJz6xDntrGuLLx.webp",
        FOURK_LOGO_URL: "https://i.pinimg.com/736x/85/c4/b0/85c4b0a2fb8612825d0cd2f53460925f.jpg",
        ITEMS_PER_PAGE: 50,
        LOCAL_STORAGE_KEY: 'cinemaGharState_v14_db', // Incremented version for item detail view
        PLAYER_VOLUME_KEY: 'cinemaGharPlayerVolume',
        PLAYER_SPEED_KEY: 'cinemaGharPlayerSpeed',
        SEARCH_DEBOUNCE_DELAY: 300,
        SUGGESTIONS_DEBOUNCE_DELAY: 250,
        MAX_SUGGESTIONS: 50,
        UPDATES_PREVIEW_INITIAL_COUNT: 10, // Changed to 10
        UPDATES_PREVIEW_LOAD_MORE_COUNT: 10, // Changed to 10
        MOVIE_DATA_API_URL: '/api/movies',
        BYPASS_API_URL: 'https://hubcloud-bypass.onrender.com/api/hubcloud', // HubCloud Bypass API
        GDFLIX_BYPASS_API_URL: 'https://gdflix-bypass.onrender.com/api/gdflix', // GDFLIX Bypass API
        BYPASS_TIMEOUT: 60000, // 60 seconds timeout for bypass API calls (Shared)
        TMDB_API_PROXY_URL: '/api/tmdb', // API proxy route
        TMDB_FETCH_TIMEOUT: 15000 // Timeout for TMDb fetch (15 seconds)
    };


    // --- DOM Element References ---
    const container = document.getElementById('cinemaghar-container');
    const pageLoader = document.getElementById('page-loader');
    const searchFocusArea = document.getElementById('search-focus-area');
    const resultsArea = document.getElementById('results-area');
    const itemDetailView = document.getElementById('item-detail-view'); // Renamed from sharedItemView
    const itemDetailContent = document.getElementById('item-detail-content'); // Renamed from sharedItemContent
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
    const backToHomeButtonShared = document.getElementById('backToHomeButtonShared'); // For shareId links
    const backToResultsButton = document.getElementById('backToResultsButton'); // For viewId links
    const pageFooter = document.getElementById('page-footer');
    // Player Custom URL section elements
    const playerCustomUrlSection = document.getElementById('playerCustomUrlSection');
    const playerCustomUrlInput = document.getElementById('playerCustomUrlInput');
    const playerPlayCustomUrlButton = document.getElementById('playerPlayCustomUrlButton');
    const playerCustomUrlFeedback = playerCustomUrlSection?.querySelector('.player-custom-url-feedback');
    // Global Custom URL button
    const playCustomUrlGlobalButton = document.getElementById('playCustomUrlGlobalButton');

    // --- State Variables ---
    let localSuggestionData = [];
    let currentSearchResultsData = []; // Holds data for the *currently displayed* search results tab
    let weeklyUpdatesData = []; // Holds data specifically for the homepage preview
    let currentItemDetailData = null; // Holds the data for the currently displayed item (viewId or shareId)
    let updatesPreviewShownCount = 0;
    let uniqueQualities = new Set();
    let copyFeedbackTimeout;
    let bypassFeedbackTimeout; // Timeout for bypass feedback messages
    let suggestionDebounceTimeout;
    let searchAbortController = null;
    let isInitialLoad = true; // Flag to differentiate initial load from navigation
    let currentViewMode = 'homepage'; // 'homepage', 'search', 'itemDetail'
    let isShareMode = false; // Flag to know if itemDetail view is from shareId or viewId
    let activeResultsTab = 'allFiles';
    let lastFocusedElement = null;
    let isGlobalCustomUrlMode = false; // Flag for global player mode

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
    const TimeAgo = { MINUTE: 60, HOUR: 3600, DAY: 86400, WEEK: 604800, MONTH: 2592000, YEAR: 31536000, format: (isoString) => { if (!isoString) return 'N/A'; try { const date = new Date(isoString); const seconds = Math.floor((new Date() - date) / 1000); if (isNaN(seconds) || seconds < 0) { console.warn(`TimeAgo: Invalid seconds calculation for ${isoString}. Parsed date: ${date}. Returning full date.`); return TimeAgo.formatFullDate(date); } if (seconds < 2) return "just now"; if (seconds < TimeAgo.MINUTE) return `${seconds} sec${seconds > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.HOUR) return `${Math.floor(seconds / TimeAgo.MINUTE)} min${Math.floor(seconds / TimeAgo.MINUTE) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY) return `${Math.floor(seconds / TimeAgo.HOUR)} hr${Math.floor(seconds / TimeAgo.HOUR) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY * 2) return "Yesterday"; if (seconds < TimeAgo.WEEK) return `${Math.floor(seconds / TimeAgo.DAY)} days ago`; if (seconds < TimeAgo.MONTH) return `${Math.floor(seconds / TimeAgo.WEEK)} wk${Math.floor(seconds / TimeAgo.WEEK) > 1 ? 's' : ''} ago`; return TimeAgo.formatFullDate(date, true); } catch (e) { console.error("Date Format Error (TimeAgo):", isoString, e); return 'Invalid Date'; } }, formatFullDate: (date, short = false) => { if (!(date instanceof Date) || isNaN(date.getTime())) return 'Invalid Date'; const optsDate = short ? { year: '2-digit', month: 'numeric', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }; const optsTime = { hour: 'numeric', minute: '2-digit', hour12: true }; try { return `${date.toLocaleDateString(undefined, optsDate)}${short ? '' : ', ' + date.toLocaleTimeString(undefined, optsTime)}`; } catch (e) { console.error("toLocaleDateString/Time failed:", e); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; } } };
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

    // --- Data Preprocessing (Handles HubCloud and GDFLIX links, encodes URL spaces) ---
    function preprocessMovieData(movie) {
        const processed = { ...movie };
        processed.id = movie.original_id;
        processed.url = (movie.url && typeof movie.url === 'string' && movie.url.toLowerCase() !== 'null' && movie.url.trim() !== '') ? movie.url : null;
        if (processed.url) {
            processed.url = processed.url.replace(/ /g, '%20');
        }
        processed.hubcloud_link = (movie.hubcloud_link && typeof movie.hubcloud_link === 'string' && movie.hubcloud_link.toLowerCase() !== 'null' && movie.hubcloud_link.trim() !== '') ? movie.hubcloud_link : null;
        processed.gdflix_link = (movie.gdflix_link && typeof movie.gdflix_link === 'string' && movie.gdflix_link.toLowerCase() !== 'null' && movie.gdflix_link.trim() !== '') ? movie.gdflix_link : null;

        processed.displayFilename = sanitize(movie.filename || '');
        processed.sizeData = extractSizeData(movie.size_display);
        if (!processed.size_bytes && processed.sizeData.bytes > 0) { processed.size_bytes = processed.sizeData.bytes; }
        processed.displayQuality = sanitize(movie.quality || 'N/A');
        if (processed.displayQuality && processed.displayQuality !== 'N/A') { uniqueQualities.add(processed.displayQuality); }
        const tsString = movie.last_updated_ts;
        let dateObject = null;
        if (tsString) { try { dateObject = new Date(tsString); } catch(e) { console.warn("Date parse error in preprocessMovieData:", e); } }
        processed.lastUpdatedTimestamp = (dateObject && !isNaN(dateObject)) ? dateObject.getTime() : 0;
        if (processed.lastUpdatedTimestamp === 0 && tsString) { console.warn(`Invalid date format received for movie ID ${processed.id}, filename "${processed.displayFilename}":`, tsString); }
        processed.numericId = typeof processed.id === 'number' ? processed.id : Infinity;
        processed.searchText = normalizeTextForSearch(`${processed.id || ''} ${processed.displayFilename}`);
        processed.isSeries = !!movie.is_series;
        processed.extractedTitle = null; processed.extractedYear = null; processed.extractedSeason = null;
        const filename = processed.displayFilename;
        if (filename) {
            const seasonMatch = filename.match(/[. ]S(\d{1,2})(?:E\d{1,2}|[. ])/i);
            if (seasonMatch && seasonMatch[1]) {
                processed.extractedSeason = parseInt(seasonMatch[1], 10);
                processed.isSeries = true;
                const titleEndIndex = seasonMatch.index;
                processed.extractedTitle = filename.substring(0, titleEndIndex).replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
            }
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
            if (!processed.extractedTitle) { processed.extractedTitle = filename.split(/[\.({\[]/)[0].replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim(); }
            if (processed.extractedTitle) { processed.extractedTitle = processed.extractedTitle.replace(/ (1080p|720p|2160p|4k|web-?dl|bluray|hdtv|dvdrip|hdr|x265|hevc)$/i, '').trim(); }
        }
        return processed;
    }

    // --- HTML Generation (Includes TMDb, HubCloud and GDFLIX Bypass Buttons) ---
    // This function now generates the content for the item detail view
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

        // --- Existing Trailer/IMDb Logic ---
        let youtubeTrailerButtonHTML = '';
        let imdbSearchButtonHTML = '';
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

             // IMDb Link (using TMDb link if available, otherwise Google search)
             const imdbIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"></path></svg>`; // Placeholder icon
             if (tmdbDetails && tmdbDetails.tmdbLink) {
                  const tmdbLabel = movie.isSeries ? "View on TMDb (TV)" : "View on TMDb (Movie)";
                  imdbSearchButtonHTML = `<a href="${sanitize(tmdbDetails.tmdbLink)}" target="_blank" rel="noopener noreferrer" class="button tmdb-link-button">${imdbIconSVG} ${tmdbLabel}</a>`;
             } else {
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
                ? `<img src="${sanitize(tmdbDetails.posterPath)}" alt="Poster for ${sanitize(tmdbDetails.title)}" class="tmdb-poster">`
                : '<div class="tmdb-poster-placeholder">No Poster</div>';
            const ratingHTML = tmdbDetails.voteAverage && tmdbDetails.voteCount ? `<span class="tmdb-rating" title="${tmdbDetails.voteCount} votes">⭐ ${sanitize(tmdbDetails.voteAverage)}/10</span>` : '';
            const genresHTML = tmdbDetails.genres && tmdbDetails.genres.length > 0 ? `<div class="tmdb-genres"><strong>Genres:</strong> ${tmdbDetails.genres.map(g => `<span class="genre-tag">${sanitize(g)}</span>`).join(' ')}</div>` : '';
            const overviewHTML = tmdbDetails.overview ? `<div class="tmdb-overview"><strong>Overview:</strong><p>${sanitize(tmdbDetails.overview)}</p></div>` : '';
            const releaseDateHTML = tmdbDetails.releaseDate ? `<div><strong>Released:</strong> ${sanitize(TimeAgo.formatFullDate(new Date(tmdbDetails.releaseDate), true))}</div>` : '';
            const runtimeHTML = tmdbDetails.runtime ? `<div><strong>Runtime:</strong> ${sanitize(tmdbDetails.runtime)} min</div>` : '';
            const taglineHTML = tmdbDetails.tagline ? `<div class="tmdb-tagline"><em>${sanitize(tmdbDetails.tagline)}</em></div>` : '';
            const actorsHTML = tmdbDetails.actors && tmdbDetails.actors.length > 0 ? `<div class="tmdb-actors"><strong>Starring:</strong><ul>${tmdbDetails.actors.map(actor => `<li>${sanitize(actor.name)} (${sanitize(actor.character)})</li>`).join('')}</ul></div>` : '';

            tmdbSectionHTML = `
                <div class="tmdb-details-container">
                    <div class="tmdb-poster-column">${posterHTML}</div>
                    <div class="tmdb-info-column">
                        ${tmdbDetails.title ? `<h3 class="tmdb-title">${sanitize(tmdbDetails.title)}</h3>` : ''}
                        ${taglineHTML}
                        <div class="tmdb-meta">${ratingHTML}${releaseDateHTML}${runtimeHTML}</div>
                        ${genresHTML}
                        ${overviewHTML}
                        ${actorsHTML}
                    </div>
                </div>`;
        } else if (movie.extractedTitle) {
            tmdbSectionHTML = `<div class="tmdb-fetch-failed">Could not fetch additional details from TMDb.</div>`;
        }

        // --- Button Logic (Existing) ---
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
         if (movie.gdflix_link && !bypassButtonsHTML.includes('bypass-gdflix')) otherLinkButtonsHTML += `<a class="button gdflix-button" href="${sanitize(movie.gdflix_link)}" target="_blank" rel="noopener noreferrer">GDFLIX Link</a>`;
         if (movie.hubcloud_link && movie.hubcloud_link.toLowerCase() !== 'null' && !bypassButtonsHTML.includes('bypass-hubcloud')) {
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
            </div>`;
        const buttonsHTML = `
             <div class="action-buttons-container">
                 ${urlDependentButtonsHTML}
                 ${bypassButtonsHTML}
                 ${otherLinkButtonsHTML}
             </div>`;

        // Assemble final structure
        return `
            ${tmdbSectionHTML}
            <hr class="detail-separator">
            ${internalInfoHTML}
            ${buttonsHTML}
            ${ /* The video player container will be appended here by JS if needed */ }
        `;
    } // End of createItemDetailContentHTML function


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
        if (updatesPreviewSection) updatesPreviewSection.style.display = showHomepage ? 'block' : 'none'; // Controlled later by loadUpdatesPreview
        if (pageFooter) pageFooter.style.display = (showHomepage || showSearch) ? 'flex' : 'none';

        if (showHomepage) {
            if (searchInput) searchInput.value = '';
            currentState.searchTerm = '';
            if (suggestionsContainer) suggestionsContainer.style.display = 'none';
            activeResultsTab = 'allFiles';
            currentState.currentPage = 1;
            currentState.typeFilter = '';
            currentItemDetailData = null;
            isShareMode = false;
            // Load updates if needed (loadUpdatesPreview handles visibility)
            if (localSuggestionData.length > 0 && currentViewMode === 'homepage') { // Ensure it's still homepage
                 loadUpdatesPreview();
            } else if (localSuggestionData.length === 0 && currentViewMode === 'homepage') {
                 // Data not yet loaded, initializeApp will call loadUpdatesPreview later
                 if (updatesPreviewList) updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`;
                 if (updatesPreviewSection) updatesPreviewSection.style.display = 'block'; // Show loading state
            }
            document.title = "Cinema Ghar Index";
        } else if (showSearch) {
             currentItemDetailData = null;
             isShareMode = false;
             if (updatesPreviewSection) updatesPreviewSection.style.display = 'none'; // Hide updates section
            document.title = "Cinema Ghar Index";
        } else if (showItemDetail) {
             if (updatesPreviewSection) updatesPreviewSection.style.display = 'none'; // Hide updates section
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
        history.back();
    }

    window.addEventListener('popstate', (event) => {
        console.log("Popstate event triggered", event.state);
        handleUrlChange(true);
    });

    function handleUrlChange(isPopState = false) {
        const urlParams = new URLSearchParams(window.location.search);
        const shareId = urlParams.get('shareId');
        const viewId = urlParams.get('viewId');

        console.log(`Handling URL Change: shareId=${shareId}, viewId=${viewId}, isPopState=${isPopState}, isInitialLoad=${isInitialLoad}`);

        if (shareId) {
            console.log("Displaying shared item:", shareId);
            displayItemDetail(shareId, true);
        } else if (viewId) {
            console.log("Displaying viewed item:", viewId);
            displayItemDetail(viewId, false);
        } else {
            if (!isInitialLoad && currentViewMode !== 'homepage' && currentViewMode !== 'search') {
                 console.log("Navigating back to homepage view from item detail.");
                 setViewMode('homepage'); // Go home if navigating back from detail view
            } else if (isInitialLoad) {
                 console.log("Initial load, setting view to homepage.");
                 setViewMode('homepage'); // Ensure homepage on initial load without specific item
            } else {
                console.log("URL change without specific item, current view:", currentViewMode);
                // If already on homepage or search, likely just a history state change, ensure view is correct
                 if (currentViewMode !== 'homepage' && currentViewMode !== 'search') {
                     setViewMode('homepage');
                 }
            }
        }
        // isInitialLoad is set to false within setViewMode
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
        currentState.typeFilter = '';
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

    // ===================================================== //
    // --- UPDATES PREVIEW LOGIC (REORDERED FUNCTIONS) --- //
    // ===================================================== //

    // Helper function to add update items to the list
    function appendUpdatesToPreview(startIndex, endIndex) {
        if (!updatesPreviewList) return;
        const fragment = document.createDocumentFragment();
        const itemsToAppend = weeklyUpdatesData.slice(startIndex, endIndex);
        itemsToAppend.forEach((movie, indexInSlice) => {
            const overallIndex = startIndex + indexInSlice;
            if (!movie || !movie.id) return; // Ensure movie and ID exist

            const itemDiv = document.createElement('div');
            itemDiv.className = 'update-item';
            itemDiv.dataset.index = overallIndex;
            itemDiv.dataset.itemId = sanitize(movie.id); // Add item ID

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
                <div class="preview-col-filename" title="View details for: ${movie.displayFilename}" data-item-id="${sanitize(movie.id)}"> <!-- Added data-item-id -->
                    ${sanitize(movie.displayFilename)}${fourkLogoHtml}${hdrLogoHtml}
                </div>
                <div class="preview-col-date" title="${formattedDateFull}">
                    ${formattedDateRelative}
                </div>
                <div class="preview-col-view">
                    <button class="button view-button" data-item-id="${sanitize(movie.id)}">View</button> <!-- Added data-item-id -->
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

    // Function to display the first batch of updates
    function displayInitialUpdates() {
        if (!updatesPreviewList || !showMoreUpdatesButton) return;
        updatesPreviewList.innerHTML = '';
        updatesPreviewShownCount = 0;

        if (weeklyUpdatesData.length === 0) {
            updatesPreviewList.innerHTML = '<div class="status-message" style="text-align:center; padding: 15px 0;">No recent updates found.</div>';
            showMoreUpdatesButton.style.display = 'none';
            return;
        }
        const initialCount = Math.min(weeklyUpdatesData.length, config.UPDATES_PREVIEW_INITIAL_COUNT);
        appendUpdatesToPreview(0, initialCount); // Calls the helper function defined above
        updatesPreviewShownCount = initialCount;

        const potentiallyMoreBasedOnLimit = initialCount >= config.UPDATES_PREVIEW_INITIAL_COUNT;
        const showButton = potentiallyMoreBasedOnLimit;

        if (showButton) {
            showMoreUpdatesButton.style.display = 'block';
            showMoreUpdatesButton.disabled = false;
            showMoreUpdatesButton.textContent = "Show More";
        } else {
            showMoreUpdatesButton.style.display = 'none';
        }
    }

    // Function to load more updates when the button is clicked
    window.appendMoreUpdates = async function() {
        if (!updatesPreviewList || !showMoreUpdatesButton) return;
        showMoreUpdatesButton.disabled = true;
        showMoreUpdatesButton.textContent = "Loading...";

        const currentPage = Math.floor(updatesPreviewShownCount / config.UPDATES_PREVIEW_LOAD_MORE_COUNT);
        const nextPage = currentPage + 1;
        console.log(`Attempting to load page ${nextPage} for updates preview.`);

        try {
            const params = { sort: 'lastUpdated', sortDir: 'desc', limit: config.UPDATES_PREVIEW_LOAD_MORE_COUNT, page: nextPage };
            const data = await fetchApiData(params);

            if (data && data.items && data.items.length > 0) {
                const newItems = data.items.map(preprocessMovieData);
                const startIndex = weeklyUpdatesData.length;
                weeklyUpdatesData.push(...newItems);
                appendUpdatesToPreview(startIndex, weeklyUpdatesData.length);
                updatesPreviewShownCount = weeklyUpdatesData.length;

                console.log(`Loaded ${newItems.length} more updates. Total now: ${updatesPreviewShownCount}. Current API page: ${data.page}, Total API pages: ${data.totalPages}`);

                if (data.page >= data.totalPages) {
                    showMoreUpdatesButton.textContent = "All Updates Shown";
                    // Keep disabled=true;
                } else {
                    showMoreUpdatesButton.disabled = false;
                    showMoreUpdatesButton.textContent = "Show More";
                }
            } else {
                console.log("No more updates found from API.");
                showMoreUpdatesButton.textContent = "No More Updates";
                // Keep disabled=true;
            }
        } catch (error) {
            console.error("Failed to load more updates:", error);
            showMoreUpdatesButton.textContent = "Error Loading";
            showMoreUpdatesButton.disabled = false;
        }
    }

    // Main function to initiate loading the updates preview
    async function loadUpdatesPreview() {
        if (currentViewMode !== 'homepage' || !updatesPreviewSection || !updatesPreviewList || !showMoreUpdatesButton) {
            console.log("Skipping updates preview load (not homepage or elements missing).");
            if (updatesPreviewSection) updatesPreviewSection.style.display = 'none';
            return;
        }

        updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`;
        showMoreUpdatesButton.style.display = 'none';
        updatesPreviewSection.style.display = 'block'; // Ensure section is visible

        updatesPreviewShownCount = 0;
        weeklyUpdatesData = [];

        try {
            // Fetch *only* the initial amount needed for the preview
            const params = { sort: 'lastUpdated', sortDir: 'desc', limit: config.UPDATES_PREVIEW_INITIAL_COUNT, page: 1 };
            const data = await fetchApiData(params);

            if (data && data.items && data.items.length > 0) {
                weeklyUpdatesData = data.items.map(preprocessMovieData);
                // Call the function defined above
                displayInitialUpdates(); // This function now handles the showMore button logic
                console.log(`Loaded initial ${weeklyUpdatesData.length} updates. Total pages from API: ${data.totalPages}`);
            } else {
                // No updates found
                updatesPreviewList.innerHTML = '<div class="status-message" style="text-align:center; padding: 15px 0;">No recent updates found.</div>';
                showMoreUpdatesButton.style.display = 'none';
            }
            // Keep the section visible to show either updates or the "No updates" message
            if (updatesPreviewSection) updatesPreviewSection.style.display = 'block';

        } catch (error) {
            console.error("Failed to load updates preview:", error);
            // Display the error message within the updates list area
            updatesPreviewList.innerHTML = `<div class="error-message" style="text-align:center; padding: 15px 0;">Could not load updates. ${error.message}</div>`;
            showMoreUpdatesButton.style.display = 'none';
            // Keep the section visible to show the error message
            if (updatesPreviewSection) updatesPreviewSection.style.display = 'block';
        }
    }

    // --- END OF UPDATES PREVIEW LOGIC ---


    // --- Filtering, Sorting ---
    function triggerFilterChange() { if (!qualityFilterSelect || currentViewMode !== 'search') return; const newQualityFilter = qualityFilterSelect.value; if (newQualityFilter !== currentState.qualityFilter) { currentState.qualityFilter = newQualityFilter; currentState.currentPage = 1; closePlayerIfNeeded(null); showLoadingStateInTables(`Applying filter: ${sanitize(newQualityFilter || 'All Qualities')}...`); fetchAndRenderResults(); } }
    function handleSort(event) { const header = event.target.closest('th.sortable'); if (!header || currentViewMode !== 'search') return; const sortKey = header.dataset.sortKey; if (!sortKey) return; const oldSortColumn = currentState.sortColumn; const oldSortDirection = currentState.sortDirection; if (currentState.sortColumn === sortKey) { currentState.sortDirection = currentState.sortDirection === 'asc' ? 'desc' : 'asc'; } else { currentState.sortColumn = sortKey; currentState.sortDirection = ['filename', 'quality'].includes(sortKey) ? 'asc' : 'desc'; } if (oldSortColumn !== currentState.sortColumn || oldSortDirection !== currentState.sortDirection) { currentState.currentPage = 1; closePlayerIfNeeded(null); showLoadingStateInTables(`Sorting by ${sanitize(sortKey)} (${currentState.sortDirection})...`); fetchAndRenderResults(); } }

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
    window.changePage = function(newPage) { if (currentViewMode !== 'search' || newPage < 1 || newPage === currentState.currentPage) { return; } const currentPagination = tabMappings[activeResultsTab]?.pagination; if(currentPagination && currentPagination.dataset.totalPages) { const totalP = parseInt(currentPagination.dataset.totalPages, 10); if(newPage > totalP) { console.log(`Change page request to ${newPage} denied, exceeds total pages (${totalP}).`); return; } } currentState.currentPage = newPage; closePlayerIfNeeded(null); fetchAndRenderResults().then(() => { const activeTableBody = tabMappings[activeResultsTab]?.tableBody; scrollToTopOfActiveTable(activeTableBody); }); saveStateToLocalStorage(); }
    function scrollToTopOfActiveTable(tableBodyElement) { if (!tableBodyElement) return; const tableContainer = tableBodyElement.closest('.table-container'); if (tableContainer) { const searchBarArea = container.querySelector('#search-focus-area'); const backButtonElem = resultsArea.querySelector('#backToHomeButtonResults'); const filterArea = resultsArea.querySelector('.results-filter-area'); const tabNav = resultsArea.querySelector('.tab-navigation'); let stickyHeaderHeight = 0; if (container.classList.contains('results-active')) { stickyHeaderHeight = (searchBarArea?.offsetHeight || 0) + (backButtonElem?.offsetHeight || 0) + (backButtonElem ? parseFloat(getComputedStyle(backButtonElem).marginBottom) : 0) + (filterArea?.offsetHeight || 0) + (tabNav?.offsetHeight || 0); } const elementTop = tableContainer.getBoundingClientRect().top + window.pageYOffset; const scrollPosition = elementTop - stickyHeaderHeight - 20; window.scrollTo({ top: scrollPosition, behavior: 'smooth' }); } }
    window.switchTab = function(tabId) { if (currentViewMode !== 'search' || tabId === activeResultsTab || !tabMappings[tabId]) { return; } activeResultsTab = tabId; currentState.currentPage = 1; currentState.typeFilter = tabMappings[tabId].typeFilter; closePlayerIfNeeded(null);
         updateActiveTabAndPanel(); showLoadingStateInTables(`Loading ${tabMappings[tabId].typeFilter || 'all files'}...`); fetchAndRenderResults(); saveStateToLocalStorage(); }

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
            displayItemDetail(itemId, false);
        } catch (e) {
            console.error("History pushState failed:", e);
        }
    }


    // --- Share Logic ---
    async function handleShareClick(buttonElement) { const itemId = buttonElement.dataset.id; const itemTitle = buttonElement.dataset.title || "Cinema Ghar Item"; const itemFilename = buttonElement.dataset.filename || ""; if (!itemId) { console.error("Share failed: Item ID missing."); alert("Cannot share this item (missing ID)."); return; } const shareUrl = `${window.location.origin}${window.location.pathname}?shareId=${encodeURIComponent(itemId)}`; const shareText = `Check out: ${itemTitle}\n${itemFilename ? `(${itemFilename})\n` : ''}`; const feedbackSpan = buttonElement.nextElementSibling; if (!feedbackSpan || !feedbackSpan.classList.contains('copy-feedback')) { console.warn("Share fallback feedback span not found next to button:", buttonElement); } if (navigator.share) { try { await navigator.share({ title: itemTitle, text: shareText, url: shareUrl, }); console.log('Successful share'); } catch (error) { console.error('Error sharing:', error); if (error.name !== 'AbortError') { if (feedbackSpan) { showCopyFeedback(feedbackSpan, 'Share failed!', true); } else { alert(`Share failed: ${error.message}`); } } } } else { console.log('Web Share API not supported, falling back to copy.'); await copyToClipboard(shareUrl, feedbackSpan); } }

    // --- Item Detail Display Logic (Handles both shareId and viewId + TMDb) ---
     async function displayItemDetail(itemId, isFromShareLink) {
         if (!itemId || !itemDetailView || !itemDetailContent) return;

         isShareMode = isFromShareLink;
         itemDetailContent.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading item details...</span></div>`;
         setViewMode('itemDetail');
         currentItemDetailData = null;
         let tmdbDetails = null;

         if (backToHomeButtonShared) backToHomeButtonShared.style.display = isShareMode ? 'inline-flex' : 'none';
         if (backToResultsButton) backToResultsButton.style.display = isShareMode ? 'none' : 'inline-flex';

         try {
             // 1. Fetch internal item data first
             const params = { id: itemId };
             const internalData = await fetchApiData(params);

             if (internalData && internalData.items && internalData.items.length > 0) {
                 const itemRaw = internalData.items[0];
                 currentItemDetailData = preprocessMovieData(itemRaw);
                 console.log(`Displaying item detail for: ${currentItemDetailData.displayFilename} (isShare: ${isShareMode})`);
                 document.title = `${currentItemDetailData.displayFilename || 'Item Detail'} - Cinema Ghar`;

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
                             const errorBody = await tmdbResponse.text();
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

                 // 2. Render content using BOTH internal and TMDb data
                 const contentHTML = createItemDetailContentHTML(currentItemDetailData, tmdbDetails);
                 itemDetailContent.innerHTML = contentHTML;
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
             setViewMode('itemDetail');
             window.scrollTo({ top: 0, behavior: 'smooth' });
             if (pageLoader && pageLoader.style.display !== 'none') {
                pageLoader.style.display = 'none';
             }
         }
     }

    // --- Player Logic ---
    function streamVideo(title, url, filenameForAudioCheck, isFromCustom = false) {
        let currentActionContainer = null;
        if (isGlobalCustomUrlMode) {
            // Player stays global
        } else if (currentViewMode === 'itemDetail' && itemDetailContent) {
            currentActionContainer = itemDetailContent;
        } else {
             if (itemDetailContent) {
                 currentActionContainer = itemDetailContent;
            } else {
                console.error("Cannot stream video: No valid container found (itemDetailContent missing).");
                return;
            }
        }

        if (!videoContainer || !videoElement) { console.error("Cannot stream: player or video element missing."); return; }

        if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none';
        if (videoElement) videoElement.style.display = 'block';
        if (customControlsContainer) customControlsContainer.style.display = 'flex';
        if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; }
        if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; }
        clearCopyFeedback();

        if (!isGlobalCustomUrlMode && currentActionContainer && videoContainer.parentElement !== currentActionContainer) {
            console.log("Moving video container to active container:", currentActionContainer);
             if (videoContainer.parentElement) {
                 videoContainer.parentElement.removeChild(videoContainer);
             }
            currentActionContainer.appendChild(videoContainer);
            if (videoElement.hasAttribute('src')) {
                videoElement.pause();
                videoElement.removeAttribute('src');
                videoElement.currentTime = 0;
                videoElement.load();
            }
            if (vlcBox) vlcBox.style.display = 'none';
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
        videoElement.load();
        videoElement.play().catch(e => { console.log("Autoplay was prevented or failed:", e.message); });

        if (videoContainer.style.display === 'none') {
            videoContainer.style.display = 'flex';
        }
        if (!isGlobalCustomUrlMode) {
            const closeButton = videoContainer.querySelector('.close-btn');
            if (closeButton) { setTimeout(() => closeButton.focus(), 100); }
            setTimeout(() => { videoContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150);
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

         if (!wasGlobalMode) {
            const mainBodyContainer = document.getElementById('cinemaghar-container');
             if (mainBodyContainer && videoContainer.parentElement !== mainBodyContainer) {
                 if (parentContainer && parentContainer.contains(videoContainer)) {
                     parentContainer.removeChild(videoContainer);
                     console.log("Detached video player from its container.");
                 } else {
                     console.log("Player parent doesn't exist or doesn't contain player, assuming already moved or removed.");
                 }
             } else if (!mainBodyContainer) {
                 console.warn("Main container #cinemaghar-container not found, cannot handle player movement properly.");
             }
         }

         let finalFocusTarget = elementToFocusAfter || lastFocusedElement;
         if (!wasGlobalMode && currentViewMode === 'itemDetail') {
             const playButton = itemDetailContent?.querySelector('.play-button');
             if (playButton) {
                 finalFocusTarget = playButton;
             } else {
                 const firstButton = itemDetailContent?.querySelector('.button');
                 if (firstButton) finalFocusTarget = firstButton;
             }
         }

         if (finalFocusTarget && typeof finalFocusTarget.focus === 'function') {
             console.log("Returning focus to:", finalFocusTarget);
             setTimeout(() => finalFocusTarget.focus(), 50);
         }
         lastFocusedElement = null;
    }
    function closePlayerIfNeeded(elementToFocusAfter = null) { if (videoContainer?.style.display !== 'none') { closePlayer(elementToFocusAfter); } }
    window.seekVideo = function(seconds) { if (videoElement) videoElement.currentTime += seconds; }
    window.toggleMute = function() { if (videoElement) videoElement.muted = !videoElement.muted; }
    window.setVolume = function(value) { if (videoElement) { const vol = parseFloat(value); videoElement.volume = vol; videoElement.muted = (vol === 0); } }
    window.setPlaybackSpeed = function(value) { if (videoElement) videoElement.playbackRate = parseFloat(value); }
    window.toggleFullscreen = function() { const elementToMakeFullscreen = videoContainer; if (!elementToMakeFullscreen) return; const fsElement = document.fullscreenElement || document.webkitFullscreenElement; try { if (!fsElement) { if (elementToMakeFullscreen.requestFullscreen) elementToMakeFullscreen.requestFullscreen(); else if (elementToMakeFullscreen.webkitRequestFullscreen) elementToMakeFullscreen.webkitRequestFullscreen(); } else { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } } catch (err) { console.error("Fullscreen API error:", err); alert("Fullscreen mode failed. Browser might block it."); } }
    window.changeAudioTrack = function(selectElement) { if (!videoElement || !videoElement.audioTracks) return; const selectedTrackValue = selectElement.value; const tracks = videoElement.audioTracks; let trackChanged = false; for (let i = 0; i < tracks.length; i++) { const track = tracks[i]; const isSelectedTrack = (track.id && track.id === selectedTrackValue) || String(i) === selectedTrackValue; if (track.enabled !== isSelectedTrack) { try { track.enabled = isSelectedTrack; if (isSelectedTrack) console.log("Enabled audio track:", track.label || track.id || i); trackChanged = true; } catch (e) { console.error("Error changing audio track state for track:", track.id || i, e); } } } if (!trackChanged) console.warn("Selected audio track already active or no change applied."); }
    function togglePlayPause() { if (videoElement) { if (videoElement.paused || videoElement.ended) videoElement.play().catch(e => console.log("Play error:", e.message)); else videoElement.pause(); } }
    function updateMuteButton() { if (!videoElement || !muteButton) return; const isMuted = videoElement.muted || videoElement.volume === 0; muteButton.textContent = isMuted ? "Unmute" : "Mute"; muteButton.setAttribute('aria-pressed', String(isMuted)); if (volumeSlider) { volumeSlider.style.opacity = isMuted ? '0.5' : '1'; volumeSlider.disabled = isMuted; if (!isMuted && videoElement.volume === 0) { const defaultUnmuteVolume = 0.5; videoElement.volume = defaultUnmuteVolume; volumeSlider.value = defaultUnmuteVolume; } } }
    function handleFullscreenChange() { const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement); if (!videoContainer) return; videoContainer.classList.toggle('is-fullscreen', isFullscreen); console.log("Fullscreen state changed:", isFullscreen); }
    function populateAudioTrackSelector() { if (!videoElement || typeof videoElement.audioTracks === 'undefined' || !audioTrackSelect) { if(audioTrackSelect) audioTrackSelect.style.display = 'none'; return; } const tracks = videoElement.audioTracks; audioTrackSelect.innerHTML = ''; if (tracks.length <= 1) { audioTrackSelect.style.display = 'none'; return; } let hasEnabledTrack = false; for (let i = 0; i < tracks.length; i++) { if (tracks[i].enabled) hasEnabledTrack = true; } if (!hasEnabledTrack && tracks.length > 0) { try { tracks[0].enabled = true; } catch(e) { console.warn("Could not auto-enable first audio track:", e); } } let preferredTrackIndex = -1; for (let i = 0; i < tracks.length; i++) { const track = tracks[i]; const option = document.createElement('option'); const trackValue = track.id || i; option.value = trackValue; let label = track.label || `Track ${i + 1}`; let languageName = ''; if (track.language) { try { languageName = new Intl.DisplayNames(['en'], { type: 'language' }).of(track.language.split('-')[0]); label += ` (${languageName || track.language})`; } catch (e) { label += ` (${track.language})`; } } option.textContent = label; option.selected = track.enabled; option.disabled = track.readyState === 'ended'; audioTrackSelect.appendChild(option); const lang = track.language?.toLowerCase(); const lbl = label.toLowerCase(); if (preferredTrackIndex === -1 && (lang?.startsWith('hi') || lbl.includes('hindi') || languageName?.toLowerCase() === 'hindi')) { preferredTrackIndex = i; } } if (preferredTrackIndex !== -1) { console.log(`Preferred track found at index ${preferredTrackIndex}. Attempting auto-selection.`); try { let trackChanged = false; for (let i = 0; i < tracks.length; i++) { const shouldBeEnabled = (i === preferredTrackIndex); if (tracks[i].enabled !== shouldBeEnabled) { tracks[i].enabled = shouldBeEnabled; trackChanged = true; } } const preferredTrackValue = tracks[preferredTrackIndex].id || preferredTrackIndex; audioTrackSelect.value = preferredTrackValue; if (trackChanged) console.log("Successfully auto-selected preferred track."); } catch(e) { console.error("Error auto-selecting preferred audio track:", e); } } else { console.log("No preferred audio track found."); for (let i = 0; i < tracks.length; i++) { if (tracks[i].enabled) { audioTrackSelect.value = tracks[i].id || i; break; } } } audioTrackSelect.style.display = 'inline-block'; try { if (tracks.onchange === null) tracks.onchange = populateAudioTrackSelector; } catch(e) { console.warn("Browser might not support 'onchange' on AudioTrackList", e)} }
    function openWithIntent(url) { if (!url) return; const mime = getMimeTypeFromUrl(url); const titleEncoded = encodeURIComponent(videoTitle?.innerText || document.title || 'Video'); const intentUri = `intent:${url}#Intent;type=${mime};action=android.intent.action.VIEW;S.title=${titleEncoded};end`; console.log("Intent:", intentUri); window.location.href = intentUri; }
    function copyVLCLink(buttonElement, url) { console.log("Copy VLC button clicked. URL:", url); if (!url) { console.error("copyVLCLink: No URL provided."); alert("Cannot copy: URL is missing."); return; } const feedbackSpan = buttonElement.nextElementSibling; if (!feedbackSpan || !feedbackSpan.classList.contains('copy-feedback')) { console.warn("copyVLCLink: Could not find feedback span immediately after the button:", buttonElement); copyToClipboard(url, null); return; } copyToClipboard(url, feedbackSpan).catch(err => { console.error("Error during copyVLCLink process:", err); alert("Copy failed. Please try again."); if (feedbackSpan) { feedbackSpan.classList.remove('show', 'error'); feedbackSpan.style.display = 'none'; } }); }
    function showCopyFeedback(spanElement, message = 'Copied!', isError = false) { if (!spanElement) return; clearTimeout(copyFeedbackTimeout); spanElement.textContent = message; spanElement.classList.toggle('error', isError); spanElement.classList.remove('share-fallback'); if (spanElement.classList.contains('share-fallback')) { spanElement.classList.add('share-fallback'); } spanElement.style.display = 'inline-block'; spanElement.classList.add('show'); copyFeedbackTimeout = setTimeout(() => { spanElement.classList.remove('show', 'error'); setTimeout(() => { if (!spanElement.classList.contains('show')) { spanElement.style.display = 'none'; spanElement.textContent = spanElement.classList.contains('share-fallback') ? 'Link copied!' : 'Copied!'; } }, 300); }, 2500); }
    function clearCopyFeedback() { clearTimeout(copyFeedbackTimeout); document.querySelectorAll('.copy-feedback.show').forEach(span => { span.classList.remove('show', 'error'); span.style.display = 'none'; span.textContent = span.classList.contains('share-fallback') ? 'Link copied!' : 'Copied!'; }); }
    function clearBypassFeedback() { clearTimeout(bypassFeedbackTimeout); document.querySelectorAll('.bypass-feedback.show').forEach(span => { span.classList.remove('show', 'error', 'loading'); span.style.display = 'none'; span.textContent = ''; }); }
    function highlightVlcText() { const activeContext = (currentViewMode === 'itemDetail') ? itemDetailContent : null; if (!activeContext) return; const currentVlcText = activeContext.querySelector('#vlcBox code'); if (currentVlcText && currentVlcText.closest('#vlcBox')?.style.display !== 'none') { try { const range = document.createRange(); range.selectNodeContents(currentVlcText); const selection = window.getSelection(); if (selection) { selection.removeAllRanges(); selection.addRange(range); } console.log("Highlighted VLC text as fallback."); } catch (selectErr) { console.warn("Could not highlight VLC text:", selectErr); } } }
    function handlePlayerKeyboardShortcuts(event) { if (!videoContainer || videoContainer.style.display === 'none' || !videoElement) return; const targetTagName = event.target.tagName.toLowerCase(); if (targetTagName === 'input' || targetTagName === 'select' || targetTagName === 'textarea') return; const key = event.key; let prevented = false; switch (key) { case ' ': case 'k': togglePlayPause(); prevented = true; break; case 'ArrowLeft': seekVideo(-10); prevented = true; break; case 'ArrowRight': seekVideo(10); prevented = true; break; case 'ArrowUp': setVolume(Math.min(videoElement.volume + 0.05, 1)); if(volumeSlider) volumeSlider.value = videoElement.volume; prevented = true; break; case 'ArrowDown': setVolume(Math.max(videoElement.volume - 0.05, 0)); if(volumeSlider) volumeSlider.value = videoElement.volume; prevented = true; break; case 'm': toggleMute(); prevented = true; break; case 'f': toggleFullscreen(); prevented = true; break; } if (prevented) event.preventDefault(); }


    // --- State Persistence ---
    function saveStateToLocalStorage() { try { const stateToSave = {}; if (currentState.sortColumn !== 'lastUpdated') stateToSave.sortColumn = currentState.sortColumn; if (currentState.sortDirection !== 'desc') stateToSave.sortDirection = currentState.sortDirection; if (currentState.qualityFilter !== '') stateToSave.qualityFilter = currentState.qualityFilter; if (Object.keys(stateToSave).length > 0) { localStorage.setItem(config.LOCAL_STORAGE_KEY, JSON.stringify(stateToSave)); console.log("Saved state:", stateToSave); } else { localStorage.removeItem(config.LOCAL_STORAGE_KEY); console.log("State is default, removed saved state."); } } catch (e) { console.error("Failed to save state to localStorage:", e); } }
    function loadStateFromLocalStorage() { try { const savedState = localStorage.getItem(config.LOCAL_STORAGE_KEY); if (savedState) { const parsedState = JSON.parse(savedState); currentState.sortColumn = typeof parsedState.sortColumn === 'string' ? parsedState.sortColumn : 'lastUpdated'; currentState.sortDirection = (typeof parsedState.sortDirection === 'string' && ['asc', 'desc'].includes(parsedState.sortDirection)) ? parsedState.sortDirection : 'desc'; currentState.qualityFilter = typeof parsedState.qualityFilter === 'string' ? parsedState.qualityFilter : ''; console.log("Loaded state:", { sortColumn: currentState.sortColumn, sortDirection: currentState.sortDirection, qualityFilter: currentState.qualityFilter }); } else { currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc'; currentState.qualityFilter = ''; console.log("No saved state found, using defaults."); } } catch (e) { console.error("Failed to load or parse state from localStorage:", e); localStorage.removeItem(config.LOCAL_STORAGE_KEY); currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc'; currentState.qualityFilter = ''; } currentState.searchTerm = ''; currentState.currentPage = 1; currentState.typeFilter = ''; activeResultsTab = 'allFiles'; currentItemDetailData = null; isShareMode = false; lastFocusedElement = null; }

    // --- Initial Data Loading and Setup ---
    async function fetchApiData(params = {}) { if (searchAbortController) { searchAbortController.abort(); } searchAbortController = new AbortController(); const signal = searchAbortController.signal; const query = new URLSearchParams();
         if (!params.id) {
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
         } else {
             query.set('id', params.id);
         } const url = `${config.MOVIE_DATA_API_URL}?${query.toString()}`; console.log(`Fetching API: ${url}`); try { const response = await fetch(url, { signal }); if (!response.ok) { let errorBody = null; try { errorBody = await response.json(); } catch (_) {} const errorDetails = errorBody?.error || errorBody?.details || `Status: ${response.status}`; throw new Error(`API Error: ${errorDetails}`); } const data = await response.json(); console.log(`API data received:`, data);
             if (!params.id && tabMappings[activeResultsTab]) {
                const activePagination = tabMappings[activeResultsTab]?.pagination;
                if (activePagination && data.totalPages !== undefined) {
                    activePagination.dataset.totalPages = data.totalPages;
                }
             } return data; } catch (error) { if (error.name === 'AbortError') { console.log('API fetch aborted.'); return null; } console.error(`Error fetching data from ${url}:`, error); throw error; } finally { if (signal === searchAbortController?.signal) { searchAbortController = null; } } }
    async function fetchAndRenderResults() { if (currentViewMode !== 'search') return; try { const apiResponse = await fetchApiData(); if (apiResponse === null) return;
         renderActiveResultsView(apiResponse); saveStateToLocalStorage(); } catch (error) { console.error("Failed to fetch/render search results:", error); const { tableBody } = tabMappings[activeResultsTab]; if (tableBody) { tableBody.innerHTML = `<tr><td colspan="6" class="error-message">Error loading results: ${error.message}. Please try again.</td></tr>`; } Object.values(tabMappings).forEach(m => { if(m.pagination) m.pagination.style.display = 'none'; }); } }
    function populateQualityFilter(items = []) { if (!qualityFilterSelect) return; const currentSelectedValue = qualityFilterSelect.value; items.forEach(item => { if (item.displayQuality && item.displayQuality !== 'N/A') { uniqueQualities.add(item.displayQuality); } }); const sortedQualities = [...uniqueQualities].sort((a, b) => { const getScore = (q) => { q = String(q || '').toUpperCase().trim(); const resMatch = q.match(/^(\d{3,4})P$/); if (q === '4K' || q === '2160P') return 100; if (resMatch) return parseInt(resMatch[1], 10); if (q === '1080P') return 90; if (q === '720P') return 80; if (q === '480P') return 70; if (['WEBDL', 'BLURAY', 'BDRIP', 'BRRIP'].includes(q)) return 60; if (['WEBIP', 'HDTV', 'HDRIP'].includes(q)) return 50; if (['DVD', 'DVDRIP'].includes(q)) return 40; if (['DVDSCR', 'HC', 'HDCAM', 'TC', 'TS', 'CAM'].includes(q)) return 30; if (['HDR', 'DOLBY VISION', 'DV', 'HEVC', 'X265'].includes(q)) return 20; return 0; }; const scoreA = getScore(a); const scoreB = getScore(b); if (scoreA !== scoreB) return scoreB - scoreA; return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' }); }); while (qualityFilterSelect.options.length > 1) { qualityFilterSelect.remove(1); } sortedQualities.forEach(quality => { if (quality && quality !== 'N/A') { const option = document.createElement('option'); option.value = quality; option.textContent = quality; qualityFilterSelect.appendChild(option); } }); qualityFilterSelect.value = [...qualityFilterSelect.options].some(opt => opt.value === currentSelectedValue) ? currentSelectedValue : ""; updateFilterIndicator(); }
    function displayLoadError(message) { const errorHtml = `<div class="error-container" role="alert">${sanitize(message)}</div>`; if (searchFocusArea) searchFocusArea.innerHTML = ''; searchFocusArea.style.display = 'none'; if (resultsArea) resultsArea.innerHTML = ''; resultsArea.style.display = 'none'; if (updatesPreviewSection) updatesPreviewSection.innerHTML = ''; updatesPreviewSection.style.display = 'none'; if (itemDetailContent) itemDetailContent.innerHTML = ''; if (itemDetailView) itemDetailView.style.display = 'none'; if (pageFooter) pageFooter.style.display = 'none'; container.classList.remove('results-active', 'item-detail-active'); if (mainErrorArea) { mainErrorArea.innerHTML = errorHtml; } else if (container) { container.insertAdjacentHTML('afterbegin', errorHtml); } if (pageLoader) pageLoader.style.display = 'none'; }
    async function initializeApp() {
        isInitialLoad = true;
        if (pageLoader) pageLoader.style.display = 'flex';

        // Load state first
        loadStateFromLocalStorage();

        // Handle URL early to set initial view mode
        handleUrlChange();

        // Apply loaded quality filter state if applicable
        if (qualityFilterSelect) {
             qualityFilterSelect.value = currentState.qualityFilter || '';
             updateFilterIndicator();
        }

        try {
            // Fetch suggestion/quality data in the background
            console.log("Fetching initial data for suggestions/quality filter...");
            // Fetch a reasonable number, maybe not 5000 if it causes perf issues?
            // Adjust limit based on backend performance and data size. Let's try 2000.
            const suggestionData = await fetchApiData({ limit: 2000, sort: 'lastUpdated', sortDir: 'desc' });

            if (suggestionData && suggestionData.items) {
                localSuggestionData = suggestionData.items.map(preprocessMovieData);
                console.log(`Loaded ${localSuggestionData.length} items for suggestions.`);
                populateQualityFilter(localSuggestionData);
            } else {
                console.warn("Could not load initial data for suggestions/quality filter.");
            }

             // Now, trigger updates preview load *only if* we are still on the homepage
             if (currentViewMode === 'homepage') {
                  await loadUpdatesPreview(); // Use await to ensure it tries to load before hiding loader
             } else {
                 // If not on homepage (e.g., direct link to item), hide the preview section
                 if (updatesPreviewSection) updatesPreviewSection.style.display = 'none';
             }

        } catch (error) {
            console.error('FATAL: Failed during app initialization:', error);
            displayLoadError(`Error initializing app: ${error.message}. Try refreshing.`);
            // No finally block for loader needed here, error handles display
            return; // Stop initialization on fatal error
        }

        // Hide loader only after essential setup and potentially first data load attempt
        if (pageLoader) pageLoader.style.display = 'none';
        isInitialLoad = false; // Mark initial setup phase as done AFTER loader hides
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
                return;
            }
            event.preventDefault();

            console.log(`Action clicked: ${action}`);

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
         if (playerCustomUrlFeedback) playerCustomUrlFeedback.textContent = ''; videoContainer.style.display = 'flex';
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
         videoElement.style.display = isHidden ? 'none' : 'block';
         customControlsContainer.style.display = isHidden ? 'none' : 'flex';
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
          setTimeout(() => { videoContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150);
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
         isGlobalCustomUrlMode = false;

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
             else { console.error("HubCloud Bypass failed:", error); setBypassButtonState(buttonElement, 'error', `Failed: ${error.message.substring(0, 50)}`); }
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
             else { console.error("GDFLIX Bypass failed:", error); setBypassButtonState(buttonElement, 'error', `Failed: ${error.message.substring(0, 50)}`); }
         }
     }
    function updateItemDetailAfterBypass(encodedFinalUrl) {
          if (!currentItemDetailData || !itemDetailContent) {
              console.error("Cannot update item detail view: missing data or container.");
              return;
          }
          currentItemDetailData.url = encodedFinalUrl;
          console.log(`Updated item detail data (ID: ${currentItemDetailData.id}) in memory with bypassed URL.`);

          const actionHTML = createItemDetailContentHTML(currentItemDetailData, null); // Pass null for tmdbDetails initially, re-fetch happens in displayItemDetail
          itemDetailContent.innerHTML = actionHTML;
          console.log(`Successfully re-rendered item detail content for item ID: ${currentItemDetailData.id} after bypass.`);

          // Re-fetch TMDb data as well, as the item content was fully replaced
          // This reuses the logic already in displayItemDetail to handle TMDb fetch
          displayItemDetail(currentItemDetailData.id, isShareMode);


          const playButton = itemDetailContent.querySelector('.play-button');
          if(playButton) {
              setTimeout(() => playButton.focus(), 50);
          }

           if (videoContainer.parentElement && videoContainer.style.display !== 'none') {
             console.log("Re-attaching player to updated item detail content.");
             itemDetailContent.appendChild(videoContainer);
           }
     }
    function setBypassButtonState(buttonElement, state, message = null) {
         if (!buttonElement) return;
         const feedbackSpan = buttonElement.nextElementSibling; const iconSpan = buttonElement.querySelector('.button-icon'); const spinnerSpan = buttonElement.querySelector('.button-spinner'); const textSpan = buttonElement.querySelector('.button-text');
         const isHubCloud = buttonElement.classList.contains('hubcloud-bypass-button'); const defaultText = isHubCloud ? 'Bypass HubCloud' : 'Bypass GDFLIX'; const defaultIconHTML = isHubCloud ? '☁️' : '🎬';
         buttonElement.classList.remove('loading', 'error', 'success'); buttonElement.disabled = false;
         if (feedbackSpan) feedbackSpan.style.display = 'none'; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block';
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

         const actionTrigger = target.closest('#item-detail-content .button, #videoContainer .button:not(.close-btn)');
         if (actionTrigger && !actionTrigger.closest('.custom-controls')) {
             handleActionClick(event);
             return;
         }

          if (target.matches('.close-btn') && target.closest('#videoContainer')) {
              lastFocusedElement = target;
              closePlayer(lastFocusedElement);
              return;
          }

         if (target.closest('th.sortable')) {
             handleSort(event);
             return;
         }
    }

    // --- Add Event Listeners ---
    document.addEventListener('DOMContentLoaded', async () => {
         await initializeApp(); // Call initializeApp here

         if (searchInput) {
             searchInput.addEventListener('input', handleSearchInput);
             searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSearchSubmit(); } else if (event.key === 'Escape') { suggestionsContainer.style.display = 'none'; } });
             searchInput.addEventListener('search', handleSearchClear);
             searchInput.addEventListener('blur', () => { setTimeout(() => { const searchButton = document.getElementById('searchSubmitButton'); if (document.activeElement !== searchInput && !suggestionsContainer.contains(document.activeElement) && document.activeElement !== searchButton) { suggestionsContainer.style.display = 'none'; } }, 150); });
         }

         if (qualityFilterSelect) { qualityFilterSelect.addEventListener('change', triggerFilterChange); }

         if (resultsArea) { resultsArea.addEventListener('click', handleContentClick); }
         if (updatesPreviewList) { updatesPreviewList.addEventListener('click', handleContentClick); }
         if (itemDetailView) { itemDetailView.addEventListener('click', handleContentClick); }

         if (playCustomUrlGlobalButton) { playCustomUrlGlobalButton.addEventListener('click', handleGlobalCustomUrlClick); }

         document.addEventListener('keydown', handlePlayerKeyboardShortcuts);

         document.addEventListener('click', (event) => {
             if (searchInput && suggestionsContainer && suggestionsContainer.style.display === 'block') { const searchWrapper = searchInput.closest('.search-input-wrapper'); if (searchWrapper && !searchWrapper.contains(event.target)) { suggestionsContainer.style.display = 'none'; } }
             if (videoContainer && videoContainer.style.display !== 'none' && !isGlobalCustomUrlMode) {
                 const clickedInsidePlayer = videoContainer.contains(event.target);
                 const clickedInsideDetailContent = itemDetailContent?.contains(event.target);
                 if (!clickedInsidePlayer && !clickedInsideDetailContent) {
                     let triggerElement = lastFocusedElement;
                     let clickedOnTrigger = triggerElement && triggerElement.contains(event.target);
                      if (!clickedOnTrigger) {
                         console.log("Clicked outside player's detail view context. Closing player.");
                         closePlayer(event.target);
                     }
                 }
             } else if (videoContainer && videoContainer.style.display !== 'none' && isGlobalCustomUrlMode) {
                 const clickedInsidePlayer = videoContainer.contains(event.target);
                 const clickedOnGlobalTrigger = playCustomUrlGlobalButton && playCustomUrlGlobalButton.contains(event.target);
                 if (!clickedInsidePlayer && !clickedOnGlobalTrigger) {
                      console.log("Clicked outside global player and its trigger. Closing player.");
                      closePlayer(event.target);
                 }
             }
         }, false);

         if(videoElement) {
             videoElement.addEventListener('volumechange', () => { if (volumeSlider && Math.abs(parseFloat(volumeSlider.value) - videoElement.volume) > 0.01) { volumeSlider.value = videoElement.volume; } updateMuteButton(); try { localStorage.setItem(config.PLAYER_VOLUME_KEY, String(videoElement.volume)); } catch (e) { console.warn("LocalStorage volume save failed", e); } });
             videoElement.addEventListener('ratechange', () => { if(playbackSpeedSelect && playbackSpeedSelect.value !== String(videoElement.playbackRate)) { playbackSpeedSelect.value = String(videoElement.playbackRate); } try { localStorage.setItem(config.PLAYER_SPEED_KEY, String(videoElement.playbackRate)); } catch (e) { console.warn("LocalStorage speed save failed", e); } });
             videoElement.addEventListener('loadedmetadata', populateAudioTrackSelector);
             videoElement.removeEventListener('error', handleVideoError); videoElement.addEventListener('error', handleVideoError);
         }

         document.addEventListener('fullscreenchange', handleFullscreenChange); document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

     }); // End DOMContentLoaded

})(); // End of IIFE
// --- END OF script.js ---
