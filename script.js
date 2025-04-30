// --- START OF script.js (MODIFIED FOR ITEM DETAIL PAGE NAVIGATION) ---
(function() {
    'use strict';

    // ===========================================================
    // JAVASCRIPT SECTION (Updated for Item Detail Page Navigation)
    // ===========================================================
    const config = {
        HDR_LOGO_URL: "https://as1.ftcdn.net/v2/jpg/05/32/83/72/1000_F_532837228_v8CGZRU0jy39uCtqFRnJz6xDntrGuLLx.webp",
        FOURK_LOGO_URL: "https://i.pinimg.com/736x/85/c4/b0/85c4b0a2fb8612825d0cd2f53460925f.jpg",
        ITEMS_PER_PAGE: 50,
        LOCAL_STORAGE_KEY: 'cinemaGharState_v14_detailpage', // Incremented version
        PLAYER_VOLUME_KEY: 'cinemaGharPlayerVolume',
        PLAYER_SPEED_KEY: 'cinemaGharPlayerSpeed',
        SEARCH_DEBOUNCE_DELAY: 300,
        SUGGESTIONS_DEBOUNCE_DELAY: 250,
        MAX_SUGGESTIONS: 50,
        UPDATES_PREVIEW_INITIAL_COUNT: 10,
        UPDATES_PREVIEW_LOAD_MORE_COUNT: 10,
        MOVIE_DATA_API_URL: '/api/movies',
        BYPASS_API_URL: 'https://hubcloud-bypass.onrender.com/api/hubcloud',
        GDFLIX_BYPASS_API_URL: 'https://gdflix-bypass.onrender.com/api/gdflix',
        BYPASS_TIMEOUT: 60000
    };

    // --- DOM Element References ---
    const container = document.getElementById('cinemaghar-container');
    const pageLoader = document.getElementById('page-loader');
    const searchFocusArea = document.getElementById('search-focus-area');
    const resultsArea = document.getElementById('results-area');
    // REMAMED shared-item-view conceptually to item-detail-view, but keeping IDs for now
    const itemViewArea = document.getElementById('shared-item-view'); // Was: sharedItemView
    const itemViewContent = document.getElementById('shared-item-content'); // Was: sharedItemContent
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
    const backToItemViewButton = document.getElementById('backToHomeButtonShared'); // Renamed conceptually
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
    let currentViewData = []; // Holds data for the *currently displayed* results tab
    let weeklyUpdatesData = []; // Holds data specifically for the homepage preview
    let viewedItemData = null; // Holds the data for the currently displayed item detail view
    let updatesPreviewShownCount = 0;
    let uniqueQualities = new Set();
    // REMOVED: activeTableActionRow, activePreviewActionRow
    let copyFeedbackTimeout;
    let bypassFeedbackTimeout;
    let suggestionDebounceTimeout;
    let searchAbortController = null;
    let isDirectShareLoad = false; // If page loaded directly via ?shareId=
    let currentViewMode = 'homepage'; // 'homepage', 'search', 'itemView'
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

    // --- Utility Functions (Unchanged unless noted) ---
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
         // Show custom URL toggle ONLY if player is associated with the item view area
         if (!isGlobalCustomUrlMode && itemViewContent && videoContainer?.parentElement === itemViewContent) {
              const customUrlToggleButton = itemViewContent.querySelector('.custom-url-toggle-button');
              if (customUrlToggleButton) {
                  console.log("Playback error occurred in item view, showing custom URL toggle button.");
                  customUrlToggleButton.style.display = 'inline-flex';
                  if (playerCustomUrlSection && playerCustomUrlSection.style.display === 'none') {
                     toggleCustomUrlInput(customUrlToggleButton, true);
                  }
                  setTimeout(() => { customUrlToggleButton.focus(); }, 100);
              } else { console.warn("Could not find custom URL toggle button in the item view content after video error."); }
         } else if (isGlobalCustomUrlMode) {
              if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'flex';
              if (videoElement) videoElement.style.display = 'none';
              if (customControlsContainer) customControlsContainer.style.display = 'none';
         }
     }
    function extractQualityFromFilename(filename) { if (!filename) return null; const safeFilename = String(filename); const patterns = [ /(?:^|\.|\[|\(|\s|_|-)((?:4k|2160p|1080p|720p|480p))(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(WEB-?DL|WEBRip|BluRay|BDRip|BRRip|HDTV|HDRip|DVDrip|DVDScr|HDCAM|HC|TC|TS|CAM)(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(HDR|DV|Dolby.?Vision|HEVC|x265)(?=$|\.|\]|\)|\s|_|-)/i ]; let foundQuality = null; for (const regex of patterns) { const match = safeFilename.match(regex); if (match && match[1]) { let quality = match[1].toUpperCase(); quality = quality.replace(/WEB-?DL/i, 'WEBDL'); quality = quality.replace(/BLURAY/i, 'BluRay'); quality = quality.replace(/DVDRIP/i, 'DVD'); quality = quality.replace(/DOLBY.?VISION/i, 'Dolby Vision'); if (quality === '2160P') quality = '4K'; if (patterns.indexOf(regex) < 2) return quality; if (patterns.indexOf(regex) === 2 && !foundQuality) foundQuality = quality; } } return foundQuality; }
    function normalizeTextForSearch(text) { if (!text) return ""; return String(text) .toLowerCase() .replace(/[.\-_\(\)\[\]]/g, '') .replace(/\s+/g, ' ') .trim(); }
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    async function copyToClipboard(text, feedbackSpan) { console.log("Attempting to copy:", text); let success = false; if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) { try { await navigator.clipboard.writeText(text); success = true; console.log("navigator.clipboard.writeText SUCCEEDED"); } catch (err) { console.error("Async clipboard write failed:", err); success = false; } } if (!success) { console.warn("Using fallback copy method (execCommand)."); const textArea = document.createElement("textarea"); textArea.value = text; textArea.style.position = "fixed"; textArea.style.top = "-9999px"; textArea.style.left = "-9999px"; textArea.style.opacity = "0"; textArea.setAttribute("readonly", ""); document.body.appendChild(textArea); try { textArea.select(); textArea.setSelectionRange(0, textArea.value.length); success = document.execCommand('copy'); console.log("Fallback execCommand result:", success); } catch (err) { console.error('Fallback copy execCommand failed:', err); success = false; } finally { document.body.removeChild(textArea); } } if (success) { console.log("Copy successful!"); if (feedbackSpan) { showCopyFeedback(feedbackSpan, 'Copied!', false); } } else { console.error("Copy FAILED."); if (feedbackSpan) { showCopyFeedback(feedbackSpan, 'Copy Failed!', true); } else { alert("Copy failed. Please try again or copy manually. Check console for errors (F12)."); } } return success; }

    // --- Data Preprocessing (Unchanged) ---
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

    // --- HTML Generation (For Item Detail View ONLY) ---
    // This function now ONLY generates the content for the item detail page (#itemViewContent)
    function createItemDetailContentHTML(movie) {
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

        // Trailer Link Logic (Unchanged)
        let youtubeTrailerButtonHTML = '';
        const titleForSearch = movie.extractedTitle || streamTitle;
        const yearForSearch = movie.extractedYear;
        const seasonForSearch = movie.extractedSeason;
        const languages = (movie.languages || '').toLowerCase();
        const includesHindi = languages.includes('hindi');
        if (titleForSearch) {
            let searchTerms = [titleForSearch];
            if (movie.isSeries && seasonForSearch) { searchTerms.push(`Season ${seasonForSearch}`); }
            else if (!movie.isSeries && yearForSearch) { searchTerms.push(String(yearForSearch)); }
            searchTerms.push("Official Trailer");
            if (includesHindi) { searchTerms.push("Hindi"); }
            const youtubeSearchQuery = encodeURIComponent(searchTerms.join(' '));
            const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${youtubeSearchQuery}`;
            const youtubeIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M21.582,6.186c-0.23-0.86-0.908-1.538-1.768-1.768C18.267,4,12,4,12,4S5.733,4,4.186,4.418 c-0.86,0.23-1.538,0.908-1.768,1.768C2,7.734,2,12,2,12s0,4.266,0.418,5.814c0.23,0.86,0.908,1.538,1.768,1.768 C5.733,20,12,20,12,20s6.267,0,7.814-0.418c0.861-0.23,1.538-0.908,1.768-1.768C22,16.266,22,12,22,12S22,7.734,21.582,6.186z M10,15.464V8.536L16,12L10,15.464z"></path></svg>`;
            youtubeTrailerButtonHTML = `<a href="${youtubeSearchUrl}" target="_blank" rel="noopener noreferrer" class="button youtube-button">${youtubeIconSVG} Watch Trailer</a>`;
        }

        // IMDb Link Logic (Unchanged)
        let imdbSearchButtonHTML = '';
        if (movie.extractedTitle) {
            let imdbQueryTerms = [`"${movie.extractedTitle}"`];
            if (!movie.isSeries && movie.extractedYear) { imdbQueryTerms.push(String(movie.extractedYear)); }
            imdbQueryTerms.push("IMDb");
            const imdbSearchQuery = imdbQueryTerms.join(' ');
            const imdbSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(imdbSearchQuery)}&btnI=1`;
            const imdbIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"></path></svg>`;
            imdbSearchButtonHTML = `<a href="${imdbSearchUrl}" target="_blank" rel="noopener noreferrer" class="button imdb-button" style="background-color: var(--button-imdb-bg);">${imdbIconSVG} View IMDb</a>`;
        }

        // --- Button Logic ---
        let urlDependentButtonsHTML = '';
        let bypassButtonsHTML = '';
        let otherLinkButtonsHTML = '';

        // 1. URL Dependent Buttons (Play, Download, Copy, Intent)
        if (movie.url) { // Use the potentially bypassed and encoded URL
            urlDependentButtonsHTML += `<button class="button play-button" data-action="play" data-title="${escapedStreamTitle}" data-url="${escapedUrl}" data-filename="${escapedFilename}"><span aria-hidden="true">▶️</span> Play here</button>`;
            urlDependentButtonsHTML += `<a class="button download-button" href="${movie.url}" download="${displayFilename}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">💾</span> Direct Download</a>`;
            urlDependentButtonsHTML += `<button class="button vlc-button" data-action="copy-vlc" data-url="${escapedUrl}"><span aria-hidden="true">📋</span> Copy URL (for VLC/MX)</button><span class="copy-feedback" role="status" aria-live="polite">Copied!</span>`;
            if (navigator.userAgent.toLowerCase().includes("android")) {
                urlDependentButtonsHTML += `<button class="button intent-button" data-action="open-intent" data-url="${escapedUrl}"><span aria-hidden="true">📱</span> Play in VLC or MX Player</button>`;
            }
        }
        // Wrap these buttons for structure on the detail page
        urlDependentButtonsHTML = `<div class="url-actions-container" id="url-actions-container-${escapedId}">${urlDependentButtonsHTML}</div>`;


        // 2. Bypass Buttons (HubCloud and GDFLIX)
        // The movie reference is always 'itemView' when generating for the detail page
        const movieRefAttr = 'data-movie-ref="itemView"'; // Use 'itemView' instead of 'shared'

        if (movie.hubcloud_link) {
            bypassButtonsHTML += `
                <button class="button hubcloud-bypass-button"
                        data-action="bypass-hubcloud"
                        data-hubcloud-url="${escapedHubcloudUrl}"
                        ${movieRefAttr}>
                    <span aria-hidden="true" class="button-icon">☁️</span>
                    <span class="button-spinner spinner"></span>
                    <span class="button-text">Bypass HubCloud</span>
                </button>
                <span class="bypass-feedback" role="status" aria-live="polite"></span>
            `;
        }
        if (movie.gdflix_link) {
             bypassButtonsHTML += `
                <button class="button gdflix-bypass-button"
                        data-action="bypass-gdflix"
                        data-gdflix-url="${escapedGdflixUrl}"
                        ${movieRefAttr}>
                    <span aria-hidden="true" class="button-icon">🎬</span>
                    <span class="button-spinner spinner"></span>
                    <span class="button-text">Bypass GDFLIX</span>
                </button>
                <span class="bypass-feedback" role="status" aria-live="polite"></span>
            `;
        }


        // 3. Other Link Buttons (Trailer, IMDb, Original Links, Custom URL, Share)
        otherLinkButtonsHTML += youtubeTrailerButtonHTML;
        otherLinkButtonsHTML += imdbSearchButtonHTML;
        // Custom URL Toggle Button (Only shown if needed, e.g., on playback error)
        otherLinkButtonsHTML += `<button class="button custom-url-toggle-button" data-action="toggle-custom-url" aria-expanded="false" style="display: none;"><span aria-hidden="true">🔗</span> Play Custom URL</button>`;
        // Original Links
        if (movie.telegram_link && movie.telegram_link.toLowerCase() !== 'null') otherLinkButtonsHTML += `<a class="button telegram-button" href="${sanitize(movie.telegram_link)}" target="_blank" rel="noopener noreferrer">Telegram File</a>`;
        if (movie.gdflix_link) otherLinkButtonsHTML += `<a class="button gdflix-button" href="${sanitize(movie.gdflix_link)}" target="_blank" rel="noopener noreferrer">GDFLIX Link</a>`;
        if (movie.hubcloud_link && movie.hubcloud_link.toLowerCase() !== 'null') {
            otherLinkButtonsHTML += `<a class="button hubcloud-button" href="${sanitize(movie.hubcloud_link)}" target="_blank" rel="noopener noreferrer">HubCloud Link</a>`;
        }
        if (movie.filepress_link) otherLinkButtonsHTML += `<a class="button filepress-button" href="${sanitize(movie.filepress_link)}" target="_blank" rel="noopener noreferrer">Filepress</a>`;
        if (movie.gdtot_link) otherLinkButtonsHTML += `<a class="button gdtot-button" href="${sanitize(movie.gdtot_link)}" target="_blank" rel="noopener noreferrer">GDToT</a>`;
        // Share Button
        if (movie.id) { otherLinkButtonsHTML += `<button class="button share-button" data-action="share" data-id="${escapedId}" data-title="${escapedStreamTitle}" data-filename="${escapedFilename}"><span aria-hidden="true">🔗</span> Share This Page</button><span class="copy-feedback share-fallback" role="status" aria-live="polite">Link copied!</span>`; }


        // Combine all parts for the detail view
        const detailContentHTML = `
            <div class="action-info" data-stream-title="${escapedStreamTitle}">
                <span class="info-item"><strong>Filename:</strong> ${displayFilename}</span>
                <span class="info-item"><strong>Quality:</strong> ${displayQuality} ${fourkLogoHtml}${hdrLogoHtml}</span>
                <span class="info-item"><strong>Size:</strong> ${displaySize}</span>
                <span class="info-item"><strong>Language:</strong> ${sanitize(movie.languages || 'N/A')}</span>
                <span class="info-item"><strong>Updated:</strong> ${formattedDateFull} (${formattedDateRelative})</span>
                ${movie.originalFilename ? `<span class="info-item"><strong>Original Name:</strong> ${sanitize(movie.originalFilename)}</span>` : ''}
            </div>
            <div class="action-buttons-container">
                ${urlDependentButtonsHTML}
                ${bypassButtonsHTML}
                ${otherLinkButtonsHTML}
            </div>
             <!-- Video player will be appended here by JS if needed -->
            `;
        return detailContentHTML;
    }

    // --- Table Row HTML (Updated) ---
    function createMovieTableRowHTML(movie, dataIndex) { // Removed actionRowId parameter
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

        // Create the URL for the item detail page
        const detailViewUrl = movie.id ? `${window.location.pathname}?shareId=${encodeURIComponent(movie.id)}` : '#'; // Use shareId parameter
        const titleAttr = `View details for: ${displayFilename}`;

        const mainRowHTML = `
            <tr class="movie-data-row" data-index="${dataIndex}" data-id="${sanitize(movie.id || '')}">
                <td class="col-id">${sanitize(movie.id || 'N/A')}</td>
                <td class="col-filename">
                    <a href="${detailViewUrl}" title="${titleAttr}" class="filename-link">
                      ${displayFilename}${fourkLogoHtml}${hdrLogoHtml}
                    </a>
                </td>
                <td class="col-size">${displaySize}</td>
                <td class="col-quality">${displayQuality}</td>
                <td class="col-updated" title="${formattedDateFull}">${formattedDateRelative}</td>
                <td class="col-view">
                    <a href="${detailViewUrl}" class="button view-button-link" title="${titleAttr}" aria-label="View Details">View</a>
                </td>
            </tr>`;
        return mainRowHTML;
    }


    // --- View Control (Updated) ---
    function setViewMode(mode) { // mode: 'homepage', 'search', 'itemView'
        console.log("Setting view mode to:", mode);
        const previousMode = currentViewMode;
        currentViewMode = mode;
        if (mode !== previousMode) { closePlayerIfNeeded(null); }

        container.classList.toggle('results-active', mode === 'search');
        container.classList.toggle('shared-view-active', mode === 'itemView'); // Use shared-view-active class for item view

        const showHomepage = mode === 'homepage';
        const showSearch = mode === 'search';
        const showItemView = mode === 'itemView';

        if (searchFocusArea) searchFocusArea.style.display = (showHomepage || showSearch) ? 'flex' : 'none';
        if (resultsArea) resultsArea.style.display = showSearch ? 'block' : 'none';
        if (itemViewArea) itemViewArea.style.display = showItemView ? 'block' : 'none'; // Use itemViewArea here
        if (updatesPreviewSection) updatesPreviewSection.style.display = showHomepage ? 'block' : 'none';
        if (pageFooter) pageFooter.style.display = (showHomepage || showSearch) ? 'flex' : 'none';

        if (showHomepage) {
            if (searchInput) searchInput.value = '';
            currentState.searchTerm = '';
            if (suggestionsContainer) suggestionsContainer.style.display = 'none';
            activeResultsTab = 'allFiles';
            currentState.currentPage = 1;
            currentState.typeFilter = '';
            // No action rows to close
            viewedItemData = null; // Clear item data when returning home
            if (weeklyUpdatesData.length > 0) {
                displayInitialUpdates();
            } else if (localSuggestionData.length > 0) {
                if (updatesPreviewList) updatesPreviewList.innerHTML = '<div class="status-message" style="text-align:center; padding: 15px 0;">No recent updates found.</div>';
                if (showMoreUpdatesButton) showMoreUpdatesButton.style.display = 'none';
            } else {
                if (updatesPreviewList) updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`;
            }
            document.title = "Cinema Ghar Index";
            // Reset URL hash/query if we came from item view? Optional. Let browser handle back for now.
        } else if (showSearch) {
            viewedItemData = null; // Clear item data when going to search
            document.title = "Cinema Ghar Index - Search";
        } else if (showItemView) {
             // Item title is set in displayItemDetails
        }
        saveStateToLocalStorage();
    }

    // Renamed window.resetToHomepage to reflect actual behavior
    window.goHome = function(event) {
        console.log("Navigating home explicitly.");
        // Use pushState to clear query params without full reload if possible
        if (window.history.pushState) {
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.pushState({ path: cleanUrl }, '', cleanUrl);
        } else {
            window.location.hash = ''; // Fallback
        }
        isDirectShareLoad = false; // Ensure this is reset
        setViewMode('homepage');
        // No need to re-focus search input here, just go home.
    }

    // New function for the back button on the item detail page
    window.goBack = function(event) {
        event.preventDefault();
        console.log("Navigating back using history.");
        // Move player back before navigating away
        if (videoContainer && videoContainer.style.display !== 'none') {
            closePlayer();
        }
        window.history.back();
        // Set timeout to check view mode after navigation potentially finishes
        setTimeout(() => {
            // If after a short delay we are *still* in itemView mode (e.g., history.back failed or landed on same page)
            // force navigation to homepage.
            if (currentViewMode === 'itemView') {
                console.warn("History.back() didn't navigate away from item view, forcing home navigation.");
                goHome();
            } else {
                // Check if we landed back on search results and need to re-apply focus or state
                 if (currentViewMode === 'search' && lastFocusedElement) {
                    // Attempt to refocus the element that triggered the item view
                    // This is tricky as the element might not exist if the page reloaded fully
                     try {
                         const originalElement = document.querySelector(`[data-id="${viewedItemData?.id}"] a.filename-link, [data-id="${viewedItemData?.id}"] a.view-button-link`);
                         if (originalElement) {
                            console.log("Attempting to refocus original trigger element");
                            originalElement.focus();
                         }
                     } catch (e) { console.warn("Could not refocus original element.", e); }
                     lastFocusedElement = null; // Reset
                 }
                 viewedItemData = null; // Clear item data
            }
        }, 150);
    }


    // --- Search and Suggestions Logic (Unchanged) ---
    function handleSearchInput() { clearTimeout(suggestionDebounceTimeout); const searchTerm = searchInput.value.trim(); if (searchTerm.length < 2) { suggestionsContainer.style.display = 'none'; return; } suggestionDebounceTimeout = setTimeout(() => { fetchAndDisplaySuggestions(searchTerm); }, config.SUGGESTIONS_DEBOUNCE_DELAY); }
    function fetchAndDisplaySuggestions(term) { const normalizedTerm = normalizeTextForSearch(term); if (!normalizedTerm) { suggestionsContainer.style.display = 'none'; return; } const matchingItems = localSuggestionData.filter(movie => movie.searchText.includes(normalizedTerm)).slice(0, config.MAX_SUGGESTIONS); suggestionsContainer.innerHTML = ''; if (matchingItems.length > 0) { const fragment = document.createDocumentFragment(); matchingItems.forEach(item => { const div = document.createElement('div'); let displayText = item.displayFilename; let highlighted = false; if (term.length > 0) { try { const safeTerm = escapeRegExp(term); const regex = new RegExp(`(${safeTerm})`, 'i'); if ((item.displayFilename || '').match(regex)) { div.innerHTML = (item.displayFilename || '').replace(regex, '<strong>$1</strong>'); highlighted = true; } } catch (e) { console.warn("Regex error during highlighting:", e); } } if (!highlighted) { div.textContent = item.displayFilename; } div.title = item.displayFilename; div.onclick = () => selectSuggestion(item.displayFilename); fragment.appendChild(div); }); suggestionsContainer.appendChild(fragment); suggestionsContainer.style.display = 'block'; } else { suggestionsContainer.style.display = 'none'; } }
    function selectSuggestion(selectedValue) { searchInput.value = selectedValue; suggestionsContainer.style.display = 'none'; handleSearchSubmit(); }
    window.handleSearchSubmit = function() { if (suggestionsContainer) { suggestionsContainer.style.display = 'none'; } const searchTerm = searchInput.value.trim(); console.log("Handling search submit for:", searchTerm); if (searchInput) { searchInput.blur(); } if (searchTerm.length === 0 && currentViewMode !== 'homepage') { goHome(); return; } if (searchTerm.length === 0 && currentViewMode === 'homepage') { return; } setViewMode('search'); activeResultsTab = 'allFiles'; currentState.currentPage = 1; currentState.searchTerm = searchTerm; currentState.qualityFilter = qualityFilterSelect.value || ''; currentState.typeFilter = ''; updateActiveTabAndPanel(); showLoadingStateInTables(`Searching for "${sanitize(searchTerm)}"...`); fetchAndRenderResults(); }
    function handleSearchClear() { clearTimeout(suggestionDebounceTimeout); suggestionsContainer.style.display = 'none'; if (currentViewMode !== 'homepage') { setTimeout(() => { if (searchInput.value.trim() === '') { console.log("Search input cleared via 'x', resetting to homepage."); goHome(); } }, 100); } else { currentState.searchTerm = ''; saveStateToLocalStorage(); } }
    function showLoadingStateInTables(message = 'Loading...') { const loadingHTML = `<tr><td colspan="6" class="loading-message" role="status" aria-live="polite"><div class="spinner"></div>${sanitize(message)}</td></tr>`; Object.values(tabMappings).forEach(mapping => { if (mapping?.tableBody) { mapping.tableBody.innerHTML = loadingHTML; } if (mapping?.pagination) { mapping.pagination.style.display = 'none'; } }); }

    // --- Updates Preview Logic (Updated) ---
    async function loadUpdatesPreview() { if (isDirectShareLoad || !updatesPreviewSection || !updatesPreviewList || !showMoreUpdatesButton) return; updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`; showMoreUpdatesButton.style.display = 'none'; updatesPreviewShownCount = 0; weeklyUpdatesData = []; try { const params = { sort: 'lastUpdated', sortDir: 'desc', limit: config.UPDATES_PREVIEW_INITIAL_COUNT, page: 1 }; const data = await fetchApiData(params); if (data && data.items && data.items.length > 0) { weeklyUpdatesData = data.items.map(preprocessMovieData); displayInitialUpdates(); console.log(`Loaded initial ${weeklyUpdatesData.length} updates. Total pages from API: ${data.totalPages}`); } else { updatesPreviewList.innerHTML = '<div class="status-message" style="text-align:center; padding: 15px 0;">No recent updates found.</div>'; showMoreUpdatesButton.style.display = 'none'; } } catch (error) { console.error("Failed to load updates preview:", error); updatesPreviewList.innerHTML = `<div class="error-message" style="text-align:center; padding: 15px 0;">Could not load updates. ${error.message}</div>`; showMoreUpdatesButton.style.display = 'none'; } }
    function displayInitialUpdates() { if (!updatesPreviewList || !showMoreUpdatesButton) return; updatesPreviewList.innerHTML = ''; updatesPreviewShownCount = 0; // No active action row to close
        if (weeklyUpdatesData.length === 0) { updatesPreviewList.innerHTML = '<div class="status-message" style="text-align:center; padding: 15px 0;">No recent updates found.</div>'; showMoreUpdatesButton.style.display = 'none'; return; } const initialCount = Math.min(weeklyUpdatesData.length, config.UPDATES_PREVIEW_INITIAL_COUNT); appendUpdatesToPreview(0, initialCount); updatesPreviewShownCount = initialCount; const potentiallyMore = weeklyUpdatesData.length >= config.UPDATES_PREVIEW_INITIAL_COUNT; if (potentiallyMore) { showMoreUpdatesButton.style.display = 'block'; showMoreUpdatesButton.disabled = false; showMoreUpdatesButton.textContent = "Show More"; } else { showMoreUpdatesButton.style.display = 'none'; } }
    window.appendMoreUpdates = async function() { if (!updatesPreviewList || !showMoreUpdatesButton) return; showMoreUpdatesButton.disabled = true; showMoreUpdatesButton.textContent = "Loading..."; const currentPage = Math.floor(weeklyUpdatesData.length / config.UPDATES_PREVIEW_LOAD_MORE_COUNT); const nextPage = currentPage + 1; console.log(`Attempting to load page ${nextPage} for updates preview.`); try { const params = { sort: 'lastUpdated', sortDir: 'desc', limit: config.UPDATES_PREVIEW_LOAD_MORE_COUNT, page: nextPage }; const data = await fetchApiData(params); if (data && data.items && data.items.length > 0) { const newItems = data.items.map(preprocessMovieData); const startIndex = weeklyUpdatesData.length; weeklyUpdatesData.push(...newItems); appendUpdatesToPreview(startIndex, weeklyUpdatesData.length); updatesPreviewShownCount = weeklyUpdatesData.length; console.log(`Loaded ${newItems.length} more updates. Total now: ${updatesPreviewShownCount}. Current API page: ${data.page}, Total API pages: ${data.totalPages}`); if (data.page >= data.totalPages) { showMoreUpdatesButton.textContent = "All Updates Shown"; } else { showMoreUpdatesButton.disabled = false; showMoreUpdatesButton.textContent = "Show More"; } } else { console.log("No more updates found from API."); showMoreUpdatesButton.textContent = "No More Updates"; } } catch (error) { console.error("Failed to load more updates:", error); showMoreUpdatesButton.textContent = "Error Loading"; showMoreUpdatesButton.disabled = false; } }
    function appendUpdatesToPreview(startIndex, endIndex) {
        if (!updatesPreviewList) return;
        const fragment = document.createDocumentFragment();
        const itemsToAppend = weeklyUpdatesData.slice(startIndex, endIndex);
        itemsToAppend.forEach((movie, indexInSlice) => {
            const overallIndex = startIndex + indexInSlice;
            if (!movie || !movie.id) return; // Skip if no ID for linking

            const itemDiv = document.createElement('div');
            itemDiv.className = 'update-item';
            itemDiv.dataset.index = overallIndex; // Keep index if needed elsewhere
            itemDiv.dataset.id = movie.id; // Add ID for potential focus tracking

            let hdrLogoHtml = ''; let fourkLogoHtml = '';
            const lowerFilename = (movie.displayFilename || '').toLowerCase();
            if (movie.displayQuality === '4K' || lowerFilename.includes('2160p') || lowerFilename.includes('.4k.')) { fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo fourk-logo" title="4K Ultra HD" />`; }
            if ((movie.displayQuality || '').includes('HDR') || (movie.displayQuality || '').includes('DOLBY VISION') || movie.displayQuality === 'DV' || lowerFilename.includes('hdr') || lowerFilename.includes('dolby.vision') || lowerFilename.includes('.dv.')) { hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo hdr-logo" title="HDR / Dolby Vision Content" />`; }

            const timestampString = movie.last_updated_ts;
            const formattedDateRelative = TimeAgo.format(timestampString);
            const dateObject = timestampString ? new Date(timestampString) : null;
            const formattedDateFull = (dateObject && !isNaN(dateObject)) ? TimeAgo.formatFullDate(dateObject) : 'N/A';

            // Create the URL for the item detail page
            const detailViewUrl = `${window.location.pathname}?shareId=${encodeURIComponent(movie.id)}`;
            const titleAttr = `View details for: ${movie.displayFilename}`;

            itemDiv.innerHTML = `
                <div class="preview-col-id" title="ID: ${sanitize(movie.id || 'N/A')}">${sanitize(movie.id || 'N/A')}</div>
                <div class="preview-col-filename">
                    <a href="${detailViewUrl}" title="${titleAttr}" class="filename-link">
                       ${sanitize(movie.displayFilename)}${fourkLogoHtml}${hdrLogoHtml}
                    </a>
                </div>
                <div class="preview-col-date" title="${formattedDateFull}"> ${formattedDateRelative} </div>
                <div class="preview-col-view">
                    <a href="${detailViewUrl}" class="button view-button-link" title="${titleAttr}" aria-label="View Details">View</a>
                </div>
            `;
            fragment.appendChild(itemDiv);
             // REMOVED: Creation of the actionRowDiv
        });

        const initialLoader = updatesPreviewList.querySelector('.loading-inline-spinner');
        if (initialLoader && startIndex === 0) { initialLoader.remove(); }
        updatesPreviewList.appendChild(fragment);
    }

    // --- Filtering, Sorting (Unchanged) ---
    function triggerFilterChange() { if (!qualityFilterSelect || currentViewMode !== 'search') return; const newQualityFilter = qualityFilterSelect.value; if (newQualityFilter !== currentState.qualityFilter) { currentState.qualityFilter = newQualityFilter; currentState.currentPage = 1; closePlayerIfNeeded(null); showLoadingStateInTables(`Applying filter: ${sanitize(newQualityFilter || 'All Qualities')}...`); fetchAndRenderResults(); } }
    function handleSort(event) { const header = event.target.closest('th.sortable'); if (!header || currentViewMode !== 'search') return; const sortKey = header.dataset.sortKey; if (!sortKey) return; const oldSortColumn = currentState.sortColumn; const oldSortDirection = currentState.sortDirection; if (currentState.sortColumn === sortKey) { currentState.sortDirection = currentState.sortDirection === 'asc' ? 'desc' : 'asc'; } else { currentState.sortColumn = sortKey; currentState.sortDirection = ['filename', 'quality'].includes(sortKey) ? 'asc' : 'desc'; } if (oldSortColumn !== currentState.sortColumn || oldSortDirection !== currentState.sortDirection) { currentState.currentPage = 1; closePlayerIfNeeded(null); showLoadingStateInTables(`Sorting by ${sanitize(sortKey)} (${currentState.sortDirection})...`); fetchAndRenderResults(); } }

    // --- Rendering Logic (Updated) ---
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

         currentViewData = itemsToRender.map(preprocessMovieData); // Still preprocess for potential future use/sorting

         let tableHtml = '';
         if (totalItems === 0) {
             let message = `No ${tabMappings[activeResultsTab].typeFilter || 'files'} found`;
             if (currentState.searchTerm) message += ` matching "${sanitize(currentState.searchTerm)}"`;
             if (currentState.qualityFilter) message += ` with quality "${sanitize(currentState.qualityFilter)}"`;
             message += '.';
             tableHtml = `<tr><td colspan="6" class="status-message">${message}</td></tr>`;
         } else {
             currentViewData.forEach((movie, indexOnPage) => {
                 // Call the updated function which returns HTML with <a> links
                 tableHtml += createMovieTableRowHTML(movie, indexOnPage);
             });
         }

         tableBody.innerHTML = tableHtml;
         renderPaginationControls(pagination, totalItems, currentPage, totalPages);
         updateActiveTabAndPanel();
         if (tableHead) updateSortIndicators(tableHead);
         updateFilterIndicator();
         // No action row to close
         console.timeEnd("renderActiveResultsView");
    }
    // --- renderPaginationControls, updateSortIndicators, updateFilterIndicator, updateActiveTabAndPanel (Unchanged) ---
    function renderPaginationControls(targetContainer, totalItems, currentPage, totalPages) { if (!targetContainer) return; if (totalItems === 0 || totalPages <= 1) { targetContainer.innerHTML = ''; targetContainer.style.display = 'none'; return; } targetContainer.dataset.totalPages = totalPages; targetContainer.innerHTML = ''; let paginationHTML = ''; const maxPagesToShow = 5; const halfPages = Math.floor(maxPagesToShow / 2); paginationHTML += `<button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled title="First page"' : 'title="Previous page"'}>« Prev</button>`; let startPage, endPage; if (totalPages <= maxPagesToShow + 2) { startPage = 1; endPage = totalPages; } else { startPage = Math.max(2, currentPage - halfPages); endPage = Math.min(totalPages - 1, currentPage + halfPages); if (currentPage - halfPages < 2) { endPage = Math.min(totalPages - 1, maxPagesToShow); } if (currentPage + halfPages > totalPages - 1) { startPage = Math.max(2, totalPages - maxPagesToShow + 1); } } if (startPage > 1) { paginationHTML += `<button onclick="changePage(1)" title="Page 1">1</button>`; if (startPage > 2) { paginationHTML += `<span class="page-info" title="Skipped pages">...</span>`; } } for (let i = startPage; i <= endPage; i++) { paginationHTML += (i === currentPage) ? `<span class="current-page">${i}</span>` : `<button onclick="changePage(${i})" title="Page ${i}">${i}</button>`; } if (endPage < totalPages) { if (endPage < totalPages - 1) { paginationHTML += `<span class="page-info" title="Skipped pages">...</span>`; } paginationHTML += `<button onclick="changePage(${totalPages})" title="Page ${totalPages}">${totalPages}</button>`; } paginationHTML += `<button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled title="Last page"' : 'title="Next page"'}>Next »</button>`; targetContainer.innerHTML = paginationHTML; targetContainer.style.display = 'block'; }
    function updateSortIndicators(tableHeadElement) { if (!tableHeadElement) return; tableHeadElement.querySelectorAll('th.sortable').forEach(th => { th.classList.remove('sort-asc', 'sort-desc'); const sortKey = th.dataset.sortKey; if (sortKey === currentState.sortColumn) { const directionClass = currentState.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc'; th.classList.add(directionClass); th.setAttribute('aria-sort', currentState.sortDirection === 'asc' ? 'ascending' : 'descending'); } else { th.removeAttribute('aria-sort'); } }); }
    function updateFilterIndicator() { if(qualityFilterSelect) { qualityFilterSelect.classList.toggle('filter-active', !!currentState.qualityFilter); } }
    function updateActiveTabAndPanel() { Object.keys(tabMappings).forEach(tabId => { const mapping = tabMappings[tabId]; const isActive = tabId === activeResultsTab; if (mapping?.button) mapping.button.classList.toggle('active', isActive); if (mapping?.panel) mapping.panel.classList.toggle('active', isActive); }); }

    // --- Pagination and Tab Switching (Unchanged) ---
    window.changePage = function(newPage) { if (currentViewMode !== 'search' || newPage < 1 || newPage === currentState.currentPage) { return; } const currentPagination = tabMappings[activeResultsTab]?.pagination; if(currentPagination && currentPagination.dataset.totalPages) { const totalP = parseInt(currentPagination.dataset.totalPages, 10); if(newPage > totalP) { console.log(`Change page request to ${newPage} denied, exceeds total pages (${totalP}).`); return; } } currentState.currentPage = newPage; closePlayerIfNeeded(null); fetchAndRenderResults().then(() => { const activeTableBody = tabMappings[activeResultsTab]?.tableBody; scrollToTopOfActiveTable(activeTableBody); }); saveStateToLocalStorage(); }
    function scrollToTopOfActiveTable(tableBodyElement) { if (!tableBodyElement) return; const tableContainer = tableBodyElement.closest('.table-container'); if (tableContainer) { const searchBarArea = container.querySelector('#search-focus-area'); const backButtonElem = resultsArea.querySelector('#backToHomeButtonResults'); const filterArea = resultsArea.querySelector('.results-filter-area'); const tabNav = resultsArea.querySelector('.tab-navigation'); let stickyHeaderHeight = 0; if (container.classList.contains('results-active')) { stickyHeaderHeight = (searchBarArea?.offsetHeight || 0) + (backButtonElem?.offsetHeight || 0) + (backButtonElem ? parseFloat(getComputedStyle(backButtonElem).marginBottom) : 0) + (filterArea?.offsetHeight || 0) + (tabNav?.offsetHeight || 0); } const elementTop = tableContainer.getBoundingClientRect().top + window.pageYOffset; const scrollPosition = elementTop - stickyHeaderHeight - 20; window.scrollTo({ top: scrollPosition, behavior: 'smooth' }); } }
    window.switchTab = function(tabId) { if (currentViewMode !== 'search' || tabId === activeResultsTab || !tabMappings[tabId]) { return; } activeResultsTab = tabId; currentState.currentPage = 1; currentState.typeFilter = tabMappings[tabId].typeFilter; closePlayerIfNeeded(null); // No action row to close
        updateActiveTabAndPanel(); showLoadingStateInTables(`Loading ${tabMappings[tabId].typeFilter || 'all files'}...`); fetchAndRenderResults(); saveStateToLocalStorage(); }

    // --- Action Row Logic (REMOVED) ---
    // REMOVED: closeActiveActionRow, toggleTableActions, togglePreviewActions
    // REMOVED: scrollToRowIfNeeded, focusFirstElementInContainer (specific to action rows)

    // --- Share Logic (Unchanged, button is now on item detail page) ---
    async function handleShareClick(buttonElement) { const itemId = buttonElement.dataset.id; const itemTitle = buttonElement.dataset.title || "Cinema Ghar Item"; const itemFilename = buttonElement.dataset.filename || ""; if (!itemId) { console.error("Share failed: Item ID missing."); alert("Cannot share this item (missing ID)."); return; } const shareUrl = `${window.location.origin}${window.location.pathname}?shareId=${encodeURIComponent(itemId)}`; const shareText = `Check out: ${itemTitle}\n${itemFilename ? `(${itemFilename})\n` : ''}`; const feedbackSpan = buttonElement.nextElementSibling; if (!feedbackSpan || !feedbackSpan.classList.contains('copy-feedback')) { console.warn("Share fallback feedback span not found next to button:", buttonElement); } if (navigator.share) { try { await navigator.share({ title: itemTitle, text: shareText, url: shareUrl, }); console.log('Successful share'); } catch (error) { console.error('Error sharing:', error); if (error.name !== 'AbortError') { if (feedbackSpan) { showCopyFeedback(feedbackSpan, 'Share failed!', true); } else { alert(`Share failed: ${error.message}`); } } } } else { console.log('Web Share API not supported, falling back to copy.'); await copyToClipboard(shareUrl, feedbackSpan); } }

    // --- Item Detail Display Logic (Updated) ---
    // Renamed from displaySharedItem to displayItemDetails for clarity
    async function displayItemDetails(itemId) {
        if (!itemId || !itemViewArea || !itemViewContent) return;

        itemViewContent.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading item details...</span></div>`;
        setViewMode('itemView'); // Set the view mode
        viewedItemData = null; // Reset previous item data

        try {
            const params = { id: itemId };
            const data = await fetchApiData(params);

            if (data && data.items && data.items.length > 0) {
                const itemRaw = data.items[0];
                viewedItemData = preprocessMovieData(itemRaw); // Store data for this view
                console.log("Displaying item details:", viewedItemData.displayFilename);

                const actionHTML = createItemDetailContentHTML(viewedItemData); // Use the dedicated function
                itemViewContent.innerHTML = actionHTML;
                document.title = `${viewedItemData.displayFilename || 'Item Details'} - Cinema Ghar`;

                // Ensure player is hidden initially when loading item details
                if (videoContainer) videoContainer.style.display = 'none';
                // Move player container into the item view content area *structurally*
                // It will be hidden until 'Play' is clicked
                if (videoContainer && videoContainer.parentElement !== itemViewContent) {
                     itemViewContent.appendChild(videoContainer);
                }

            } else {
                console.error("Item not found via API for ID:", itemId);
                itemViewContent.innerHTML = `<div class="error-message" role="alert">Error: Item with ID ${sanitize(itemId)} was not found. It might have been removed or the link is incorrect.</div>`;
                document.title = "Item Not Found - Cinema Ghar Index";
            }
        } catch (error) {
            console.error("Failed to fetch item details:", error);
            itemViewContent.innerHTML = `<div class="error-message" role="alert">Error loading item: ${error.message}. Please try again.</div>`;
            document.title = "Error Loading Item - Cinema Ghar Index";
        } finally {
            // Ensure view mode is correct even if errors occurred
            setViewMode('itemView');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    // --- Player Logic (Updated Context) ---
    function streamVideo(title, url, filenameForAudioCheck, isFromCustom = false) {
        // Player context is now ALWAYS the itemViewContent when not global custom URL
        let playerParentContainer = null;
        if (isGlobalCustomUrlMode) {
            // No specific parent needed, player is fixed/modal
        } else if (currentViewMode === 'itemView' && itemViewContent) {
            playerParentContainer = itemViewContent;
        } else {
             console.error("Cannot stream video: Invalid view mode or item view content not found.");
             return;
        }

        if (!videoContainer || !videoElement) { console.error("Cannot stream: player or video element missing."); return; }

        // Reset player state
        if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none';
        if (videoElement) videoElement.style.display = 'block';
        if (customControlsContainer) customControlsContainer.style.display = 'flex';
        if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; }
        if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; }
        clearCopyFeedback();

        // Ensure player is inside the correct container (itemViewContent or body for global)
        if (!isGlobalCustomUrlMode && playerParentContainer && videoContainer.parentElement !== playerParentContainer) {
            console.log("Moving video container to item view container:", playerParentContainer);
            // Pause/reset before moving if needed
             if (videoElement && videoElement.hasAttribute('src')) {
                 videoElement.pause();
                 videoElement.removeAttribute('src');
                 videoElement.currentTime = 0;
                 videoElement.load();
             }
             if (vlcBox) vlcBox.style.display = 'none';
            playerParentContainer.appendChild(videoContainer);
        } else if (isGlobalCustomUrlMode && videoContainer.parentElement !== document.body && videoContainer.parentElement !== container /* check both */) {
            // If global mode, player should ideally be appended to body or main container for fixed positioning
            console.log("Moving video container to main container for global mode.");
             if (videoElement && videoElement.hasAttribute('src')) videoElement.pause(); // Pause if playing elsewhere
             (container || document.body).appendChild(videoContainer);
        }


        // Set volume/speed
        const savedVolume = localStorage.getItem(config.PLAYER_VOLUME_KEY); const savedSpeed = localStorage.getItem(config.PLAYER_SPEED_KEY);
        videoElement.volume = (savedVolume !== null) ? Math.max(0, Math.min(1, parseFloat(savedVolume))) : 1;
        if (volumeSlider) volumeSlider.value = videoElement.volume; videoElement.muted = (videoElement.volume === 0);
        videoElement.playbackRate = (savedSpeed !== null) ? parseFloat(savedSpeed) : 1;
        if(playbackSpeedSelect) playbackSpeedSelect.value = String(videoElement.playbackRate); updateMuteButton(); videoElement.currentTime = 0;

        // Audio warning logic (Unchanged)
        const ddp51Regex = /\bDDP?([ ._-]?5\.1)?\b/i; const advancedAudioRegex = /\b(DTS|ATMOS|TrueHD)\b/i; const multiAudioHintRegex = /\b(Multi|Dual)[ ._-]?Audio\b/i;
        let warningText = "";
        if (filenameForAudioCheck && !isFromCustom) { const lowerFilename = (filenameForAudioCheck || '').toLowerCase(); if (ddp51Regex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DDP audio might not work in browser. Use 'Copy URL' or 'Play in VLC or MX Player'."; } else if (advancedAudioRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DTS/Atmos/TrueHD audio likely unsupported. Use external player."; } else if (multiAudioHintRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> May contain multiple audio tracks. Use selector below or external player."; } }
        if (warningText && audioWarningDiv) { audioWarningDiv.innerHTML = warningText; audioWarningDiv.style.display = 'block'; }

        // Set title, URL, play
        if (videoTitle) videoTitle.innerText = title || "Video";
        if (vlcText) vlcText.innerText = url;
        if (vlcBox) vlcBox.style.display = 'block';
        videoElement.src = url; videoElement.load(); videoElement.play().catch(e => { console.log("Autoplay was prevented or failed:", e.message); });

        // Ensure container is visible and scroll into view
        if (videoContainer.style.display === 'none') { videoContainer.style.display = 'flex'; }

        if (!isGlobalCustomUrlMode) {
            const closeButton = videoContainer.querySelector('.close-btn');
            if (closeButton) { setTimeout(() => closeButton.focus(), 100); }
            setTimeout(() => {
                 // Scroll the item view area, not just the player itself
                 itemViewArea?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 150);
        } else {
             // Global mode player is fixed, no scroll needed, focus input if first time
             if (playerCustomUrlInput && playerCustomUrlSection?.style.display === 'flex') {
                 setTimeout(() => playerCustomUrlInput.focus(), 50);
             }
        }
    }
    // --- closePlayer (minor adjustments for context) ---
    window.closePlayer = function(elementToFocusAfter = null) {
         if (elementToFocusAfter instanceof Event) { elementToFocusAfter = elementToFocusAfter?.target; }
         if (!videoContainer || !videoElement || videoContainer.style.display === 'none') return; // Exit if already hidden

         const wasPlaying = !videoElement.paused;
         const wasGlobalMode = isGlobalCustomUrlMode;
         const playerParentBeforeClose = videoContainer.parentElement; // Remember where it was

         console.log(`Closing player. Was global: ${wasGlobalMode}, Parent before close: ${playerParentBeforeClose?.id}`);

         // Exit fullscreen if active
         try { const fsElement = document.fullscreenElement || document.webkitFullscreenElement; if (fsElement && (fsElement === videoElement || fsElement === videoContainer)) { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } } catch(err) { console.error("Error exiting fullscreen:", err); }

         // Stop video and reset src
         videoElement.pause(); videoElement.removeAttribute('src'); videoElement.currentTime = 0; videoElement.load();

         // Hide player and reset state
         videoContainer.style.display = 'none';
         videoContainer.classList.remove('global-custom-url-mode', 'is-fullscreen');
         isGlobalCustomUrlMode = false;

         // Clean up player elements
         if (vlcBox) vlcBox.style.display = 'none';
         if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; }
         if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; }
         if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none';
         if (playerCustomUrlInput) playerCustomUrlInput.value = '';
         if (playerCustomUrlFeedback) playerCustomUrlFeedback.textContent = '';
         clearCopyFeedback();
         clearBypassFeedback();
         if (videoTitle) videoTitle.innerText = '';

         // Move player back to the main container if it's not already there
         // This ensures it's ready for the next potential use (either global or within an item view)
         const mainBodyContainer = document.getElementById('cinemaghar-container');
         if (mainBodyContainer && videoContainer.parentElement !== mainBodyContainer) {
             console.log("Moving video player back to main container after closing.");
             mainBodyContainer.appendChild(videoContainer);
         } else if (!mainBodyContainer) {
             console.warn("Main container #cinemaghar-container not found, cannot move player back.");
         }

         // Determine focus target
         let finalFocusTarget = elementToFocusAfter || lastFocusedElement;

         // If closed from within item view, focus might go back to the 'Play' button or 'Close' button's context
         if (!wasGlobalMode && playerParentBeforeClose === itemViewContent) {
             const playButton = itemViewContent.querySelector('.play-button');
             // If elementToFocusAfter wasn't the close button itself, maybe focus Play?
             if (!finalFocusTarget || !itemViewContent.contains(finalFocusTarget)) {
                finalFocusTarget = playButton || backToItemViewButton; // Fallback to back button
             }
         } else if (wasGlobalMode) {
             // If closed from global mode, maybe focus the global trigger button
             finalFocusTarget = playCustomUrlGlobalButton;
         }

         // Apply focus if a target is determined and valid
         if (finalFocusTarget && typeof finalFocusTarget.focus === 'function' && document.contains(finalFocusTarget)) {
             console.log("Returning focus to:", finalFocusTarget);
             setTimeout(() => {
                 // Check again if element is still focusable
                 if (document.contains(finalFocusTarget) && typeof finalFocusTarget.focus === 'function') {
                    finalFocusTarget.focus();
                 } else {
                    console.warn("Focus target became invalid before focus could be set.");
                 }
             }, 50);
         } else {
             console.log("No specific element to focus after closing player.");
         }
         lastFocusedElement = null; // Reset last focused element

    }
    // --- Other Player functions (seekVideo, toggleMute, etc.) are largely unchanged but context matters ---
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
    function highlightVlcText() { // This function likely only makes sense within the item detail view now
         if (currentViewMode !== 'itemView' || !itemViewContent) return;
         const currentVlcText = itemViewContent.querySelector('#vlcBox code'); // Look within itemViewContent
         if (currentVlcText && currentVlcText.closest('#vlcBox')?.style.display !== 'none') {
             try { const range = document.createRange(); range.selectNodeContents(currentVlcText); const selection = window.getSelection(); if (selection) { selection.removeAllRanges(); selection.addRange(range); } console.log("Highlighted VLC text as fallback."); }
             catch (selectErr) { console.warn("Could not highlight VLC text:", selectErr); }
         }
     }
    function handlePlayerKeyboardShortcuts(event) { if (!videoContainer || videoContainer.style.display === 'none' || !videoElement) return; const targetTagName = event.target.tagName.toLowerCase(); if (targetTagName === 'input' || targetTagName === 'select' || targetTagName === 'textarea') return; const key = event.key; let prevented = false; switch (key) { case ' ': case 'k': togglePlayPause(); prevented = true; break; case 'ArrowLeft': seekVideo(-10); prevented = true; break; case 'ArrowRight': seekVideo(10); prevented = true; break; case 'ArrowUp': setVolume(Math.min(videoElement.volume + 0.05, 1)); if(volumeSlider) volumeSlider.value = videoElement.volume; prevented = true; break; case 'ArrowDown': setVolume(Math.max(videoElement.volume - 0.05, 0)); if(volumeSlider) volumeSlider.value = videoElement.volume; prevented = true; break; case 'm': toggleMute(); prevented = true; break; case 'f': toggleFullscreen(); prevented = true; break; } if (prevented) event.preventDefault(); }

    // --- State Persistence (Unchanged) ---
    function saveStateToLocalStorage() { try { const stateToSave = {}; if (currentState.sortColumn !== 'lastUpdated') stateToSave.sortColumn = currentState.sortColumn; if (currentState.sortDirection !== 'desc') stateToSave.sortDirection = currentState.sortDirection; if (currentState.qualityFilter !== '') stateToSave.qualityFilter = currentState.qualityFilter; if (Object.keys(stateToSave).length > 0) { localStorage.setItem(config.LOCAL_STORAGE_KEY, JSON.stringify(stateToSave)); console.log("Saved state:", stateToSave); } else { localStorage.removeItem(config.LOCAL_STORAGE_KEY); console.log("State is default, removed saved state."); } } catch (e) { console.error("Failed to save state to localStorage:", e); } }
    function loadStateFromLocalStorage() { try { const savedState = localStorage.getItem(config.LOCAL_STORAGE_KEY); if (savedState) { const parsedState = JSON.parse(savedState); currentState.sortColumn = typeof parsedState.sortColumn === 'string' ? parsedState.sortColumn : 'lastUpdated'; currentState.sortDirection = (typeof parsedState.sortDirection === 'string' && ['asc', 'desc'].includes(parsedState.sortDirection)) ? parsedState.sortDirection : 'desc'; currentState.qualityFilter = typeof parsedState.qualityFilter === 'string' ? parsedState.qualityFilter : ''; console.log("Loaded state:", { sortColumn: currentState.sortColumn, sortDirection: currentState.sortDirection, qualityFilter: currentState.qualityFilter }); } else { currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc'; currentState.qualityFilter = ''; console.log("No saved state found, using defaults."); } } catch (e) { console.error("Failed to load or parse state from localStorage:", e); localStorage.removeItem(config.LOCAL_STORAGE_KEY); currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc'; currentState.qualityFilter = ''; } currentState.searchTerm = ''; currentState.currentPage = 1; currentState.typeFilter = ''; activeResultsTab = 'allFiles'; // No action rows activeTableActionRow = null; activePreviewActionRow = null; lastFocusedElement = null; }

    // --- Initial Data Loading and Setup (Updated) ---
    async function fetchApiData(params = {}) { if (searchAbortController) { searchAbortController.abort(); } searchAbortController = new AbortController(); const signal = searchAbortController.signal; const query = new URLSearchParams(); query.set('page', params.page || currentState.currentPage); query.set('limit', params.limit || currentState.limit); query.set('sort', params.sort || currentState.sortColumn); query.set('sortDir', params.sortDir || currentState.sortDirection); const searchTerm = params.search !== undefined ? params.search : currentState.searchTerm; if (searchTerm) query.set('search', searchTerm); const qualityFilter = params.quality !== undefined ? params.quality : currentState.qualityFilter; if (qualityFilter) query.set('quality', qualityFilter); const typeFilter = params.type !== undefined ? params.type : currentState.typeFilter; if (typeFilter) query.set('type', typeFilter); if (params.id) { // Fetching single item query.set('id', params.id); query.delete('search'); query.delete('quality'); query.delete('type'); query.delete('page'); query.delete('limit'); query.delete('sort'); query.delete('sortDir'); } const url = `${config.MOVIE_DATA_API_URL}?${query.toString()}`; console.log(`Fetching API: ${url}`); try { const response = await fetch(url, { signal }); if (!response.ok) { let errorBody = null; try { errorBody = await response.json(); } catch (_) {} const errorDetails = errorBody?.error || errorBody?.details || `Status: ${response.status}`; throw new Error(`API Error: ${errorDetails}`); } const data = await response.json(); console.log(`API data received:`, data); const activePagination = tabMappings[activeResultsTab]?.pagination; if(activePagination && data.totalPages !== undefined) { activePagination.dataset.totalPages = data.totalPages; } return data; } catch (error) { if (error.name === 'AbortError') { console.log('API fetch aborted.'); return null; } console.error(`Error fetching data from ${url}:`, error); throw error; } finally { if (signal === searchAbortController?.signal) { searchAbortController = null; } } }
    async function fetchAndRenderResults() { if (currentViewMode !== 'search') return; try { const apiResponse = await fetchApiData(); if (apiResponse === null) return; renderActiveResultsView(apiResponse); saveStateToLocalStorage(); } catch (error) { console.error("Failed to fetch/render search results:", error); const { tableBody } = tabMappings[activeResultsTab]; if (tableBody) { tableBody.innerHTML = `<tr><td colspan="6" class="error-message">Error loading results: ${error.message}. Please try again.</td></tr>`; } Object.values(tabMappings).forEach(m => { if(m.pagination) m.pagination.style.display = 'none'; }); } }
    // --- populateQualityFilter, displayLoadError (Unchanged) ---
    function populateQualityFilter(items = []) { if (!qualityFilterSelect) return; const currentSelectedValue = qualityFilterSelect.value; items.forEach(item => { if (item.displayQuality && item.displayQuality !== 'N/A') { uniqueQualities.add(item.displayQuality); } }); const sortedQualities = [...uniqueQualities].sort((a, b) => { const getScore = (q) => { q = String(q || '').toUpperCase().trim(); const resMatch = q.match(/^(\d{3,4})P$/); if (q === '4K' || q === '2160P') return 100; if (resMatch) return parseInt(resMatch[1], 10); if (q === '1080P') return 90; if (q === '720P') return 80; if (q === '480P') return 70; if (['WEBDL', 'BLURAY', 'BDRIP', 'BRRIP'].includes(q)) return 60; if (['WEBIP', 'HDTV', 'HDRIP'].includes(q)) return 50; if (['DVD', 'DVDRIP'].includes(q)) return 40; if (['DVDSCR', 'HC', 'HDCAM', 'TC', 'TS', 'CAM'].includes(q)) return 30; if (['HDR', 'DOLBY VISION', 'DV', 'HEVC', 'X265'].includes(q)) return 20; return 0; }; const scoreA = getScore(a); const scoreB = getScore(b); if (scoreA !== scoreB) return scoreB - scoreA; return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' }); }); while (qualityFilterSelect.options.length > 1) { qualityFilterSelect.remove(1); } sortedQualities.forEach(quality => { if (quality && quality !== 'N/A') { const option = document.createElement('option'); option.value = quality; option.textContent = quality; qualityFilterSelect.appendChild(option); } }); qualityFilterSelect.value = [...qualityFilterSelect.options].some(opt => opt.value === currentSelectedValue) ? currentSelectedValue : ""; updateFilterIndicator(); }
    function displayLoadError(message) { const errorHtml = `<div class="error-container" role="alert">${sanitize(message)}</div>`; if (searchFocusArea) searchFocusArea.innerHTML = ''; searchFocusArea.style.display = 'none'; if (resultsArea) resultsArea.innerHTML = ''; resultsArea.style.display = 'none'; if (updatesPreviewSection) updatesPreviewSection.innerHTML = ''; updatesPreviewSection.style.display = 'none'; if (itemViewContent) itemViewContent.innerHTML = ''; if (itemViewArea) itemViewArea.style.display = 'none'; if (pageFooter) pageFooter.style.display = 'none'; container.classList.remove('results-active', 'shared-view-active'); if (mainErrorArea) { mainErrorArea.innerHTML = errorHtml; } else if (container) { container.insertAdjacentHTML('afterbegin', errorHtml); } if (pageLoader) pageLoader.style.display = 'none'; }
    // --- initializeApp (Updated) ---
    async function initializeApp() {
         const urlParams = new URLSearchParams(window.location.search);
         const itemId = urlParams.get('shareId'); // Use same param for direct view or share
         isDirectShareLoad = !!itemId;

         if (pageLoader) pageLoader.style.display = 'flex';

         // Move player to main container initially, ready to be moved if needed
         if (videoContainer && container && videoContainer.parentElement !== container) {
             container.appendChild(videoContainer);
         }

         if (itemId) {
             console.log("Item ID detected in URL:", itemId);
             // Directly display the item details
             await displayItemDetails(itemId);
             // Fetch quality data in background (optional)
             fetchApiData({limit: 100, sort: 'quality', sortDir: 'asc'})
                 .then(data => { if (data && data.items) { populateQualityFilter(data.items.map(preprocessMovieData)); } })
                 .catch(e => console.warn("Background quality fetch failed", e));
         } else {
             console.log("No item ID in URL, preparing homepage view.");
             if (searchFocusArea) searchFocusArea.style.display = 'flex';
             if (pageFooter) pageFooter.style.display = 'flex';
             if (resultsArea) resultsArea.style.display = 'none';
             if (itemViewArea) itemViewArea.style.display = 'none';
             const defaultMessageHTML = `<tr><td colspan="6" class="status-message">Enter search term above.</td></tr>`;
             Object.values(tabMappings).forEach(mapping => {
                 if (mapping?.tableBody) mapping.tableBody.innerHTML = defaultMessageHTML;
                 if (mapping?.pagination) mapping.pagination.style.display = 'none';
             });

             loadStateFromLocalStorage(); // Load sort/filter preferences
             await loadUpdatesPreview(); // Load recent updates for homepage

             console.log("Fetching initial data for suggestions/quality...");
             const suggestionData = await fetchApiData({ limit: 5000, sort: 'lastUpdated', sortDir: 'desc' });
             if(suggestionData && suggestionData.items) {
                 localSuggestionData = suggestionData.items.map(preprocessMovieData);
                 console.log(`Loaded ${localSuggestionData.length} items for suggestions.`);
                 populateQualityFilter(localSuggestionData); // Populate filter from suggestions data
             } else {
                 console.warn("Could not load initial data for suggestions/quality filter.");
             }
             setViewMode('homepage'); // Set initial view mode
         }

         if (qualityFilterSelect) {
             qualityFilterSelect.value = currentState.qualityFilter || '';
             updateFilterIndicator();
         }

         // Update back button onclick handler AFTER initialization
         if (backToItemViewButton) {
             backToItemViewButton.onclick = goBack; // Set to use history.back
         }
         // Reset home button onclick (if needed, already set in HTML but reinforces)
         const homeTitle = document.querySelector('.simple-title');
         if (homeTitle) {
             homeTitle.onclick = goHome;
         }
         if (backToHomeButtonResults) {
            backToHomeButtonResults.onclick = goHome;
         }


         if (pageLoader) pageLoader.style.display = 'none';
     }


    // --- Event Handling Setup (Updated) ---
    function handleActionClick(event) { // Handles clicks INSIDE #itemViewContent
         const target = event.target;
         const button = target.closest('.action-buttons-container .button, #playerCustomUrlSection button'); // Look for buttons in the action container OR the player's custom URL section

         if (button) {
            const action = button.dataset.action;
            const url = button.dataset.url;
            let title = button.dataset.title || viewedItemData?.displayFilename || "Video"; // Use item data title
            const filename = button.dataset.filename || viewedItemData?.displayFilename; // Use item data filename
            const id = button.dataset.id; // Usually for share button
            lastFocusedElement = button; // Track focus

            if (button.tagName === 'A' && button.href && button.target === '_blank') {
                return; // Let the browser handle external links
            }
            event.preventDefault(); // Prevent default for button actions

            console.log(`Action clicked inside item view: ${action}`);

            if (action === 'play' && url) {
                isGlobalCustomUrlMode = false;
                streamVideo(title, url, filename);
            } else if (action === 'copy-vlc' && url) {
                copyVLCLink(button, url);
            } else if (action === 'open-intent' && url) {
                openWithIntent(url);
            } else if (action === 'share' && id) {
                handleShareClick(button); // Share the current page URL
            } else if (action === 'toggle-custom-url') {
                toggleCustomUrlInput(button);
            } else if (action === 'bypass-hubcloud') {
                triggerHubCloudBypass(button);
            } else if (action === 'bypass-gdflix') {
                triggerGDFLIXBypass(button);
            } else if (target.matches('#playerPlayCustomUrlButton')) {
                // Handle play from custom URL input INSIDE the item view player
                 playFromCustomUrlInput(button);
            }
         } else if (target.matches('.close-btn') && target.closest('#videoContainer')) {
            // Handle player close button specifically if missed by other handlers
            lastFocusedElement = target;
            closePlayer(lastFocusedElement);
         }
    }
    // --- handleGlobalCustomUrlClick, handleGlobalPlayCustomUrl (Unchanged) ---
    function handleGlobalCustomUrlClick(event) {
         event.preventDefault(); lastFocusedElement = event.target;
         if (!videoContainer || !playerCustomUrlSection || !playerCustomUrlInput) return;
         console.log("Global Play Custom URL clicked."); closePlayerIfNeeded(); // Close any existing player
         // No action rows to close
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
    // --- toggleCustomUrlInput (Context is now only item view) ---
    function toggleCustomUrlInput(toggleButton, triggeredByError = false) {
         // Context is always the item view content now
         const actionContainer = itemViewContent;
         if (!actionContainer || !videoContainer || !playerCustomUrlSection) {
             console.error("Cannot toggle custom URL input: missing elements or wrong view mode.");
             return;
         }

         // Ensure player is inside the item view content if not already
         if (videoContainer.parentElement !== actionContainer) {
             console.warn("Player not in item view container, moving it for custom URL toggle.");
             actionContainer.appendChild(videoContainer);
             // Reset player state if it was playing something else
             if (videoElement && videoElement.hasAttribute('src') && !triggeredByError) {
                 videoElement.pause(); videoElement.removeAttribute('src'); videoElement.currentTime = 0; videoElement.load();
             }
             if (vlcBox) vlcBox.style.display = 'none';
             if (audioWarningDiv && !triggeredByError) audioWarningDiv.style.display = 'none'; // Hide normal warnings
             if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; }
             clearCopyFeedback();
         }

         const isHidden = playerCustomUrlSection.style.display === 'none';
         playerCustomUrlSection.style.display = isHidden ? 'flex' : 'none';
         videoElement.style.display = isHidden ? 'none' : 'block';
         customControlsContainer.style.display = isHidden ? 'none' : 'flex';
         if(vlcBox) vlcBox.style.display = isHidden ? 'none' : 'block';

         // Manage audio warning visibility
         if (audioWarningDiv) {
             if (isHidden && audioWarningDiv.style.display !== 'none' && !audioWarningDiv.innerHTML.includes('Playback Error:')) {
                 // Hide normal audio warning when showing custom input
                 audioWarningDiv.style.display = 'none';
             } else if (!isHidden && audioWarningDiv.style.display === 'none') {
                 // If hiding custom input and no playback error, check if we need to show normal warning
                 const movieData = viewedItemData; // Use data for the current item view
                 if (movieData && movieData.displayFilename) {
                     const ddp51Regex = /\bDDP?([ ._-]?5\.1)?\b/i; const advancedAudioRegex = /\b(DTS|ATMOS|TrueHD)\b/i; const multiAudioHintRegex = /\b(Multi|Dual)[ ._-]?Audio\b/i; let warningText = ""; const lowerFilename = movieData.displayFilename.toLowerCase(); if (ddp51Regex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DDP audio might not work in browser. Use 'Copy URL' or 'Play in VLC or MX Player'."; } else if (advancedAudioRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DTS/Atmos/TrueHD audio likely unsupported. Use external player."; } else if (multiAudioHintRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> May contain multiple audio tracks. Use selector below or external player."; } if(warningText) { audioWarningDiv.innerHTML = warningText; audioWarningDiv.style.display = 'block'; }
                 }
             }
             // Ensure playback error messages always remain visible if they exist
             else if (audioWarningDiv.innerHTML.includes('Playback Error:')) {
                  audioWarningDiv.style.display = 'block';
             }
         }

         // Ensure the main video container is visible
         videoContainer.style.display = 'flex';

         // Update toggle button state
         toggleButton.setAttribute('aria-expanded', String(isHidden));
         toggleButton.innerHTML = isHidden ? '<span aria-hidden="true">🔼</span> Hide Custom URL Input' : '<span aria-hidden="true">🔗</span> Play Custom URL';

         // Focus management
         if (isHidden && playerCustomUrlInput) {
             setTimeout(() => playerCustomUrlInput.focus(), 50);
         } else if (!isHidden) {
             setTimeout(() => toggleButton.focus(), 50);
         }

         // Scroll player into view
         setTimeout(() => { videoContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150);
    }
    // --- playFromCustomUrlInput (Context is item view player) ---
    function playFromCustomUrlInput(playButton) {
         const container = playButton.closest('#playerCustomUrlSection'); if (!container) return;
         const inputField = container.querySelector('#playerCustomUrlInput'); const feedbackSpan = container.querySelector('.player-custom-url-feedback');
         const titleRef = "Custom URL Video"; if (!inputField || !feedbackSpan) return;
         const customUrlRaw = inputField.value.trim(); feedbackSpan.textContent = ''; if (!customUrlRaw) { feedbackSpan.textContent = 'Please enter a URL.'; inputField.focus(); return; }
         let customUrlEncoded = customUrlRaw;
         try { new URL(customUrlRaw); customUrlEncoded = customUrlRaw.replace(/ /g, '%20'); } catch (e) { feedbackSpan.textContent = 'Invalid URL format.'; inputField.focus(); return; }
         console.log(`Attempting to play custom URL from item context: ${customUrlEncoded}`); isGlobalCustomUrlMode = false; // Ensure not in global mode

         const actionContainer = itemViewContent; // Parent is always itemViewContent now
         if (!actionContainer) { console.error("Could not find parent item view container for custom URL play."); return; }
         if (videoContainer.parentElement !== actionContainer) { console.warn("Player wasn't in the item view container, moving it."); actionContainer.appendChild(videoContainer); }

         if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none'; if (videoElement) videoElement.style.display = 'block'; if (customControlsContainer) customControlsContainer.style.display = 'flex';

         streamVideo(titleRef, customUrlEncoded, null, true);
    }
    // REMOVED: getMovieDataFromActionContainer (no longer needed as context is simpler)

    // --- HubCloud/GDFLIX Bypass Logic (Updated Context) ---
    async function triggerHubCloudBypass(buttonElement) {
         const hubcloudUrl = buttonElement.dataset.hubcloudUrl;
         // Reference is now always 'itemView' when triggered from detail page
         const movieRef = buttonElement.dataset.movieRef; // Should be 'itemView'
         if (!hubcloudUrl) { console.error("Bypass failed: HubCloud URL missing from button data."); setBypassButtonState(buttonElement, 'error', 'Missing URL'); return; }
         if (movieRef !== 'itemView') { console.warn(`Unexpected movieRef '${movieRef}' during HubCloud bypass.`); }

         console.log(`Attempting HubCloud bypass for: ${hubcloudUrl}`); setBypassButtonState(buttonElement, 'loading');
         const apiController = new AbortController(); const timeoutId = setTimeout(() => { apiController.abort(); console.error(`HubCloud Bypass API call timed out after ${config.BYPASS_TIMEOUT / 1000}s`); setBypassButtonState(buttonElement, 'error', 'Timeout'); }, config.BYPASS_TIMEOUT);
         try {
             const response = await fetch(config.BYPASS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hubcloudUrl }), signal: apiController.signal }); clearTimeout(timeoutId);
             if (!response.ok) { let errorDetails = `HTTP Error: ${response.status}`; try { errorDetails = (await response.json()).details || errorDetails; } catch (_) {} throw new Error(errorDetails); }
             const result = await response.json();
             if (result.success && result.finalUrl) {
                 console.log(`HubCloud Bypass successful! Raw Final URL: ${result.finalUrl}`); const encodedFinalUrl = result.finalUrl.replace(/ /g, '%20'); console.log(`Encoded Final URL: ${encodedFinalUrl}`);
                 setBypassButtonState(buttonElement, 'success', 'Success!');
                 updateItemViewAfterBypass(encodedFinalUrl); // Update the current item view
             } else { throw new Error(result.details || result.error || 'Unknown HubCloud bypass failure'); }
         } catch (error) {
             clearTimeout(timeoutId);
             if (error.name === 'AbortError' && !apiController.signal.aborted) { console.error("HubCloud Bypass aborted due to timeout."); setBypassButtonState(buttonElement, 'error', 'Timeout');}
             else if (error.name === 'AbortError') { console.log("HubCloud Bypass fetch aborted."); setBypassButtonState(buttonElement, 'idle'); }
             else { console.error("HubCloud Bypass failed:", error); setBypassButtonState(buttonElement, 'error', `Failed: ${error.message.substring(0, 50)}`); }
         }
     }
    async function triggerGDFLIXBypass(buttonElement) {
         const gdflixUrl = buttonElement.dataset.gdflixUrl;
         const movieRef = buttonElement.dataset.movieRef; // Should be 'itemView'
         if (!gdflixUrl) { console.error("Bypass failed: GDFLIX URL missing from button data."); setBypassButtonState(buttonElement, 'error', 'Missing URL'); return; }
         if (movieRef !== 'itemView') { console.warn(`Unexpected movieRef '${movieRef}' during GDFLIX bypass.`); }

         console.log(`Attempting GDFLIX bypass for: ${gdflixUrl}`); setBypassButtonState(buttonElement, 'loading');
         const apiController = new AbortController(); const timeoutId = setTimeout(() => { apiController.abort(); console.error(`GDFLIX Bypass API call timed out after ${config.BYPASS_TIMEOUT / 1000}s`); setBypassButtonState(buttonElement, 'error', 'Timeout'); }, config.BYPASS_TIMEOUT);
         try {
             const response = await fetch(config.GDFLIX_BYPASS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gdflixUrl }), signal: apiController.signal }); clearTimeout(timeoutId);
             if (!response.ok) { let errorDetails = `HTTP Error: ${response.status}`; try { errorDetails = (await response.json()).error || errorDetails; } catch (_) {} throw new Error(errorDetails); }
             const result = await response.json();
             if (result.success && result.finalUrl) {
                 console.log(`GDFLIX Bypass successful! Raw Final URL: ${result.finalUrl}`); const encodedFinalUrl = result.finalUrl.replace(/ /g, '%20'); console.log(`Encoded Final URL: ${encodedFinalUrl}`);
                 setBypassButtonState(buttonElement, 'success', 'Success!');
                  updateItemViewAfterBypass(encodedFinalUrl); // Update the current item view
             } else { throw new Error(result.error || 'Unknown GDFLIX bypass failure'); }
         } catch (error) {
             clearTimeout(timeoutId);
             if (error.name === 'AbortError' && !apiController.signal.aborted) { console.error("GDFLIX Bypass aborted due to timeout."); setBypassButtonState(buttonElement, 'error', 'Timeout'); }
             else if (error.name === 'AbortError') { console.log("GDFLIX Bypass fetch aborted."); setBypassButtonState(buttonElement, 'idle'); }
             else { console.error("GDFLIX Bypass failed:", error); setBypassButtonState(buttonElement, 'error', `Failed: ${error.message.substring(0, 50)}`); }
         }
     }
    // --- updateActionRowAfterBypass (Renamed and Simplified) ---
    function updateItemViewAfterBypass(encodedFinalUrl) {
         if (!viewedItemData || !itemViewContent) {
             console.error("Cannot update item view after bypass: missing data or container.");
             return;
         }
         viewedItemData.url = encodedFinalUrl; // Update the in-memory data
         console.log(`Updated viewedItemData (ID: ${viewedItemData.id}) in memory with bypassed URL.`);

         // Re-render the content of the item view area
         const actionHTML = createItemDetailContentHTML(viewedItemData);
         itemViewContent.innerHTML = actionHTML; // Replace the entire content

         // Re-append the player container (it's hidden initially)
         if (videoContainer) {
            itemViewContent.appendChild(videoContainer);
            videoContainer.style.display = 'none'; // Ensure it stays hidden
         }


         console.log(`Successfully re-rendered item view content for movie ID: ${viewedItemData.id} after bypass.`);
         // Focus the new Play button
         const playButton = itemViewContent.querySelector('.play-button');
         if (playButton) {
             setTimeout(() => playButton.focus(), 50);
         }
     }
    // --- setBypassButtonState (Unchanged) ---
    function setBypassButtonState(buttonElement, state, message = null) { if (!buttonElement) return; const feedbackSpan = buttonElement.nextElementSibling; const iconSpan = buttonElement.querySelector('.button-icon'); const spinnerSpan = buttonElement.querySelector('.button-spinner'); const textSpan = buttonElement.querySelector('.button-text'); const isHubCloud = buttonElement.classList.contains('hubcloud-bypass-button'); const defaultText = isHubCloud ? 'Bypass HubCloud' : 'Bypass GDFLIX'; const defaultIconHTML = isHubCloud ? '☁️' : '🎬'; buttonElement.classList.remove('loading', 'error', 'success'); buttonElement.disabled = false; if (feedbackSpan) feedbackSpan.style.display = 'none'; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; clearTimeout(bypassFeedbackTimeout); switch (state) { case 'loading': buttonElement.classList.add('loading'); buttonElement.disabled = true; if (textSpan) textSpan.textContent = 'Bypassing...'; if (spinnerSpan) spinnerSpan.style.display = 'inline-block'; if (iconSpan) iconSpan.style.display = 'none'; if (feedbackSpan) { feedbackSpan.textContent = 'Please wait...'; feedbackSpan.className = 'bypass-feedback loading show'; feedbackSpan.style.display = 'inline-block'; } break; case 'success': buttonElement.classList.add('success'); buttonElement.disabled = true; if (textSpan) textSpan.textContent = 'Success!'; if (iconSpan) iconSpan.innerHTML = '✅'; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.textContent = message || 'Success!'; feedbackSpan.className = 'bypass-feedback success show'; feedbackSpan.style.display = 'inline-block'; } break; case 'error': buttonElement.classList.add('error'); buttonElement.disabled = false; if (textSpan) textSpan.textContent = defaultText; if (iconSpan) iconSpan.innerHTML = defaultIconHTML; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.textContent = message || 'Failed'; feedbackSpan.className = 'bypass-feedback error show'; feedbackSpan.style.display = 'inline-block'; bypassFeedbackTimeout = setTimeout(() => { feedbackSpan.classList.remove('show', 'error', 'loading'); feedbackSpan.style.display = 'none'; feedbackSpan.textContent = ''; }, 4000); } break; case 'idle': default: buttonElement.disabled = false; if (textSpan) textSpan.textContent = defaultText; if (iconSpan) iconSpan.innerHTML = defaultIconHTML; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.classList.remove('show', 'error', 'loading'); feedbackSpan.style.display = 'none'; feedbackSpan.textContent = ''; } break; } }

    // --- Event Delegation Setup (Simplified) ---
    function setupEventListeners() {
        // Search Input Listeners (Unchanged)
        if (searchInput) {
            searchInput.addEventListener('input', handleSearchInput);
            searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSearchSubmit(); } else if (event.key === 'Escape') { suggestionsContainer.style.display = 'none'; } });
            searchInput.addEventListener('search', handleSearchClear);
            searchInput.addEventListener('blur', () => { setTimeout(() => { const searchButton = document.getElementById('searchSubmitButton'); if (document.activeElement !== searchInput && !suggestionsContainer.contains(document.activeElement) && document.activeElement !== searchButton) { suggestionsContainer.style.display = 'none'; } }, 150); });
        }

        // Quality Filter Listener (Unchanged)
        if (qualityFilterSelect) { qualityFilterSelect.addEventListener('change', triggerFilterChange); }

        // Results Area Listener (Sorting only)
        if (resultsArea) {
            resultsArea.addEventListener('click', (event) => {
                // Handle sorting clicks
                if (event.target.closest('th.sortable')) {
                    handleSort(event);
                }
                // Filename and View links are now standard <a> tags, no JS needed here
                // Action buttons (Play, etc.) do not exist in this context anymore
            });
        }

        // Updates Preview Area Listener (No action row toggling needed)
        // Filename and View links are standard <a> tags
        if (updatesPreviewList) {
           // No specific listener needed for clicks here anymore unless adding other interactions
        }

        // Item Detail View Area Listener (For action buttons)
        if (itemViewArea) {
            // Use the handleActionClick function for buttons inside this area
            itemViewArea.addEventListener('click', handleActionClick);
        }

        // Player Container Listener (For custom URL button inside player)
        if (videoContainer) {
            videoContainer.addEventListener('click', (event) => {
                // Check specifically for the play button within the player's custom URL section
                 if (event.target.matches('#playerPlayCustomUrlButton')) {
                    if (isGlobalCustomUrlMode) {
                        handleGlobalPlayCustomUrl(event);
                    } else {
                        playFromCustomUrlInput(event.target);
                    }
                 }
                 // Note: The main 'handleActionClick' attached to itemViewArea might also catch this,
                 // but having it explicitly here ensures it works if event propagation is stopped.
                 // Close button is handled by handleActionClick or its own listener now.
            });
        }


        // Global Custom URL Button Listener (Unchanged)
        if (playCustomUrlGlobalButton) { playCustomUrlGlobalButton.addEventListener('click', handleGlobalCustomUrlClick); }

        // Keyboard Shortcuts Listener (Unchanged)
        document.addEventListener('keydown', handlePlayerKeyboardShortcuts);

        // Click Outside Suggestions Listener (Unchanged)
         document.addEventListener('click', (event) => {
             if (searchInput && suggestionsContainer && suggestionsContainer.style.display === 'block') { const searchWrapper = searchInput.closest('.search-input-wrapper'); if (searchWrapper && !searchWrapper.contains(event.target)) { suggestionsContainer.style.display = 'none'; } }
             // Click outside player logic - maybe simplify or remove if not strictly needed
             if (videoContainer && videoContainer.style.display !== 'none' && !videoContainer.contains(event.target)) {
                 const isOutsidePlayer = !videoContainer.contains(event.target);
                 const isOutsideTrigger = !lastFocusedElement || (lastFocusedElement && !lastFocusedElement.contains(event.target));
                 const isOutsideGlobalTrigger = !playCustomUrlGlobalButton || !playCustomUrlGlobalButton.contains(event.target);

                 // Check if click is inside the item view area, if that's the player context
                 let clickInsideItemView = false;
                 if (currentViewMode === 'itemView' && itemViewContent?.contains(event.target)) {
                     clickInsideItemView = true;
                 }

                 // Close only if click is truly outside the player and its context/trigger
                 if (isOutsidePlayer && isOutsideTrigger && isOutsideGlobalTrigger && !clickInsideItemView) {
                     console.log("Clicked outside player's logical container or trigger. Closing player.");
                     closePlayer(event.target);
                 }
             }
         }, false);

        // Video Element Listeners (Unchanged)
        if(videoElement) {
            videoElement.addEventListener('volumechange', () => { if (volumeSlider && Math.abs(parseFloat(volumeSlider.value) - videoElement.volume) > 0.01) { volumeSlider.value = videoElement.volume; } updateMuteButton(); try { localStorage.setItem(config.PLAYER_VOLUME_KEY, String(videoElement.volume)); } catch (e) { console.warn("LocalStorage volume save failed", e); } });
            videoElement.addEventListener('ratechange', () => { if(playbackSpeedSelect && playbackSpeedSelect.value !== String(videoElement.playbackRate)) { playbackSpeedSelect.value = String(videoElement.playbackRate); } try { localStorage.setItem(config.PLAYER_SPEED_KEY, String(videoElement.playbackRate)); } catch (e) { console.warn("LocalStorage speed save failed", e); } });
            videoElement.addEventListener('loadedmetadata', populateAudioTrackSelector);
            videoElement.removeEventListener('error', handleVideoError); videoElement.addEventListener('error', handleVideoError);
        }

        // Fullscreen Listener (Unchanged)
        document.addEventListener('fullscreenchange', handleFullscreenChange); document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

        // Back/Forward Navigation Listener
        window.addEventListener('popstate', (event) => {
            console.log("Popstate event triggered:", window.location.href, event.state);
            // Re-initialize based on the new URL state (handles back/forward)
            initializeApp();
        });
    }


    // --- Add Event Listeners on DOMContentLoaded ---
    document.addEventListener('DOMContentLoaded', async () => {
         await initializeApp(); // Initialize first
         setupEventListeners(); // Then setup listeners
     }); // End DOMContentLoaded

})(); // End of IIFE
// --- END OF script.js ---
```

**3. `style.css` Changes:**

*   Remove styles related to `tr.action-row`, `.preview-action-row`, `.active-main-row`.
*   Add styles for the new `<a>` links (`.filename-link`, `.view-button-link`) to make them look correct (remove underline, set color, style like a button).
*   Adjust styles for `#shared-item-view` (now item detail view) if needed (e.g., ensuring the player fits correctly).

```css
/* --- START OF style.css (with Item Detail Page Navigation updates) --- */
:root {
    --primary-color: #0d6efd; /* Bootstrap blue */
    --primary-hover: #0b5ed7;
    --secondary-color: #6c757d; /* Bootstrap secondary grey */
    --secondary-hover: #5a6268;
    --light-bg: #f8f9fa; /* Very light grey */
    --container-bg: #ffffff; /* White */
    --text-color: #212529; /* Dark grey */
    --text-muted: #6c757d;
    --border-color: #dee2e6; /* Light grey border */
    --header-bg: #ffffff; /* Used for results-active search bar background */
    --table-header-bg: #e9ecef; /* Light grey for table header */
    --table-row-hover: #f1f3f5; /* Slightly darker hover */
    /* REMOVED: --table-row-active: #e6f0ff; */
    --error-color: #dc3545; /* Bootstrap danger */
    --error-bg: #f8d7da; /* Background for error messages */
    --error-border: #f5c6cb;
    --error-text: #721c24;
    --success-color: #198754; /* Bootstrap success */
    --warning-bg: #fff3cd;
    --warning-text: #856404;
    --warning-border: #ffeeba;
    --info-color: #0dcaf0; /* Bootstrap info for bypass */
    --info-hover: #0baccc;
    --pagination-active-bg: var(--primary-color);
    --pagination-active-border: var(--primary-color);
    --pagination-hover-bg: #e9ecef;
    --pagination-disabled-color: #adb5bd;
    --pagination-disabled-bg: #ffffff;
    --pagination-disabled-border: #dee2e6;
    --filter-active-border: #adb5bd;
    --tab-active-border: var(--primary-color);
    --tab-hover-bg: #e9ecef;
    --suggestion-hover-bg: #e9ecef;
    --button-secondary-bg: var(--secondary-color);
    --button-secondary-hover: var(--secondary-hover);
    --button-primary-bg: var(--primary-color); /* Added for Search button */
    --button-primary-hover: var(--primary-hover); /* Added for Search button */
    --button-share-bg: #6f42c1; /* Bootstrap purple for share */
    --button-share-hover: #5a349b;
    --button-youtube-bg: #FF0000; /* YouTube Red */
    --button-youtube-hover: #cc0000;
    --button-imdb-bg: var(--secondary-color); /* Using secondary color for IMDb button */
    --button-imdb-hover: var(--secondary-hover);
    --button-custom-url-bg: #ffc107; /* Bootstrap yellow */
    --button-custom-url-hover: #e0a800;
    --button-custom-url-text: #343a40; /* Dark text for yellow bg */
    --button-custom-url-toggle-bg: var(--secondary-color); /* Use secondary color for toggle */
    --button-custom-url-toggle-hover: var(--secondary-hover);
    --button-custom-url-global-bg: var(--secondary-color);
    --button-custom-url-global-hover: var(--secondary-hover);
    --button-bypass-bg: var(--info-color); /* HubCloud Bypass Button Color */
    --button-bypass-hover: var(--info-hover);
    --button-bypass-text: white;
    --button-gdflix-bypass-bg: #E50914; /* GDFLIX Bypass Button Color */
    --button-gdflix-bypass-hover: #B81D24; /* GDFLIX Bypass Button Hover Color */
    --button-gdflix-bypass-text: white;

    --border-radius-sm: 0.375rem; /* 6px */
    --border-radius-md: 0.5rem;
    --border-radius-lg: 0.75rem;
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.06);
    --shadow-md: 0 4px 10px rgba(0,0,0,0.08);
    --shadow-lg: 0 8px 25px rgba(0,0,0,0.1);

    --preview-col-width-id: 10%;
    --preview-col-width-filename: 55%;
    --preview-col-width-date: 20%;
    --preview-col-width-view: 15%;

    --transition-speed: 0.3s;
    --transition-timing: ease;
}

*, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

html {
    height: 100%;
    scroll-behavior: smooth;
}

body {
    font-family: 'Poppins', 'Product Sans', Arial, sans-serif;
    background-color: var(--container-bg);
    color: var(--text-color);
    line-height: 1.6;
    width: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    margin: 0;
}

#page-loader {
    position: fixed;
    inset: 0;
    background-color: rgba(255, 255, 255, 0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    transition: opacity 0.3s ease-out;
}
#page-loader .spinner-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    color: var(--text-muted);
    font-size: 14px;
}
#page-loader .spinner {
    width: 50px;
    height: 50px;
    border-width: 5px;
    margin: 0;
}

#cinemaghar-container {
    background-color: transparent;
    margin: 0 auto;
    padding: 20px 0 0 0;
    width: 100%;
    max-width: 1300px;
    border-radius: 0;
    box-shadow: none;
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    overflow: visible;
    position: relative;
    color: var(--text-color);
    transition: background-color var(--transition-speed) var(--transition-timing),
                padding var(--transition-speed) var(--transition-timing);
}

#cinemaghar-container.results-active {
    padding-top: 0;
}
/* Ensure player added back to main container is hidden by default */
#cinemaghar-container > #videoContainer {
    display: none;
}

#search-focus-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 100px 20px 20px 20px;
    text-align: center;
    transition: flex-grow var(--transition-speed) var(--transition-timing),
                padding var(--transition-speed) var(--transition-timing),
                justify-content var(--transition-speed) var(--transition-timing),
                background-color var(--transition-speed) var(--transition-timing),
                border-bottom var(--transition-speed) var(--transition-timing);
    width: 100%;
    flex-grow: 1;
    justify-content: center;
}

#cinemaghar-container.results-active #search-focus-area {
    flex-grow: 0;
    justify-content: flex-start;
    padding: 20px 20px 10px 20px;
    background-color: var(--header-bg);
    border-bottom: 1px solid var(--border-color);
}
#cinemaghar-container.shared-view-active #search-focus-area {
    display: none;
}

#search-focus-area .simple-title {
    font-family: 'Poppins', 'Product Sans', Arial, sans-serif;
    font-size: 60px;
    font-weight: 500;
    color: var(--text-color);
    margin-bottom: 5px;
    cursor: pointer;
    transition: opacity var(--transition-speed) var(--transition-timing),
                max-height var(--transition-speed) var(--transition-timing),
                margin var(--transition-speed) var(--transition-timing);
    overflow: hidden;
    max-height: 150px;
    opacity: 1;
    line-height: 1.2;
    letter-spacing: -0.5px;
}

#search-focus-area .signature {
    display: block;
    width: 100%;
    max-width: 700px;
    margin: -5px auto 25px auto;
    font-size: 13px;
    color: var(--text-muted);
    font-style: normal;
    font-weight: 400;
    text-align: right;
    transition: opacity var(--transition-speed) var(--transition-timing),
                max-height var(--transition-speed) var(--transition-timing),
                margin var(--transition-speed) var(--transition-timing);
    overflow: hidden;
    max-height: 50px;
    opacity: 1;
}

#cinemaghar-container.results-active #search-focus-area .simple-title,
#cinemaghar-container.results-active #search-focus-area .signature {
    opacity: 0;
    max-height: 0;
    margin-top: 0;
    margin-bottom: 0;
    padding: 0;
    border: none;
    overflow: hidden;
}

.search-input-wrapper {
    position: relative;
    width: 100%;
    max-width: 700px;
    margin: 0 auto 25px auto; /* Reduced margin to make space for actions */
    display: flex;
    align-items: center;
    gap: 0;
}

#cinemaghar-container #mainSearchInput {
    flex-grow: 1;
    min-width: 0;
    width: auto;
    padding: 12px 18px 12px 45px;
    border-radius: var(--border-radius-sm) 0 0 var(--border-radius-sm);
    border: 1px solid var(--border-color);
    border-right: none;
    font-size: 16px;
    box-shadow: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    height: 46px;
    outline: none;
    background-color: var(--container-bg);
}
#cinemaghar-container #mainSearchInput:hover {
    border-color: #adb5bd;
    box-shadow: var(--shadow-sm);
}
#cinemaghar-container #mainSearchInput:focus {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 1px var(--primary-color);
    z-index: 3;
}

#cinemaghar-container .search-input-wrapper #searchSubmitButton {
    flex-shrink: 0;
    margin: 0;
    height: 46px;
    padding: 0 22px;
    font-size: 14px;
    font-weight: 500;
    border-radius: 0 var(--border-radius-sm) var(--border-radius-sm) 0;
    background-color: var(--button-primary-bg);
    color: white !important;
    border: 1px solid var(--button-primary-bg);
    box-shadow: none;
    cursor: pointer;
    transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
#cinemaghar-container .search-input-wrapper #searchSubmitButton:hover {
    background-color: var(--button-primary-hover);
    border-color: var(--button-primary-hover);
    box-shadow: var(--shadow-sm);
}

.search-input-wrapper::before {
    content: '';
    position: absolute;
    left: 15px;
    top: 50%;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
    background-image: url('data:image/svg+xml;charset=US-ASCII,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="%236c757d" viewBox="0 0 16 16"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>');
    background-repeat: no-repeat;
    background-size: contain;
    opacity: 0.7;
    pointer-events: none;
    z-index: 2;
}

#searchInputSuggestions {
    position: absolute;
    top: calc(100% + 1px);
    left: 0;
    width: 100%;
    max-width: 100%;
    background-color: var(--container-bg);
    border: 1px solid var(--border-color);
    border-top: none;
    border-radius: 0 0 var(--border-radius-sm) var(--border-radius-sm);
    box-shadow: var(--shadow-md);
    z-index: 10;
    max-height: 350px;
    overflow-y: auto;
    display: none;
}
#searchInputSuggestions div {
    padding: 10px 18px 10px 45px;
    font-size: 15px;
    cursor: pointer;
    border: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
}
#searchInputSuggestions div:last-child { border-bottom: none; }
#searchInputSuggestions div:hover { background-color: var(--suggestion-hover-bg); }
#searchInputSuggestions div strong { font-weight: 600; color: var(--primary-color); }

.search-actions {
    display: flex;
    gap: 15px;
    justify-content: center;
    margin-top: 15px; /* Added margin */
    margin-bottom: 30px;
    transition: opacity var(--transition-speed) var(--transition-timing),
                max-height var(--transition-speed) var(--transition-timing),
                margin var(--transition-speed) var(--transition-timing);
    overflow: hidden;
    max-height: 100px;
    opacity: 1;
}
#cinemaghar-container .search-actions .button {
    padding: 9px 18px;
    font-size: 14px;
    background-color: var(--light-bg);
    color: var(--text-color);
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius-sm);
    box-shadow: none;
    transition: all 0.2s ease;
    font-weight: 500;
}
#cinemaghar-container .search-actions .button:hover {
    border-color: #adb5bd;
    background-color: #e9ecef;
    box-shadow: var(--shadow-sm);
    transform: translateY(-1px);
}
/* Specific style for the global custom URL button */
#cinemaghar-container .search-actions #playCustomUrlGlobalButton {
    background-color: var(--button-custom-url-global-bg);
    color: white !important;
    border-color: var(--button-custom-url-global-bg);
}
#cinemaghar-container .search-actions #playCustomUrlGlobalButton:hover {
    background-color: var(--button-custom-url-global-hover);
    border-color: var(--button-custom-url-global-hover);
}

#cinemaghar-container.results-active .search-actions {
    opacity: 0;
    max-height: 0;
    margin: 0;
    padding: 0;
    border: none;
}

#updates-preview-section {
    width: 100%;
    max-width: 850px;
    margin: 10px auto 0 auto;
    padding: 20px;
    background-color: transparent;
    border: none;
    border-radius: 0;
    text-align: left;
    display: none;
    transition: opacity var(--transition-speed) var(--transition-timing),
                transform var(--transition-speed) var(--transition-timing);
    opacity: 1;
    transform: translateY(0);
}
#updates-preview-section h3 {
    font-size: 16px;
    font-weight: 500;
    margin-bottom: 15px;
    color: var(--text-muted);
    text-align: center;
}
#updates-preview-list {
    margin-bottom: 20px;
    border-top: 1px solid var(--border-color);
    padding-top: 15px;
}
.update-item {
    display: flex;
    align-items: center;
    padding: 12px 8px;
    border-bottom: 1px solid #eee;
    font-size: 14px;
    line-height: 1.4;
    gap: 10px;
    transition: background-color 0.2s ease;
    position: relative;
}
.update-item:hover {
     background-color: var(--table-row-hover);
}
/* REMOVED: .update-item.active-main-row */

.update-item:last-of-type {
    border-bottom: none;
}
.update-item > div {
    display: flex;
    align-items: center;
    white-space: nowrap;
}
.update-item .preview-col-id {
    width: var(--preview-col-width-id);
    justify-content: center;
    color: var(--text-muted);
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
}
.update-item .preview-col-filename {
    flex-grow: 1;
    width: var(--preview-col-width-filename);
    word-break: break-word;
    white-space: normal;
    font-weight: 500;
    padding-right: 10px;
    overflow: hidden;
    min-width: 0;
}
.update-item .preview-col-filename a.filename-link {
    color: var(--primary-color);
    text-decoration: none;
    font-weight: 500;
    transition: color 0.2s ease;
}
.update-item .preview-col-filename a.filename-link:hover {
    color: var(--primary-hover);
    text-decoration: underline;
}
.update-item .preview-col-filename .quality-logo {
    height: 1.1em;
    width: auto;
    vertical-align: text-bottom;
    margin-left: 6px;
    display: inline-block;
    line-height: 1;
    filter: grayscale(30%);
    opacity: 0.8;
}
.update-item .preview-col-date {
    width: var(--preview-col-width-date);
    justify-content: center;
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
    text-align: center;
    flex-shrink: 0;
}
.update-item .preview-col-view {
    width: var(--preview-col-width-view);
    justify-content: center;
    flex-shrink: 0;
}
/* Style for the 'View' link */
.update-item .preview-col-view a.view-button-link {
    display: inline-block;
    padding: 6px 12px;
    font-size: 12px;
    min-width: 55px;
    background-color: var(--button-secondary-bg);
    color: white !important;
    border-radius: var(--border-radius-sm);
    border: none;
    text-decoration: none;
    text-align: center;
    transition: background-color 0.2s ease;
    cursor: pointer;
}
.update-item .preview-col-view a.view-button-link:hover {
    background-color: var(--button-secondary-hover);
}

/* REMOVED: Action Row for Preview Section (.preview-action-row) */

#showMoreUpdatesButton {
    display: block;
    margin: 10px auto 0 auto;
    padding: 9px 20px;
    font-size: 14px;
    background-color: var(--button-secondary-bg);
    color: white !important;
    border: none;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    transition: all 0.2s ease;
}
#showMoreUpdatesButton:hover {
    background-color: var(--button-secondary-hover);
    box-shadow: var(--shadow-sm);
}
#showMoreUpdatesButton:disabled {
    background-color: #adb5bd;
    cursor: not-allowed;
    opacity: 0.7;
}

#cinemaghar-container.results-active #updates-preview-section,
#cinemaghar-container.shared-view-active #updates-preview-section {
    opacity: 0;
    transform: translateY(-10px);
    pointer-events: none;
    transition: opacity calc(var(--transition-speed) / 2) var(--transition-timing),
                transform calc(var(--transition-speed) / 2) var(--transition-timing),
                visibility 0s calc(var(--transition-speed) / 2);
    visibility: hidden;
    max-height: 0;
    margin: 0;
    padding: 0;
    border: none;
    overflow: hidden;
}


/* --- Results Area (Hidden by Default) --- */
#results-area {
    display: none;
    padding: 15px 25px 20px 25px;
    background-color: var(--container-bg);
    overflow: hidden;
    width: 100%;
    opacity: 0;
    transform: translateY(10px);
    transition: opacity var(--transition-speed) var(--transition-timing) calc(var(--transition-speed) / 2),
                transform var(--transition-speed) var(--transition-timing) calc(var(--transition-speed) / 2);
}
#cinemaghar-container.results-active #results-area {
    display: block;
    opacity: 1;
    transform: translateY(0);
}
#cinemaghar-container.shared-view-active #results-area {
    display: none;
}

/* --- Item Detail View (Was Shared Item View) --- */
#shared-item-view { /* Keep ID shared-item-view for now */
    display: none;
    padding: 25px;
    margin-top: 20px;
    background-color: var(--container-bg);
    border-radius: var(--border-radius-md);
    border: 1px solid var(--border-color);
    box-shadow: var(--shadow-md);
    max-width: 850px;
    margin-left: auto;
    margin-right: auto;
    opacity: 0;
    transform: translateY(10px);
    transition: opacity var(--transition-speed) var(--transition-timing) calc(var(--transition-speed) / 2),
                transform var(--transition-speed) var(--transition-timing) calc(var(--transition-speed) / 2);
}
#cinemaghar-container.shared-view-active #shared-item-view {
    display: block;
    opacity: 1;
    transform: translateY(0);
}
#shared-item-view .back-button { /* This is the #backToHomeButtonShared */
    margin-bottom: 25px;
}
#shared-item-content {
    padding: 20px 15px;
    background-color: #f0f2f5;
    border-radius: var(--border-radius-sm);
    position: relative; /* Needed for player positioning */
}
#shared-item-content .action-info,
#shared-item-content .action-buttons-container {
    margin-bottom: 20px;
}
#shared-item-content .action-buttons-container {
    border-top: 1px solid var(--border-color);
    padding-top: 25px;
}
/* Player container within item view */
#shared-item-content > #videoContainer {
    margin-top: 20px; /* Add space above player */
    margin-bottom: 0; /* Remove bottom margin if player is last */
    margin-left: -15px; /* Adjust margins to fit padding */
    margin-right: -15px;
    padding: 20px; /* Keep player padding */
    width: calc(100% + 30px); /* Make player full width of parent */
    max-width: calc(100% + 30px);
    border-radius: 0 0 var(--border-radius-sm) var(--border-radius-sm); /* Adjust rounding */
    box-shadow: none;
    border-top: 1px solid var(--border-color);
}


#shared-item-view .status-message,
#shared-item-view .error-message {
    text-align: center;
    padding: 30px 15px;
    font-size: 16px;
    color: var(--text-muted);
}
#shared-item-view .error-message {
    color: var(--error-text);
    background-color: var(--error-bg);
    border: 1px solid var(--error-border);
    border-radius: var(--border-radius-sm);
    font-weight: 500;
}

#cinemaghar-container .back-button {
    display: none;
    align-items: center;
    margin-bottom: 15px;
    padding: 8px 16px;
    font-size: 14px;
    background-color: var(--light-bg);
    color: var(--text-color);
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius-sm);
    box-shadow: none;
    cursor: pointer;
    transition: all 0.2s ease;
    font-weight: 500;
    align-self: flex-start;
    width: max-content;
}
#cinemaghar-container .back-button:hover {
    border-color: #adb5bd;
    background-color: #e9ecef;
    box-shadow: var(--shadow-sm);
}
#cinemaghar-container.results-active #backToHomeButtonResults,
#cinemaghar-container.shared-view-active #backToHomeButtonShared { /* Show correct back button */
    display: inline-flex;
}

/* --- Results Filter Area --- */
.results-filter-area {
    display: flex;
    gap: 20px;
    margin: 0 0 20px 0;
    align-items: center;
    flex-wrap: wrap;
    padding-bottom: 15px;
    border-bottom: 1px solid var(--border-color);
}
.results-filter-area .filter-group { display: flex; align-items: center; gap: 8px; }
.results-filter-area label { font-size: 14px; font-weight: 500; color: var(--text-muted); white-space: nowrap; }
#cinemaghar-container #mainQualityFilterSelect {
    padding: 9px 12px;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--border-color);
    font-size: 14px;
    background-color: white;
    cursor: pointer;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    min-width: 160px;
    height: 40px;
    line-height: 1.5;
    -webkit-appearance: none; -moz-appearance: none; appearance: none;
    background-image: url('data:image/svg+xml;charset=US-ASCII,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="%236c757d" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>');
    background-repeat: no-repeat; background-position: right 10px center; background-size: 16px 12px;
    padding-right: 35px; outline: none;
}
#cinemaghar-container #mainQualityFilterSelect:focus {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.25);
}
#cinemaghar-container #mainQualityFilterSelect.filter-active {
     border-color: var(--primary-color);
     font-weight: 500;
}

/* --- Tab Navigation --- */
.tab-navigation {
    display: flex;
    margin-bottom: 25px;
    border-bottom: 1px solid var(--border-color);
    flex-wrap: wrap;
}
.tab-navigation .tab-button {
    padding: 12px 25px;
    cursor: pointer;
    background-color: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    font-size: 16px;
    font-weight: 500;
    color: var(--text-muted);
    transition: all 0.2s ease-in-out;
    margin-bottom: -1px;
    border-radius: var(--border-radius-sm) var(--border-radius-sm) 0 0;
    white-space: nowrap;
}
.tab-navigation .tab-button:hover {
    background-color: var(--tab-hover-bg);
    color: var(--text-color);
}
.tab-navigation .tab-button.active {
    color: var(--primary-color);
    border-bottom-color: var(--tab-active-border);
    font-weight: 600;
}

/* --- Tab Content --- */
.tab-content > div { display: none; padding-top: 0; animation: fadeIn 0.4s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.tab-content > div.active { display: block; }

/* --- Tables --- */
#cinemaghar-container .table-container {
    overflow-x: auto;
    background: var(--container-bg);
    border-radius: var(--border-radius-sm);
    box-shadow: none;
    margin-bottom: 15px;
    border: 1px solid var(--border-color);
}
#cinemaghar-container table { width: 100%; border-collapse: collapse; min-width: 650px; }
#cinemaghar-container th, #cinemaghar-container td { padding: 14px 12px; border: none; border-bottom: 1px solid var(--border-color); text-align: left; font-size: 14px; vertical-align: middle; font-weight: 400; }
#cinemaghar-container th { background-color: var(--table-header-bg); font-weight: 600; color: var(--text-color); white-space: nowrap; position: sticky; top: 0; z-index: 2; cursor: pointer; user-select: none; }
#cinemaghar-container th:not(.sortable) { cursor: default; }
#cinemaghar-container th.col-id, #cinemaghar-container td.col-id,
#cinemaghar-container th.col-size, #cinemaghar-container td.col-size,
#cinemaghar-container th.col-quality, #cinemaghar-container td.col-quality,
#cinemaghar-container th.col-updated, #cinemaghar-container td.col-updated,
#cinemaghar-container th.col-view, #cinemaghar-container td.col-view { text-align: center; white-space: nowrap; }

/* Sorting Indicators */
#allFilesTable th.sortable:hover, #moviesTable th.sortable:hover, #seriesTable th.sortable:hover { background-color: #dde2e6; }
#cinemaghar-container th .sort-indicator { display: inline-block; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; margin-left: 8px; vertical-align: middle; opacity: 0.5; transition: opacity 0.2s ease, border-color 0.2s; }
#cinemaghar-container th.sort-asc .sort-indicator { border-bottom: 5px solid var(--primary-color); opacity: 1; }
#cinemaghar-container th.sort-desc .sort-indicator { border-top: 5px solid var(--primary-color); opacity: 1; }
#cinemaghar-container th:not(.sortable) .sort-indicator { display: none; }

/* Column widths */
#cinemaghar-container th.col-id, #cinemaghar-container td.col-id { width: 8%; }
#cinemaghar-container th.col-filename, #cinemaghar-container td.col-filename { width: 45%; }
#cinemaghar-container th.col-size, #cinemaghar-container td.col-size { width: 12%; }
#cinemaghar-container th.col-quality, #cinemaghar-container td.col-quality { width: 13%; }
#cinemaghar-container th.col-updated, #cinemaghar-container td.col-updated { width: 12%; }
#cinemaghar-container th.col-view, #cinemaghar-container td.col-view { width: 10%; }

#cinemaghar-container tr:last-of-type td { border-bottom: none; } /* Simpler rule now */
#cinemaghar-container tbody tr.movie-data-row:hover {
    background-color: var(--table-row-hover);
}
/* REMOVED: tbody tr.movie-data-row.active-main-row */

#cinemaghar-container td.col-filename { word-break: break-word; text-align: left; min-width: 150px; white-space: normal; position: relative; }
/* Styling for the filename link */
#cinemaghar-container td.col-filename a.filename-link {
    color: var(--primary-color);
    text-decoration: none;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.2s ease;
}
#cinemaghar-container td.col-filename a.filename-link:hover {
    color: var(--primary-hover);
    text-decoration: underline;
}
#cinemaghar-container td.col-filename .quality-logo { height: 1.1em; width: auto; vertical-align: text-bottom; margin-left: 6px; display: inline-block; line-height: 1; filter: grayscale(30%); opacity: 0.8; transition: filter 0.2s ease, opacity 0.2s ease; }
#cinemaghar-container td.col-filename a.filename-link:hover .quality-logo { filter: grayscale(0%); opacity: 1; }
#cinemaghar-container td.col-quality { text-align: center; min-width: 80px; white-space: nowrap; font-weight: 500; }
#cinemaghar-container td.col-updated { white-space: nowrap; min-width: 100px; color: var(--text-muted); font-size: 13px; text-align: center; }
#cinemaghar-container td.status-message, #cinemaghar-container td.error-message { color: var(--text-muted); font-style: italic; text-align: center; padding: 25px; font-size: 15px; }
#cinemaghar-container td.error-message { color: var(--error-text); background-color: var(--error-bg); border: 1px solid var(--error-border); font-weight: 500; font-style: normal; }
#cinemaghar-container td.loading-message { color: var(--text-muted); text-align: center; padding: 35px 15px; font-size: 15px; }
#cinemaghar-container td.loading-message .spinner { margin: 0 auto 10px auto; }

/* Style for the 'View' link in table */
#cinemaghar-container td.col-view a.view-button-link {
    display: inline-block;
    padding: 6px 12px !important; /* Match old button padding */
    font-size: 12px !important; /* Match old button font size */
    min-width: 55px;
    background-color: var(--button-secondary-bg);
    color: white !important;
    border-radius: var(--border-radius-sm) !important; /* Match old button radius */
    border: none;
    text-decoration: none;
    text-align: center;
    transition: background-color 0.2s ease;
    cursor: pointer;
}
#cinemaghar-container td.col-view a.view-button-link:hover {
    background-color: var(--button-secondary-hover);
}


/* REMOVED: Action Row (Table) styles - tr.action-row, .action-row td */

/* Common Action Info/Buttons styles used ONLY by item detail view now */
#cinemaghar-container #shared-item-content .action-info {
    margin-bottom: 20px; font-size: 14px; color: var(--text-muted); text-align: left; line-height: 1.7;
}
#cinemaghar-container #shared-item-content .action-info .info-item {
    display: block; margin-bottom: 8px;
}
#cinemaghar-container #shared-item-content .action-info strong {
    color: var(--text-color); font-weight: 600; margin-right: 8px; display: inline-block; min-width: 90px;
}
#cinemaghar-container #shared-item-content .action-info .quality-logo {
    height: 1.1em; width: auto; vertical-align: text-bottom; margin-left: 4px; display: inline-block;
}
#cinemaghar-container #shared-item-content .action-buttons-container {
    display: flex; flex-wrap: wrap; justify-content: flex-start; gap: 12px; margin-bottom: 15px; border-top: 1px solid var(--border-color); padding-top: 25px;
}
/* Remove bottom margin from last element in shared content */
#cinemaghar-container #shared-item-content > *:last-child:not(#videoContainer) {
    margin-bottom: 0;
}
/* Ensure border-top doesn't apply if action-info is first in shared content */
#cinemaghar-container #shared-item-content > .action-buttons-container:first-child {
    border-top: none;
    padding-top: 0;
}
/* Container for URL-dependent buttons */
#cinemaghar-container .url-actions-container {
    display: contents; /* Act as if the container isn't there for flex layout */
}


/* --- Custom URL Input Section Styles (Inside Item Detail View / Player) --- */
/* These styles now primarily apply within #shared-item-content or the global player */
#cinemaghar-container .custom-url-section { /* Might not be needed anymore */
  display: none;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px dashed var(--border-color);
}
#cinemaghar-container .custom-url-container { /* Might not be needed anymore */
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 15px;
    padding: 15px;
    background-color: #e9ecef;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--border-color);
}
#cinemaghar-container .custom-url-container label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
    margin-bottom: -5px;
}
#cinemaghar-container .custom-url-input { /* Applies to player's input too */
    width: 100%;
    padding: 10px 12px;
    font-size: 14px;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius-sm);
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);
}
#cinemaghar-container .custom-url-input:focus {
    border-color: var(--primary-color);
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.05), 0 0 0 2px rgba(13, 110, 253, 0.25);
    outline: none;
}
#cinemaghar-container .play-custom-url-button { /* Applies to player's button too */
    align-self: flex-start;
    padding: 8px 16px;
    font-size: 13px;
}
 #cinemaghar-container .custom-url-feedback { /* Applies to player's feedback too */
    font-size: 12px;
    color: var(--error-color);
    margin-top: 5px;
    min-height: 1em;
}

/* --- Buttons General Styling --- */
/* Applies mainly to buttons within #shared-item-content now */
/* Excludes search, footer, back button, pagination */
#cinemaghar-container .button:not(#searchSubmitButton):not(#page-footer .button):not(.back-button):not(.pagination-container button) {
    display: inline-flex; align-items: center; justify-content: center; padding: 10px 18px; margin: 2px 0; color: white !important; border: none; border-radius: var(--border-radius-sm); text-decoration: none; font-size: 14px; font-weight: 500; cursor: pointer; text-align: center; white-space: nowrap; line-height: 1.4; transition: all 0.2s ease-in-out; box-shadow: var(--shadow-sm);
}
/* Remove specific exclusions for view buttons as they are now links */
#cinemaghar-container .button:not(#searchSubmitButton):not(#page-footer .button):not(.back-button):not(.pagination-container button) span[aria-hidden="true"] {
    margin-right: 0.5em;
    font-size: 1.1em;
    line-height: 1;
}
#cinemaghar-container .button:not(#searchSubmitButton):not(#page-footer .button):not(.back-button):not(.pagination-container button) svg,
#cinemaghar-container .button:not(#searchSubmitButton):not(#page-footer .button):not(.back-button):not(.pagination-container button) .button-spinner {
    width: 1.1em;
    height: 1.1em;
    margin-right: 0.5em;
    fill: currentColor;
}
 /* Specific styling for spinner inside button */
.button-spinner {
    display: none; /* Hidden by default */
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: #fff;
    animation: spin 0.8s ease infinite;
    margin-left: -0.5em; /* Adjust positioning if needed */
}
.button.loading .button-spinner {
    display: inline-block;
}
.button.loading span[aria-hidden="true"]:not(.button-spinner),
.button.loading svg {
    display: none; /* Hide original icon when loading */
}

/* Hover/Active states */
#cinemaghar-container .button:not(#searchSubmitButton):not(#page-footer .button):not(.back-button):not(.pagination-container button):hover:not(:disabled) {
    opacity: 0.9; filter: brightness(1.1); box-shadow: 0 3px 7px rgba(0,0,0,0.12); transform: translateY(-1px);
}
#cinemaghar-container .button:not(#searchSubmitButton):not(#page-footer .button):not(.back-button):not(.pagination-container button):active:not(:disabled) {
    filter: brightness(0.9); transform: translateY(0); box-shadow: var(--shadow-sm);
}
 #cinemaghar-container .button:disabled {
    opacity: 0.65;
    cursor: not-allowed;
    box-shadow: none;
    transform: none;
    filter: grayscale(30%);
 }

/* Specific Button Colors */
/* REMOVED: .movie-data-row .view-button styles */
#cinemaghar-container .play-button { background-color: var(--success-color); }
#cinemaghar-container .intent-button { background-color: #17a2b8; }
#cinemaghar-container .vlc-button { background-color: #fd7e14; }
#cinemaghar-container .download-button { background-color: var(--primary-color); }
#cinemaghar-container .telegram-button:not(#page-footer .button) { background-color: #0088cc; }
#cinemaghar-container .gdflix-button { background-color: #E50914; }
#cinemaghar-container .hubcloud-button { background-color: #1E90FF; }
#cinemaghar-container .filepress-button { background-color: #6c757d; }
#cinemaghar-container .gdtot-button { background-color: #ffc107; color: #333 !important; }
#cinemaghar-container .share-button { background-color: var(--button-share-bg); }
#cinemaghar-container .share-button:hover { background-color: var(--button-share-hover); }
#cinemaghar-container .youtube-button { background-color: var(--button-youtube-bg); }
#cinemaghar-container .youtube-button:hover { background-color: var(--button-youtube-hover); }
#cinemaghar-container .youtube-button svg { fill: white; }
#cinemaghar-container .imdb-button { background-color: var(--button-imdb-bg); }
#cinemaghar-container .imdb-button:hover { background-color: var(--button-imdb-hover); }
#cinemaghar-container .imdb-button svg { fill: white; }
/* Custom URL Buttons */
#cinemaghar-container .custom-url-toggle-button {
  background-color: var(--button-custom-url-toggle-bg);
  display: none; /* Still hidden by default, shown by JS on error IN ITEM VIEW */
}
#cinemaghar-container .custom-url-toggle-button:hover {
    background-color: var(--button-custom-url-toggle-hover);
}
#cinemaghar-container .play-custom-url-button, /* In item view player */
#cinemaghar-container #playerCustomUrlSection button /* Global Player button */ {
    background-color: var(--button-custom-url-bg);
    color: var(--button-custom-url-text) !important;
    font-weight: 600;
}
#cinemaghar-container .play-custom-url-button:hover,
#cinemaghar-container #playerCustomUrlSection button:hover {
    background-color: var(--button-custom-url-hover);
    filter: brightness(1.05);
}
/* HubCloud Bypass Button */
#cinemaghar-container .hubcloud-bypass-button {
    background-color: var(--button-bypass-bg);
    color: var(--button-bypass-text) !important;
}
#cinemaghar-container .hubcloud-bypass-button:hover:not(:disabled) {
    background-color: var(--button-bypass-hover);
}
#cinemaghar-container .hubcloud-bypass-button.loading { filter: brightness(0.9); }
/* GDFLIX Bypass Button */
#cinemaghar-container .gdflix-bypass-button {
    background-color: var(--button-gdflix-bypass-bg);
    color: var(--button-gdflix-bypass-text) !important;
}
#cinemaghar-container .gdflix-bypass-button:hover:not(:disabled) {
    background-color: var(--button-gdflix-bypass-hover);
}
#cinemaghar-container .gdflix-bypass-button.loading { filter: brightness(0.9); }

/* --- Copy Feedback & Bypass Feedback --- */
#cinemaghar-container .copy-feedback,
#cinemaghar-container .bypass-feedback {
    display: none;
    margin-left: 10px;
    font-size: 13px;
    color: var(--success-color);
    font-weight: 600;
    opacity: 0;
    transition: opacity 0.3s ease, transform 0.3s ease, color 0.3s ease;
    vertical-align: middle;
    transform: translateY(3px) scale(0.95);
    pointer-events: none;
    white-space: nowrap;
}
#cinemaghar-container .copy-feedback.show,
#cinemaghar-container .bypass-feedback.show {
    opacity: 1;
    transform: translateY(0) scale(1);
}
#cinemaghar-container .copy-feedback.share-fallback { color: var(--text-muted); }
#cinemaghar-container .copy-feedback.error,
#cinemaghar-container .bypass-feedback.error { color: var(--error-color); }
 #cinemaghar-container .bypass-feedback.loading { color: var(--text-muted); font-style: italic; }

/* --- Video Player Container --- */
/* General styles for when it's moved or shown */
#cinemaghar-container .video-container {
    margin: 20px auto 0 auto; /* Default margins */
    background: #f0f2f5;
    padding: 20px;
    border-radius: var(--border-radius-sm);
    box-shadow: var(--shadow-lg);
    position: relative;
    box-sizing: border-box;
    width: 100%;
    max-width: 850px;
    text-align: center;
    display: none; /* Initially hidden */
    flex-direction: column;
    z-index: 900; /* Above other content */
}
/* Styles when used for global custom URL */
#cinemaghar-container .video-container.global-custom-url-mode {
   display: flex; /* Make visible */
   position: fixed; /* Float above */
   top: 50%;
   left: 50%;
   transform: translate(-50%, -50%);
   width: 90%;
   max-width: 600px; /* Limit width for modal-like appearance */
   z-index: 9998; /* High z-index */
   padding: 30px 25px;
   border: 1px solid var(--border-color);
}

#cinemaghar-container .close-btn {
    position: absolute;
    top: 15px;
    right: 18px;
    background: var(--error-color);
    color: white !important;
    border: none;
    padding: 6px 12px;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    z-index: 10;
    transition: background-color 0.2s ease;
}
#cinemaghar-container .close-btn:hover { background-color: #c82333; }

/* Custom URL section inside the player */
#cinemaghar-container #playerCustomUrlSection {
    display: none; /* Hidden by default */
    padding: 20px 10px 10px 10px;
    text-align: left;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 15px;
    border-bottom: 1px dashed var(--border-color);
}
#cinemaghar-container #playerCustomUrlSection label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
}
#cinemaghar-container #playerCustomUrlSection input { /* Uses .custom-url-input style */ }
#cinemaghar-container #playerCustomUrlSection button { /* Uses .play-custom-url-button style */
     align-self: flex-start;
     padding: 9px 18px;
     font-size: 14px;
}
#cinemaghar-container #playerCustomUrlSection .player-custom-url-feedback { /* Uses .custom-url-feedback style */
    font-size: 13px;
    color: var(--error-color);
    margin-top: 5px;
    min-height: 1.2em;
    font-weight: 500;
}

#cinemaghar-container #audioWarning { display: none; background-color: var(--warning-bg); color: var(--warning-text); border: 1px solid var(--warning-border); padding: 12px; margin-bottom: 15px; border-radius: var(--border-radius-sm); font-size: 14px; text-align: center; position: relative; z-index: 1; line-height: 1.5; flex-shrink: 0; }
#cinemaghar-container #audioWarning strong { font-weight: 600; }
#cinemaghar-container #html5VideoPlayer { width: 100%; max-height: 480px; display: block; margin: 10px auto 15px auto; background: black; border-radius: var(--border-radius-sm); outline: none; box-shadow: var(--shadow-md); flex-shrink: 1; flex-grow: 1; object-fit: contain; cursor: default; }
#cinemaghar-container .custom-controls { margin-top: 15px; display: flex; justify-content: center; align-items: center; gap: 12px; flex-wrap: wrap; flex-shrink: 0; position: relative; }
#cinemaghar-container .custom-controls .button { background-color: #5a6268; min-width: 60px; font-size: 12px; padding: 6px 10px; color: white !important; border-radius: var(--border-radius-sm); border: none;}
#cinemaghar-container .custom-controls .button:hover { background-color: #495057; }
#cinemaghar-container #audioTrackSelect { padding: 6px 10px; border-radius: var(--border-radius-sm); background-color: #e9ecef; border: 1px solid var(--border-color); font-size: 13px; font-family: inherit; cursor: pointer; max-width: 150px; display: none; transition: border-color 0.2s ease; height: 30px; line-height: 1; vertical-align: middle; -webkit-appearance: none; -moz-appearance: none; appearance: none; background-image: url('data:image/svg+xml;charset=US-ASCII,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="%236c757d" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>'); background-repeat: no-repeat; background-position: right 5px center; background-size: 12px 10px; padding-right: 25px; }
#cinemaghar-container #audioTrackSelect:focus { border-color: var(--primary-color); outline: none; }
#cinemaghar-container #videoTitle { font-weight: 600; margin-bottom: 15px; font-size: 18px; color: var(--text-color); position: relative; z-index: 1; padding-top: 0; text-align: left; word-break: break-word; flex-shrink: 0; }
#cinemaghar-container .vlc-copy-box { margin-top: 20px; background: #e9ecef; padding: 12px 15px; border-radius: var(--border-radius-sm); font-size: 14px; word-wrap: break-word; line-height: 1.6; color: var(--text-muted); text-align: left; border: 1px solid var(--border-color); flex-shrink: 0; display: none; }
#cinemaghar-container .vlc-copy-box strong { color: var(--text-color); font-weight: 600; display: block; margin-bottom: 5px; }
#cinemaghar-container .vlc-copy-box code { background: #dcdcdc; padding: 3px 6px; border-radius: var(--border-radius-sm); font-family: 'Courier New', Courier, monospace; word-break: break-all; color: #333; font-size: 13px; display: block; margin-top: 3px; user-select: all; }
.player-control-group { display: flex; align-items: center; gap: 6px; } .player-control-group label { font-size: 12px; color: var(--text-muted); white-space: nowrap; } #volumeSlider { width: 80px; cursor: pointer; height: 5px; transition: opacity 0.2s ease; vertical-align: middle; accent-color: var(--primary-color); } #playbackSpeedSelect { padding: 4px 8px; font-size: 12px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color); background-color: #fff; height: 30px; line-height: 1; vertical-align: middle; -webkit-appearance: none; -moz-appearance: none; appearance: none; background-image: url('data:image/svg+xml;charset=US-ASCII,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="%236c757d" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>'); background-repeat: no-repeat; background-position: right 5px center; background-size: 12px 10px; padding-right: 25px; }

/* --- Fullscreen Player Styles --- */
#cinemaghar-container .video-container.is-fullscreen { position: fixed; top: 0; left: 0; width: 100%; height: 100%; max-width: none; padding: 0; margin: 0; border-radius: 0; background-color: black; z-index: 2147483647; display: flex; flex-direction: column; justify-content: center; }
#cinemaghar-container .video-container.is-fullscreen #html5VideoPlayer { width: 100%; height: 100%; max-height: none; flex-grow: 1; flex-shrink: 1; border-radius: 0; box-shadow: none; margin: 0; object-fit: contain; cursor: default; }
/* Hide everything except video in fullscreen */
#cinemaghar-container .video-container.is-fullscreen .custom-controls,
#cinemaghar-container .video-container.is-fullscreen .close-btn,
#cinemaghar-container .video-container.is-fullscreen #videoTitle,
#cinemaghar-container .video-container.is-fullscreen #audioWarning,
#cinemaghar-container .video-container.is-fullscreen .vlc-copy-box,
#cinemaghar-container .video-container.is-fullscreen #playerCustomUrlSection {
    display: none !important;
}

/* --- Pagination --- */
.pagination-container { text-align: center; margin: 30px 0 15px 0; user-select: none; }
.pagination-container button, .pagination-container span { display: inline-block; padding: 9px 16px; margin: 0 4px; border: 1px solid var(--border-color); border-radius: var(--border-radius-sm); background-color: white; color: var(--primary-color); cursor: pointer; font-size: 14px; transition: all 0.2s ease; vertical-align: middle; }
.pagination-container button:hover:not(:disabled) { background-color: var(--pagination-hover-bg); border-color: #adb5bd; }
.pagination-container span.current-page { background-color: var(--pagination-active-bg); border-color: var(--pagination-active-border); color: white; font-weight: 600; cursor: default; }
.pagination-container button:disabled { color: var(--pagination-disabled-color); background-color: var(--pagination-disabled-bg); border-color: var(--pagination-disabled-border); cursor: not-allowed; opacity: 0.7; }
.pagination-container .page-info { font-size: 13px; color: var(--text-muted); margin: 0 5px; padding: 9px 0; border: none; background: none; cursor: default; display: inline-block; vertical-align: middle; }

/* --- Spinner --- */
.spinner { border: 4px solid rgba(0, 0, 0, 0.1); width: 36px; height: 36px; border-radius: 50%; border-left-color: var(--primary-color); margin: 30px auto; animation: spin 1s ease infinite; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

/* Loading messages with spinner */
.loading-inline-spinner { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 20px; }
.loading-inline-spinner .spinner { margin: 0; width: 24px; height: 24px; border-width: 3px; }
.loading-inline-spinner span { color: var(--text-muted); font-size: 14px; }

/* Error message container styling */
.error-container {
    padding: 20px;
    text-align: center;
    width: 100%;
    background-color: var(--error-bg);
    color: var(--error-text);
    border: 1px solid var(--error-border);
    border-radius: var(--border-radius-sm);
    margin: 20px auto;
    max-width: 800px;
}

/* --- Footer Styles --- */
#page-footer {
    width: 100%;
    margin-top: 40px;
    padding: 25px 20px;
    border-top: 1px solid var(--border-color);
    background-color: var(--light-bg);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
    flex-shrink: 0;
    transition: display var(--transition-speed) var(--transition-timing);
}
#cinemaghar-container.shared-view-active #page-footer {
    display: none;
}
#page-footer .footer-text {
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 0;
}
#page-footer .footer-buttons {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 15px;
    flex-wrap: wrap;
}
#cinemaghar-container #page-footer .button {
    display: inline-flex;
    align-items: center;
    font-size: 13px;
    padding: 8px 15px;
    border-radius: var(--border-radius-sm);
    box-shadow: var(--shadow-sm);
    background-color: var(--primary-color);
    color: white !important;
    border: 1px solid var(--primary-color);
    text-decoration: none;
    transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}
#cinemaghar-container #page-footer .button:hover {
    background-color: var(--primary-hover);
    border-color: var(--primary-hover);
    color: white !important;
    box-shadow: var(--shadow-md);
    filter: none;
    opacity: 1;
    transform: translateY(-1px);
}
#cinemaghar-container #page-footer .button svg {
    height: 1em;
    width: 1em;
    margin-right: 6px;
    vertical-align: text-bottom;
    fill: white;
    opacity: 1;
}

/* --- Responsive Styles --- */
@media screen and (max-width: 768px) {
  body { font-size: 14px; }
  #cinemaghar-container {
      max-width: 100%;
      margin: 0;
      padding: 10px 0 0 0;
      border-radius: 0;
      box-shadow: none;
      flex-grow: 1;
  }

  #search-focus-area { padding: 70px 15px 20px 15px; }
  #cinemaghar-container.results-active #search-focus-area { padding: 15px 15px 10px 15px; border-bottom: 1px solid var(--border-color); min-height: 67px; }

  #search-focus-area .simple-title { font-size: 42px; margin-bottom: 0px; }
  #search-focus-area .signature { font-size: 11px; margin: -2px auto 20px auto; max-width: 95%; }

  .search-input-wrapper { margin-bottom: 15px; max-width: 95%; gap: 0; }
  #cinemaghar-container #mainSearchInput { padding: 10px 15px 10px 40px; font-size: 14px; height: 42px; border-radius: var(--border-radius-sm) 0 0 var(--border-radius-sm); }
   #cinemaghar-container .search-input-wrapper #searchSubmitButton { height: 42px; padding: 0 18px; font-size: 13px; border-radius: 0 var(--border-radius-sm) var(--border-radius-sm) 0; }
  .search-input-wrapper::before { left: 12px; width: 16px; height: 16px; opacity: 0.6; }

  #searchInputSuggestions { width: 100%; max-width: 100%; top: calc(100% + 1px); border-radius: 0 0 var(--border-radius-sm) var(--border-radius-sm); }
  #searchInputSuggestions div { padding: 9px 15px 9px 40px; font-size: 14px; }

  .search-actions { gap: 10px; margin-bottom: 25px; margin-top: 10px; }
  #cinemaghar-container .search-actions .button { padding: 9px 16px; font-size: 13px; }

  #updates-preview-section { max-width: 100%; padding: 15px; margin-top: 5px; border-left: none; border-right: none; border-radius: 0; }
  #updates-preview-section h3 { font-size: 14px; margin-bottom: 12px; }
  #updates-preview-list { padding-top: 10px;}
  .update-item { font-size: 13px; padding: 10px 5px; gap: 5px; }
  .update-item .preview-col-id { width: 12%; font-size: 12px; }
  .update-item .preview-col-filename { width: 53%; font-weight: 500; }
  .update-item .preview-col-filename a.filename-link { /* Mobile filename link */ }
  .update-item .preview-col-filename .quality-logo { height: 1em; }
  .update-item .preview-col-date { width: 18%; font-size: 11px; }
  .update-item .preview-col-view { width: 17%; }
  .update-item .preview-col-view a.view-button-link { font-size: 11px; padding: 5px 8px; min-width: 40px; }

  /* REMOVED: Preview Action Row mobile styles */

  #showMoreUpdatesButton { font-size: 13px; padding: 8px 18px; }


  #results-area { margin: 0; padding: 15px; border-radius: 0;}

  #shared-item-view { padding: 15px; margin-top: 10px; max-width: 95%; border-radius: var(--border-radius-sm); }
  #shared-item-view .back-button { margin-bottom: 20px; padding: 7px 12px; font-size: 13px; }
  #shared-item-content { padding: 15px 10px; }
  /* Player container adjustments within mobile item view */
  #shared-item-content > #videoContainer {
      margin-left: -10px;
      margin-right: -10px;
      width: calc(100% + 20px);
      max-width: calc(100% + 20px);
      padding: 15px 10px; /* Reduce player padding */
  }
  #shared-item-content .action-info { font-size: 13px; margin-bottom: 15px; }
   #shared-item-content .action-info .info-item { margin-bottom: 6px; line-height: 1.5; }
   #shared-item-content .action-info strong { min-width: 65px; margin-right: 5px; }
   #shared-item-content .action-info .quality-logo { height: 0.9em; }
   #shared-item-content .action-buttons-container { flex-direction: column; align-items: stretch; gap: 8px; padding-top: 15px; }
   #shared-item-content .action-buttons-container .button { font-size: 13px; padding: 10px 15px; width: 100%; margin: 0; box-sizing: border-box; }
   #shared-item-content .action-buttons-container .copy-feedback,
   #shared-item-content .action-buttons-container .bypass-feedback { margin-left: 0; margin-top: 5px; text-align: center; width: 100%; display: block; vertical-align: initial; }

  #cinemaghar-container .back-button { padding: 7px 12px; font-size: 13px; }

  .results-filter-area { flex-direction: column; align-items: stretch; gap: 12px; margin: 0 0 15px 0; padding-bottom: 15px; }
  .results-filter-area .filter-group { justify-content: space-between; }
  #cinemaghar-container #mainQualityFilterSelect { height: 40px; min-width: unset; flex-grow: 1; }

  .tab-navigation { margin-bottom: 20px; }
  .tab-navigation .tab-button { padding: 10px 15px; font-size: 15px; }

  #cinemaghar-container .table-container { border: none; box-shadow: none; border-radius: 0; margin-left: -15px; margin-right: -15px; overflow-x: visible; }
   #cinemaghar-container table { min-width: unset; border: 1px solid var(--border-color); border-radius: var(--border-radius-sm); box-shadow: var(--shadow-sm); display: block; overflow-x: auto; white-space: nowrap; -webkit-overflow-scrolling: touch; }
   #cinemaghar-container thead, #cinemaghar-container tbody, #cinemaghar-container tr { display: table; width: 100%; table-layout: fixed; }
   #cinemaghar-container thead { position: sticky; top: 0; z-index: 3; background: var(--table-header-bg); }
   #cinemaghar-container th, #cinemaghar-container td { padding: 12px 10px; font-size: 13px; border-bottom: 1px solid var(--border-color); display: table-cell; white-space: normal; vertical-align: middle; }

  /* Hide columns on mobile */
  #cinemaghar-container thead tr th.col-size,
  #cinemaghar-container thead tr th.col-updated,
  #cinemaghar-container tbody tr td.col-size, /* Target TD specifically */
  #cinemaghar-container tbody tr td.col-updated { display: none; }

   /* Adjust visible column widths */
   #cinemaghar-container th.col-id, #cinemaghar-container td.col-id { width: 15%; text-align: center; }
   #cinemaghar-container th.col-filename, #cinemaghar-container td.col-filename { width: 45%; font-weight: 500; }
   #cinemaghar-container th.col-quality, #cinemaghar-container td.col-quality { width: 20%; text-align: center; font-weight: 500;}
   #cinemaghar-container th.col-view, #cinemaghar-container td.col-view { width: 20%; text-align: center; }

  #cinemaghar-container th .sort-indicator { margin-left: 4px; border-width: 4px; }
  #cinemaghar-container th.sort-asc .sort-indicator { border-bottom-width: 4px; }
  #cinemaghar-container th.sort-desc .sort-indicator { border-top-width: 4px; }

  #cinemaghar-container td.col-filename { word-break: break-word; white-space: normal; }
  #cinemaghar-container td.col-filename a.filename-link { /* Mobile filename link specific */ }
  #cinemaghar-container td.col-filename .quality-logo { height: 0.9em; margin-left: 3px; vertical-align: baseline; }
  #cinemaghar-container td.col-quality { min-width: unset; }
  #cinemaghar-container td.col-view a.view-button-link { font-size: 12px !important; padding: 6px 8px !important; min-width: 45px; width: auto; }

  /* REMOVED: .action-row td mobile styles */
  /* REMOVED: .action-info mobile styles (now only applies in shared-item-content) */
  /* REMOVED: .action-buttons-container mobile styles (now only applies in shared-item-content) */

  /* Player adjustments */
  #cinemaghar-container .video-container:not(.global-custom-url-mode) #html5VideoPlayer { max-height: 280px; border-radius: var(--border-radius-sm);}
  #cinemaghar-container .video-container { padding: 45px 10px 15px 10px; max-width: 100%; margin-left: 0; margin-right: 0; border-radius: var(--border-radius-sm); }
  #cinemaghar-container .video-container.global-custom-url-mode { width: 95%; max-width: 95%; padding: 25px 15px; }
  #cinemaghar-container .video-container.is-fullscreen #html5VideoPlayer { max-height: none; }
  #cinemaghar-container .close-btn { top: 12px; right: 12px; padding: 5px 9px; font-size: 12px; }
  #cinemaghar-container #videoTitle { font-size: 16px; }
  #cinemaghar-container #audioWarning { font-size: 12px; padding: 10px; line-height: 1.4; }
  #cinemaghar-container .custom-controls { gap: 8px; }
  #cinemaghar-container .custom-controls .button { padding: 7px 10px; font-size: 11px; min-width: 55px;}
  #cinemaghar-container #audioTrackSelect { font-size: 12px; padding: 5px 8px; max-width: 120px; height: 34px; }
  #cinemaghar-container .vlc-copy-box { font-size: 12px; padding: 10px; }
  #cinemaghar-container .vlc-copy-box code { font-size: 11px; }
  .player-control-group label { font-size: 11px;}
  #volumeSlider { width: 60px;}
  #playbackSpeedSelect { font-size: 12px; padding: 3px 6px; height: 34px; }

  /* Pagination Adjustments */
    .pagination-container { margin: 20px 0 10px 0; }
    .pagination-container button,
    .pagination-container span { padding: 8px 12px; font-size: 13px; margin: 0 3px;}
    .pagination-container .page-info { font-size: 12px; margin: 0 5px; padding: 8px 0;}

    /* Footer Mobile Adjustments */
    #page-footer { margin-top: 30px; padding: 20px 15px; gap: 12px; }
    #page-footer .footer-text { font-size: 12px; }
    #page-footer .footer-buttons { gap: 12px; }
    #cinemaghar-container #page-footer .button { font-size: 12px; padding: 7px 12px; }
    #cinemaghar-container #page-footer .button svg { margin-right: 5px; }
}
/* --- END OF style.css --- */
