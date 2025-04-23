// script.js
(function() {
    'use strict';

    // ===========================================================
    // JAVASCRIPT SECTION (Refactored for Performance)
    // ===========================================================
    const config = {
        HDR_LOGO_URL: "https://as1.ftcdn.net/v2/jpg/05/32/83/72/1000_F_532837228_v8CGZRU0jy39uCtqFRnJz6xDntrGuLLx.webp",
        FOURK_LOGO_URL: "https://i.pinimg.com/736x/85/c4/b0/85c4b0a2fb8612825d0cd2f53460925f.jpg",
        ITEMS_PER_PAGE: 50,
        LOCAL_STORAGE_KEY: 'cinemaGharState_v10_db', // Incremented version
        PLAYER_VOLUME_KEY: 'cinemaGharPlayerVolume',
        PLAYER_SPEED_KEY: 'cinemaGharPlayerSpeed',
        SEARCH_DEBOUNCE_DELAY: 300,        // For triggering main search fetch
        SUGGESTIONS_DEBOUNCE_DELAY: 250,   // For triggering API suggestions fetch
        MAX_SUGGESTIONS_TO_SHOW: 10,       // Max suggestions displayed in dropdown
        UPDATES_PREVIEW_INITIAL_COUNT: 10,
        UPDATES_PREVIEW_LOAD_MORE_COUNT: 10,
        MOVIE_DATA_API_URL: '/api/movies' // Main API endpoint
    };

    // --- DOM Element References ---
    const container = document.getElementById('cinemaghar-container');
    const pageLoader = document.getElementById('page-loader');
    const searchFocusArea = document.getElementById('search-focus-area');
    const resultsArea = document.getElementById('results-area');
    const sharedItemView = document.getElementById('shared-item-view');
    const sharedItemContent = document.getElementById('shared-item-content');
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
    const pageFooter = document.getElementById('page-footer');

    // --- State Variables ---
    // let localSuggestionData = []; // REMOVED - Suggestions are now fetched from API
    let currentViewData = []; // Holds data for the *currently displayed* page in search results
    let weeklyUpdatesData = []; // Holds processed data for the updates preview (MASTER LIST)
    let updatesPreviewShownCount = 0; // Tracks how many are *currently rendered* in the preview
    // let uniqueQualities = new Set(); // REMOVED - Qualities fetched from API
    let activeTableActionRow = null;
    let activePreviewActionRow = null;
    let copyFeedbackTimeout;
    let suggestionDebounceTimeout;
    let searchAbortController = null; // For cancelling ongoing API requests
    let suggestionAbortController = null; // Separate controller for suggestions
    let isDirectShareLoad = false;
    let currentViewMode = 'homepage'; // 'homepage', 'search', 'shared'
    let activeResultsTab = 'allFiles'; // 'allFiles', 'movies', 'series'
    let lastFocusedElement = null;

    // Holds current filter/sort/page state for API requests
    let currentState = {
        searchTerm: '',
        qualityFilter: '',
        typeFilter: '',         // '' (all), 'movies', 'series'
        sortColumn: 'lastUpdated', // Default sort
        sortDirection: 'desc',     // Default direction
        currentPage: 1,
        limit: config.ITEMS_PER_PAGE,
    };

    const tabMappings = {
        allFiles: { button: allFilesTabButton, panel: allFilesTabPanel, tableBody: allFilesTableBody, pagination: allFilesPaginationControls, typeFilter: '', tableHead: allFilesTableHead },
        movies: { button: moviesTabButton, panel: moviesTabPanel, tableBody: moviesTableBody, pagination: moviesPaginationControls, typeFilter: 'movies', tableHead: moviesTableHead },
        series: { button: seriesTabButton, panel: seriesTabPanel, tableBody: seriesTableBody, pagination: seriesPaginationControls, typeFilter: 'series', tableHead: seriesTableHead }
    };

    // --- Utility Functions (Largely Unchanged) ---
    const sanitize = (str) => { if (str === null || typeof str === 'undefined') return ""; const temp = document.createElement('div'); temp.textContent = String(str); return temp.innerHTML; };
    const TimeAgo = { MINUTE: 60, HOUR: 3600, DAY: 86400, WEEK: 604800, MONTH: 2592000, YEAR: 31536000, format: (isoString) => { if (!isoString) return 'N/A'; try { const date = new Date(isoString); const seconds = Math.floor((new Date() - date) / 1000); if (isNaN(seconds) || seconds < 0) { console.warn(`TimeAgo: Invalid seconds calculation for ${isoString}. Parsed date: ${date}. Returning full date.`); return TimeAgo.formatFullDate(date); } if (seconds < 2) return "just now"; if (seconds < TimeAgo.MINUTE) return `${seconds} sec${seconds > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.HOUR) return `${Math.floor(seconds / TimeAgo.MINUTE)} min${Math.floor(seconds / TimeAgo.MINUTE) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY) return `${Math.floor(seconds / TimeAgo.HOUR)} hr${Math.floor(seconds / TimeAgo.HOUR) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY * 2) return "Yesterday"; if (seconds < TimeAgo.WEEK) return `${Math.floor(seconds / TimeAgo.DAY)} days ago`; if (seconds < TimeAgo.MONTH) return `${Math.floor(seconds / TimeAgo.WEEK)} wk${Math.floor(seconds / TimeAgo.WEEK) > 1 ? 's' : ''} ago`; return TimeAgo.formatFullDate(date, true); } catch (e) { console.error("Date Format Error (TimeAgo):", isoString, e); return 'Invalid Date'; } }, formatFullDate: (date, short = false) => { if (!(date instanceof Date) || isNaN(date.getTime())) return 'Invalid Date'; const optsDate = short ? { year: '2-digit', month: 'numeric', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }; const optsTime = { hour: 'numeric', minute: '2-digit', hour12: true }; try { return `${date.toLocaleDateString(undefined, optsDate)}${short ? '' : ', ' + date.toLocaleTimeString(undefined, optsTime)}`; } catch (e) { console.error("toLocaleDateString/Time failed:", e); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; } } };
    function extractSizeData(inputString) { if (!inputString) return { value: 0, unit: '', display: 'N/A', bytes: 0 }; const r = /(?<size>[\d.]+)\s?(?<unit>GB|MB)/i; const m = String(inputString).match(r); if (m?.groups?.size && m?.groups?.unit) { const value = parseFloat(m.groups.size); const unit = m.groups.unit.toUpperCase(); if (!isNaN(value)) { const bytes = unit === 'GB' ? value * 1024 * 1024 * 1024 : value * 1024 * 1024; return { value: value, unit: unit, display: `${value} ${unit}`, bytes: isNaN(bytes) ? 0 : Math.round(bytes) }; } } return { value: 0, unit: '', display: 'N/A', bytes: 0 }; }
    function getMimeTypeFromUrl(url) { if (!url) return 'video/*'; const m = url.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/); if (!m) return 'video/*'; const ext = m[1].toLowerCase(); const mimeMap = { 'mkv': 'video/x-matroska', 'mp4': 'video/mp4', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo', 'webm': 'video/webm', 'wmv': 'video/x-ms-wmv', 'flv': 'video/x-flv', 'ts': 'video/mp2t', 'm4v': 'video/x-m4v', 'ogv': 'video/ogg' }; return mimeMap[ext] || 'video/*'; }
    function handleVideoError(event) { console.error("HTML5 Video Error:", event, videoElement?.error); let msg = "An unknown error occurred while trying to play the video."; if (videoElement?.error) { switch (videoElement.error.code) { case MediaError.MEDIA_ERR_ABORTED: msg = 'Playback was aborted.'; break; case MediaError.MEDIA_ERR_NETWORK: msg = 'A network error caused the video download to fail.'; break; case MediaError.MEDIA_ERR_DECODE: msg = 'Video decoding error (unsupported codec or corrupt file?).'; break; case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = 'Video format not supported or server/network failed.'; break; default: msg = `An unknown video error occurred (Code: ${videoElement.error.code}).`; break; } } if (audioWarningDiv) { audioWarningDiv.innerHTML = `<strong>Playback Error:</strong> ${sanitize(msg)} <br>Consider using 'Copy URL' with an external player (VLC/MX) or 'Open Externally' (Android).`; audioWarningDiv.style.display = 'block'; } }
    function extractQualityFromFilename(filename) { if (!filename) return null; const safeFilename = String(filename); const patterns = [ /(?:^|\.|\[|\(|\s|_|-)((?:4k|2160p|1080p|720p|480p))(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(WEB-?DL|WEBRip|BluRay|BDRip|BRRip|HDTV|HDRip|DVDrip|DVDScr|HDCAM|HC|TC|TS|CAM)(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(HDR|DV|Dolby.?Vision|HEVC|x265)(?=$|\.|\]|\)|\s|_|-)/i ]; let foundQuality = null; for (const regex of patterns) { const match = safeFilename.match(regex); if (match && match[1]) { let quality = match[1].toUpperCase(); quality = quality.replace(/WEB-?DL/i, 'WEBDL'); quality = quality.replace(/BLURAY/i, 'BluRay'); quality = quality.replace(/DVDRIP/i, 'DVD'); quality = quality.replace(/DOLBY.?VISION/i, 'Dolby Vision'); if (quality === '2160P') quality = '4K'; if (patterns.indexOf(regex) < 2) return quality; if (patterns.indexOf(regex) === 2 && !foundQuality) foundQuality = quality; } } return foundQuality; }
    function normalizeTextForSearch(text) { if (!text) return ""; return String(text) .toLowerCase() .replace(/[.\-_\(\)\[\]]/g, '') .replace(/\s+/g, ' ') .trim(); }
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    async function copyToClipboard(text, feedbackSpan) { console.log("Attempting to copy:", text); let success = false; if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) { try { await navigator.clipboard.writeText(text); success = true; console.log("navigator.clipboard.writeText SUCCEEDED"); } catch (err) { console.error("Async clipboard write failed:", err); success = false; } } if (!success) { console.warn("Using fallback copy method (execCommand)."); const textArea = document.createElement("textarea"); textArea.value = text; textArea.style.position = "fixed"; textArea.style.top = "-9999px"; textArea.style.left = "-9999px"; textArea.style.opacity = "0"; textArea.setAttribute("readonly", ""); document.body.appendChild(textArea); try { textArea.select(); textArea.setSelectionRange(0, textArea.value.length); success = document.execCommand('copy'); console.log("Fallback execCommand result:", success); } catch (err) { console.error('Fallback copy execCommand failed:', err); success = false; } finally { document.body.removeChild(textArea); } } if (success) { console.log("Copy successful!"); if (feedbackSpan) { showCopyFeedback(feedbackSpan, 'Copied!', false); } } else { console.error("Copy FAILED."); if (feedbackSpan) { showCopyFeedback(feedbackSpan, 'Copy Failed!', true); } else { alert("Copy failed. Please try again or copy manually. Check console for errors (F12)."); } } return success; }

    // --- Data Preprocessing (Minor change: removed quality set update) ---
    function preprocessMovieData(movie) {
        const processed = { ...movie }; // Shallow copy from API response
        // Map API's original_id to frontend's id
        processed.id = movie.original_id;
        processed.displayFilename = sanitize(movie.filename || '');
        // Use size_display directly, calculate bytes if needed for sorting later
        processed.sizeData = extractSizeData(movie.size_display);
        // If size_bytes wasn't selected but size_display was, use the calculated bytes
        if (!processed.size_bytes && processed.sizeData.bytes > 0) {
             processed.size_bytes = processed.sizeData.bytes;
        }
        processed.displayQuality = sanitize(movie.quality || 'N/A');
        // Removed: uniqueQualities.add(...) - Qualities fetched separately

        // Robust timestamp handling
        const tsString = movie.last_updated_ts;
        let dateObject = null;
        if (tsString) {
            try { dateObject = new Date(tsString); } catch(e) { console.warn("Date parse error in preprocessMovieData:", e); }
        }
        // Store numeric timestamp for potential client-side sorting if ever needed
        processed.lastUpdatedTimestamp = (dateObject && !isNaN(dateObject)) ? dateObject.getTime() : 0;
        if (processed.lastUpdatedTimestamp === 0 && tsString) {
            console.warn(`Invalid date format received for movie ID ${processed.id}, filename "${processed.displayFilename}":`, tsString);
        }
        // Used for potential client-side sorting if needed
        processed.numericId = typeof processed.id === 'number' ? processed.id : Infinity;
        // Used only if client-side suggestion filtering were re-enabled
        // processed.searchText = normalizeTextForSearch(`${processed.id || ''} ${processed.displayFilename}`);
        processed.isSeries = !!movie.is_series;
        return processed;
    }

    // --- HTML Generation (Largely Unchanged - uses processed data) ---
    function createActionContentHTML(movie) { const displayFilename = movie.displayFilename; const displaySize = movie.sizeData.display; const displayQuality = movie.displayQuality; const streamTitle = (displayFilename || '').split(/[\.\(\[]/)[0].replace(/[_ ]+/g, ' ').trim() + (displayQuality !== 'N/A' ? ` (${displayQuality})` : ''); const timestampString = movie.last_updated_ts; const formattedDateRelative = TimeAgo.format(timestampString); const dateObject = timestampString ? new Date(timestampString) : null; const formattedDateFull = (dateObject && !isNaN(dateObject)) ? TimeAgo.formatFullDate(dateObject) : 'N/A'; let hdrLogoHtml = ''; let fourkLogoHtml = ''; const lowerFilename = (displayFilename || '').toLowerCase(); if (displayQuality === '4K' || lowerFilename.includes('2160p') || lowerFilename.includes('.4k.')) { fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo fourk-logo" title="4K Ultra HD" />`; } if ((displayQuality || '').includes('HDR') || (displayQuality || '').includes('DOLBY VISION') || displayQuality === 'DV' || lowerFilename.includes('hdr') || lowerFilename.includes('dolby.vision') || lowerFilename.includes('.dv.')) { hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo hdr-logo" title="HDR / Dolby Vision Content" />`; } const escapedStreamTitle = sanitize(streamTitle).replace(/'/g, "\\'"); const escapedFilename = sanitize(displayFilename).replace(/'/g, "\\'"); const escapedUrl = movie.url ? sanitize(movie.url).replace(/'/g, "\\'") : ''; const escapedId = movie.id ? String(movie.id).replace(/'/g, "\\'") : ''; let actionButtonsHTML = ''; if (movie.url && movie.url.toLowerCase() !== 'null') { actionButtonsHTML += `<button class="button play-button" data-action="play" data-title="${escapedStreamTitle}" data-url="${escapedUrl}" data-filename="${escapedFilename}"><span aria-hidden="true">▶️</span> Play here</button>`; actionButtonsHTML += `<a class="button download-button" href="${sanitize(movie.url)}" download="${displayFilename}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">💾</span> Direct Download</a>`; actionButtonsHTML += `<button class="button vlc-button" data-action="copy-vlc" data-url="${escapedUrl}"><span aria-hidden="true">📋</span> Copy URL (for VLC/MX)</button><span class="copy-feedback" role="status" aria-live="polite">Copied!</span>`; if (navigator.userAgent.toLowerCase().includes("android")) { actionButtonsHTML += `<button class="button intent-button" data-action="open-intent" data-url="${escapedUrl}"><span aria-hidden="true">📱</span> Open Externally (Android)</button>`; } } if (movie.telegram_link && movie.telegram_link.toLowerCase() !== 'null') actionButtonsHTML += `<a class="button telegram-button" href="${sanitize(movie.telegram_link)}" target="_blank" rel="noopener noreferrer">Telegram File</a>`; if (movie.gdflix_link) actionButtonsHTML += `<a class="button gdflix-button" href="${sanitize(movie.gdflix_link)}" target="_blank" rel="noopener noreferrer">GDFLIX</a>`; if (movie.hubcloud_link && movie.hubcloud_link.toLowerCase() !== 'null') actionButtonsHTML += `<a class="button hubcloud-button" href="${sanitize(movie.hubcloud_link)}" target="_blank" rel="noopener noreferrer">HubCloud</a>`; if (movie.filepress_link) actionButtonsHTML += `<a class="button filepress-button" href="${sanitize(movie.filepress_link)}" target="_blank" rel="noopener noreferrer">Filepress</a>`; if (movie.gdtot_link) actionButtonsHTML += `<a class="button gdtot-button" href="${sanitize(movie.gdtot_link)}" target="_blank" rel="noopener noreferrer">GDToT</a>`; if (movie.id) { actionButtonsHTML += `<button class="button share-button" data-action="share" data-id="${escapedId}" data-title="${escapedStreamTitle}" data-filename="${escapedFilename}"><span aria-hidden="true">🔗</span> Share Post</button><span class="copy-feedback share-fallback" role="status" aria-live="polite">Link copied!</span>`; } if (!actionButtonsHTML) { actionButtonsHTML = '<span style="color: var(--text-muted); font-style: italic; text-align: center; width: 100%; display: block; padding: 10px 0;">No stream/download actions available</span>'; } const originalFilenameDisplay = movie.originalFilename ? `<span class="info-item"><strong>Original Name:</strong> ${sanitize(movie.originalFilename)}</span>` : ''; const actionContentHTML = ` <div class="action-info"> <span class="info-item"><strong>Filename:</strong> ${displayFilename}</span> <span class="info-item"><strong>Quality:</strong> ${displayQuality} ${fourkLogoHtml}${hdrLogoHtml}</span> <span class="info-item"><strong>Size:</strong> ${displaySize}</span> <span class="info-item"><strong>Language:</strong> ${sanitize(movie.languages || 'N/A')}</span> <span class="info-item"><strong>Updated:</strong> ${formattedDateFull} (${formattedDateRelative})</span> ${originalFilenameDisplay} </div> <div class="action-buttons-container"> ${actionButtonsHTML} </div>`; return actionContentHTML; }
    function createMovieTableRowHTML(movie, dataIndex, actionRowId) { const displayFilename = movie.displayFilename; const displaySize = movie.sizeData.display; const displayQuality = movie.displayQuality; const timestampString = movie.last_updated_ts; const formattedDateRelative = TimeAgo.format(timestampString); const dateObject = timestampString ? new Date(timestampString) : null; const formattedDateFull = (dateObject && !isNaN(dateObject)) ? TimeAgo.formatFullDate(dateObject) : 'N/A'; let hdrLogoHtml = ''; let fourkLogoHtml = ''; const lowerFilename = (displayFilename || '').toLowerCase(); if (displayQuality === '4K' || lowerFilename.includes('2160p') || lowerFilename.includes('.4k.')) { fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo fourk-logo" title="4K Ultra HD" />`; } if ((displayQuality || '').includes('HDR') || (displayQuality || '').includes('DOLBY VISION') || displayQuality === 'DV' || lowerFilename.includes('hdr') || lowerFilename.includes('dolby.vision') || lowerFilename.includes('.dv.')) { hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo hdr-logo" title="HDR / Dolby Vision Content" />`; } const mainRowHTML = ` <tr class="movie-data-row" data-index="${dataIndex}" data-action-row-id="${actionRowId}"> <td class="col-id">${sanitize(movie.id || 'N/A')}</td> <td class="col-filename" title="Click to view details: ${displayFilename}"> ${displayFilename}${fourkLogoHtml}${hdrLogoHtml} </td> <td class="col-size">${displaySize}</td> <td class="col-quality">${displayQuality}</td> <td class="col-updated" title="${formattedDateFull}">${formattedDateRelative}</td> <td class="col-view"> <button class="button view-button" aria-expanded="false">View</button> </td> </tr>`; return mainRowHTML; }

    // --- View Control (Largely Unchanged) ---
    function setViewMode(mode) { console.log("Setting view mode to:", mode); const previousMode = currentViewMode; currentViewMode = mode; if (mode !== previousMode) { closePlayerIfNeeded(null); } container.classList.toggle('results-active', mode === 'search'); container.classList.toggle('shared-view-active', mode === 'shared'); const showHomepage = mode === 'homepage'; const showSearch = mode === 'search'; const showShared = mode === 'shared'; if (searchFocusArea) searchFocusArea.style.display = (showHomepage || showSearch) ? 'flex' : 'none'; if (resultsArea) resultsArea.style.display = showSearch ? 'block' : 'none'; if (sharedItemView) sharedItemView.style.display = showShared ? 'block' : 'none'; if (updatesPreviewSection) updatesPreviewSection.style.display = showHomepage ? 'block' : 'none'; if (pageFooter) pageFooter.style.display = (showHomepage || showSearch) ? 'flex' : 'none'; if (showHomepage) { if (searchInput) searchInput.value = ''; currentState.searchTerm = ''; if (suggestionsContainer) suggestionsContainer.style.display = 'none'; activeResultsTab = 'allFiles'; currentState.currentPage = 1; currentState.typeFilter = ''; closeActiveActionRow('table', null); closeActiveActionRow('preview', null); if (weeklyUpdatesData.length > 0) { displayInitialUpdates(); } else { /* Initial load state handled by initializeApp */ } document.title = "Cinema Ghar Index"; } else if (showSearch) { closeActiveActionRow('preview', null); document.title = "Cinema Ghar Index"; } else if (showShared) { closeActiveActionRow('table', null); closeActiveActionRow('preview', null); } saveStateToLocalStorage(); }
    window.resetToHomepage = function(event) { const triggerElement = event?.target; const wasInSharedView = (currentViewMode === 'shared'); if (!wasInSharedView && window.history.pushState) { const cleanUrl = window.location.origin + window.location.pathname; window.history.pushState({ path: cleanUrl }, '', cleanUrl); } else if (!wasInSharedView) { window.location.hash = ''; } isDirectShareLoad = false; if (wasInSharedView) { console.log("Returning from shared view, performing full page reload to reset."); window.location.href = window.location.origin + window.location.pathname; } else { lastFocusedElement = triggerElement; setViewMode('homepage'); if (searchInput) { setTimeout(() => searchInput.focus(), 100); } } }

    // --- Search and Suggestions Logic (REVISED: Fetches Suggestions from API) ---
    function handleSearchInput() {
        clearTimeout(suggestionDebounceTimeout);
        const searchTerm = searchInput.value.trim();

        if (searchTerm.length < 2) {
            suggestionsContainer.style.display = 'none';
             if (suggestionAbortController) {
                suggestionAbortController.abort(); // Cancel pending suggestion request
                suggestionAbortController = null;
            }
            return;
        }

        suggestionDebounceTimeout = setTimeout(() => {
            fetchAndDisplaySuggestions(searchTerm);
        }, config.SUGGESTIONS_DEBOUNCE_DELAY);
    }

    async function fetchAndDisplaySuggestions(term) {
        if (!term || term.length < 2) {
            suggestionsContainer.style.display = 'none';
            return;
        }
        // Abort previous suggestion request if any
        if (suggestionAbortController) {
            suggestionAbortController.abort();
        }
        suggestionAbortController = new AbortController();
        const signal = suggestionAbortController.signal;

        const params = { mode: 'suggestions', term: term };
        const query = new URLSearchParams(params);
        const url = `${config.MOVIE_DATA_API_URL}?${query.toString()}`;
        console.log("Fetching suggestions from API:", url);

        try {
            const response = await fetch(url, { signal });
             if (signal.aborted) return; // Request was cancelled

            if (!response.ok) {
                throw new Error(`Suggestion API Error: ${response.status}`);
            }
            const data = await response.json();
            if (signal.aborted) return; // Request was cancelled after fetch but before processing

            const matchingFilenames = data.suggestions || [];
            suggestionsContainer.innerHTML = ''; // Clear previous

            if (matchingFilenames.length > 0) {
                const fragment = document.createDocumentFragment();
                matchingFilenames.slice(0, config.MAX_SUGGESTIONS_TO_SHOW).forEach(filename => {
                    const div = document.createElement('div');
                    try {
                        // Highlight the term (case-insensitive)
                        const safeTerm = escapeRegExp(term);
                        const regex = new RegExp(`(${safeTerm})`, 'i');
                        div.innerHTML = sanitize(filename).replace(regex, '<strong>$1</strong>');
                    } catch (e) {
                        console.warn("Regex error during suggestion highlighting:", e);
                        div.textContent = sanitize(filename); // Fallback
                    }
                    div.title = filename; // Show full name on hover
                    div.onclick = () => selectSuggestion(filename); // Use original filename for selection
                    fragment.appendChild(div);
                });
                suggestionsContainer.appendChild(fragment);
                suggestionsContainer.style.display = 'block';
            } else {
                suggestionsContainer.style.display = 'none';
            }
        } catch (error) {
             if (error.name === 'AbortError') {
                console.log('Suggestion fetch aborted.');
            } else {
                console.error("Failed to fetch suggestions:", error);
                suggestionsContainer.style.display = 'none'; // Hide on error
            }
        } finally {
             if (signal === suggestionAbortController?.signal) {
                suggestionAbortController = null; // Clear controller only if it's the one finishing
            }
        }
    }

    function selectSuggestion(selectedValue) {
        searchInput.value = selectedValue; // Set input value to the clicked suggestion
        suggestionsContainer.style.display = 'none';
        handleSearchSubmit(); // Trigger a full search with the selected value
    }

    window.handleSearchSubmit = function() {
        if (suggestionsContainer) {
            suggestionsContainer.style.display = 'none'; // Hide suggestions
            if (suggestionAbortController) suggestionAbortController.abort(); // Cancel pending suggestions
        }
        const searchTerm = searchInput.value.trim();
        console.log("Handling search submit for:", searchTerm);

        if (searchInput) { searchInput.blur(); } // Remove focus

        // If search is empty and we are already on homepage, do nothing
        if (searchTerm.length === 0 && currentViewMode === 'homepage') {
             console.log("Empty search on homepage, doing nothing.");
            return;
        }
        // If search is empty and we are NOT on homepage, reset
        if (searchTerm.length === 0 && currentViewMode !== 'homepage') {
            resetToHomepage();
            return;
        }

        // If we have a search term, switch to search view
        setViewMode('search');
        activeResultsTab = 'allFiles'; // Always default to 'All Files' tab on new search
        currentState.currentPage = 1;   // Reset to page 1
        currentState.searchTerm = searchTerm;
        currentState.qualityFilter = qualityFilterSelect.value || ''; // Get current filter
        currentState.typeFilter = ''; // Reset type filter for 'All Files' tab

        updateActiveTabAndPanel(); // Visually switch to the 'All Files' tab
        showLoadingStateInTables(`Searching for "${sanitize(searchTerm)}"...`);
        fetchAndRenderResults(); // Fetch results from API
    }

    function handleSearchClear() {
        // This function is triggered by the 'x' button in <input type="search">
        clearTimeout(suggestionDebounceTimeout);
        if (suggestionAbortController) suggestionAbortController.abort();
        suggestionsContainer.style.display = 'none';

        // Use setTimeout to allow the input value to clear *before* checking
        setTimeout(() => {
            if (searchInput.value.trim() === '') {
                console.log("Search input cleared via 'x'.");
                // If we were in search mode, reset to homepage
                if (currentViewMode === 'search') {
                    resetToHomepage();
                } else {
                    // If already on homepage, just ensure state is clear
                    currentState.searchTerm = '';
                    saveStateToLocalStorage();
                }
            }
        }, 50); // Small delay
    }

    function showLoadingStateInTables(message = 'Loading...') {
        const loadingHTML = `<tr><td colspan="6" class="loading-message" role="status" aria-live="polite"><div class="spinner"></div>${sanitize(message)}</td></tr>`;
        Object.values(tabMappings).forEach(mapping => {
            if (mapping?.tableBody) {
                mapping.tableBody.innerHTML = loadingHTML;
            }
            if (mapping?.pagination) {
                mapping.pagination.style.display = 'none'; // Hide pagination during load
            }
        });
    }

    // --- Updates Preview Logic (API Fetch & Display - Unchanged Logic, uses API) ---
    async function loadUpdatesPreview() {
        if (isDirectShareLoad || !updatesPreviewSection || !updatesPreviewList || !showMoreUpdatesButton) return;

        updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`;
        showMoreUpdatesButton.style.display = 'none';
        updatesPreviewShownCount = 0;
        weeklyUpdatesData = []; // Clear previous updates data

        try {
            const params = {
                sort: 'lastUpdated',
                sortDir: 'desc',
                limit: config.UPDATES_PREVIEW_INITIAL_COUNT, // Fetch initial count
                page: 1
            };
            const data = await fetchApiData(params); // Use the main API fetch function

            if (data && data.items && data.items.length > 0) {
                weeklyUpdatesData = data.items.map(preprocessMovieData);
                displayInitialUpdates();
                console.log(`Loaded initial ${weeklyUpdatesData.length} updates. Total pages from API: ${data.totalPages}`);
            } else {
                updatesPreviewList.innerHTML = '<div class="status-message" style="text-align:center; padding: 15px 0;">No recent updates found.</div>';
                showMoreUpdatesButton.style.display = 'none';
            }
        } catch (error) {
            console.error("Failed to load updates preview:", error);
            updatesPreviewList.innerHTML = `<div class="error-message" style="text-align:center; padding: 15px 0;">Could not load updates. ${error.message}</div>`;
            showMoreUpdatesButton.style.display = 'none';
        }
    }
    function displayInitialUpdates() {
        if (!updatesPreviewList || !showMoreUpdatesButton) return;
        updatesPreviewList.innerHTML = '';
        updatesPreviewShownCount = 0;
        closeActiveActionRow('preview', null);

        if (weeklyUpdatesData.length === 0) {
            updatesPreviewList.innerHTML = '<div class="status-message" style="text-align:center; padding: 15px 0;">No recent updates found.</div>';
            showMoreUpdatesButton.style.display = 'none';
            return;
        }

        const initialCount = Math.min(weeklyUpdatesData.length, config.UPDATES_PREVIEW_INITIAL_COUNT);
        appendUpdatesToPreview(0, initialCount);
        updatesPreviewShownCount = initialCount;

        // Check if potentially more items exist based on whether we loaded a full page
        const potentiallyMore = weeklyUpdatesData.length >= config.UPDATES_PREVIEW_INITIAL_COUNT;

        if (potentiallyMore) {
            showMoreUpdatesButton.style.display = 'block';
            showMoreUpdatesButton.disabled = false;
            showMoreUpdatesButton.textContent = "Show More";
        } else {
            showMoreUpdatesButton.style.display = 'none';
        }
    }
    window.appendMoreUpdates = async function() {
        if (!updatesPreviewList || !showMoreUpdatesButton) return;

        showMoreUpdatesButton.disabled = true;
        showMoreUpdatesButton.textContent = "Loading...";

        // Calculate next page based on total items already in the master list
        const currentPage = Math.floor(weeklyUpdatesData.length / config.UPDATES_PREVIEW_LOAD_MORE_COUNT);
        const nextPage = currentPage + 1;
        console.log(`Attempting to load page ${nextPage} for updates preview.`);

        try {
            const params = {
                sort: 'lastUpdated',
                sortDir: 'desc',
                limit: config.UPDATES_PREVIEW_LOAD_MORE_COUNT, // Use LOAD_MORE count
                page: nextPage
            };
            const data = await fetchApiData(params); // Use main API fetch

            if (data && data.items && data.items.length > 0) {
                const newItems = data.items.map(preprocessMovieData);
                const startIndex = weeklyUpdatesData.length;
                weeklyUpdatesData.push(...newItems);
                appendUpdatesToPreview(startIndex, weeklyUpdatesData.length);
                updatesPreviewShownCount = weeklyUpdatesData.length;

                console.log(`Loaded ${newItems.length} more updates. Total now: ${updatesPreviewShownCount}. Current API page: ${data.page}, Total API pages: ${data.totalPages}`);

                if (data.page >= data.totalPages) {
                    showMoreUpdatesButton.textContent = "All Updates Shown";
                    // Optional: Hide after delay
                    // setTimeout(() => { showMoreUpdatesButton.style.display = 'none'; }, 2000);
                } else {
                    showMoreUpdatesButton.disabled = false;
                    showMoreUpdatesButton.textContent = "Show More";
                }
            } else {
                console.log("No more updates found from API.");
                showMoreUpdatesButton.textContent = "No More Updates";
                 // Optional: Hide after delay
                // setTimeout(() => { showMoreUpdatesButton.style.display = 'none'; }, 2000);
            }
        } catch (error) {
            console.error("Failed to load more updates:", error);
            showMoreUpdatesButton.textContent = "Error Loading";
            showMoreUpdatesButton.disabled = false; // Re-enable
        }
    }
    function appendUpdatesToPreview(startIndex, endIndex) {
        if (!updatesPreviewList) return;
        const fragment = document.createDocumentFragment();
        const itemsToAppend = weeklyUpdatesData.slice(startIndex, endIndex);

        itemsToAppend.forEach((movie, indexInSlice) => {
            const overallIndex = startIndex + indexInSlice;
            if (!movie) return;
            const itemDiv = document.createElement('div');
            itemDiv.className = 'update-item';
            const uniqueIdPart = movie.id ? String(movie.id).replace(/[^a-zA-Z0-9-_]/g, '') : `gen-${overallIndex}`;
            const actionRowId = `preview-actions-${uniqueIdPart}-${overallIndex}`;
            itemDiv.dataset.index = overallIndex;
            itemDiv.dataset.actionRowId = actionRowId;

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
                <div class="preview-col-filename" title="${movie.displayFilename}">
                    ${sanitize(movie.displayFilename)}${fourkLogoHtml}${hdrLogoHtml}
                </div>
                <div class="preview-col-date" title="${formattedDateFull}">
                    ${formattedDateRelative}
                </div>
                <div class="preview-col-view">
                    <button class="button view-button" aria-expanded="false">View</button>
                </div>
            `;
            fragment.appendChild(itemDiv);

            const actionRowDiv = document.createElement('div');
            actionRowDiv.id = actionRowId;
            actionRowDiv.className = 'preview-action-row';
            actionRowDiv.style.display = 'none';
            fragment.appendChild(actionRowDiv);
        });

        const initialLoader = updatesPreviewList.querySelector('.loading-inline-spinner');
        if (initialLoader && startIndex === 0) { initialLoader.remove(); }
        updatesPreviewList.appendChild(fragment);
    }

    // --- Filtering, Sorting (Trigger API Fetch) ---
    function triggerFilterChange() {
        if (!qualityFilterSelect || currentViewMode !== 'search') return;
        const newQualityFilter = qualityFilterSelect.value;

        if (newQualityFilter !== currentState.qualityFilter) {
            currentState.qualityFilter = newQualityFilter;
            currentState.currentPage = 1; // Reset page when filter changes
            closePlayerIfNeeded(null);
            showLoadingStateInTables(`Applying filter: ${sanitize(newQualityFilter || 'All Qualities')}...`);
            fetchAndRenderResults(); // Refetch data with new filter
        }
    }
    function handleSort(event) {
        const header = event.target.closest('th.sortable');
        if (!header || currentViewMode !== 'search') return;
        const sortKey = header.dataset.sortKey;
        if (!sortKey) return;

        const oldSortColumn = currentState.sortColumn;
        const oldSortDirection = currentState.sortDirection;

        if (currentState.sortColumn === sortKey) {
            // Toggle direction if same column clicked
            currentState.sortDirection = currentState.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            // Set new column and default direction
            currentState.sortColumn = sortKey;
            // Default direction based on column type (adjust as needed)
            currentState.sortDirection = ['filename', 'quality'].includes(sortKey) ? 'asc' : 'desc';
        }

        // Only refetch if sort actually changed
        if (oldSortColumn !== currentState.sortColumn || oldSortDirection !== currentState.sortDirection) {
            currentState.currentPage = 1; // Reset page when sort changes
            closePlayerIfNeeded(null);
            showLoadingStateInTables(`Sorting by ${sanitize(sortKey)} (${currentState.sortDirection})...`);
            fetchAndRenderResults(); // Refetch data with new sort
        }
    }

    // --- Rendering Logic (Uses API response, uses DocumentFragment) ---
    function renderActiveResultsView(apiResponse) {
        if (currentViewMode !== 'search' || !tabMappings[activeResultsTab]) {
            if (currentViewMode === 'search') {
                showLoadingStateInTables('Enter search term above.'); // Show default message if somehow called in search mode without a tab
            }
            return;
        }
        console.log(`Rendering results for tab: ${activeResultsTab}`, apiResponse);
        console.time("renderActiveResultsView");

        const { tableBody, pagination, tableHead } = tabMappings[activeResultsTab];
        if (!tableBody || !pagination) {
            console.error("Missing table body or pagination controls for tab:", activeResultsTab);
            console.timeEnd("renderActiveResultsView");
            return;
        }

        const itemsFromApi = apiResponse.items || [];
        const totalItems = apiResponse.totalItems || 0;
        const currentPage = apiResponse.page || 1;
        const totalPages = apiResponse.totalPages || 1;

        // Process data for the current view
        currentViewData = itemsFromApi.map(preprocessMovieData);

        const fragment = document.createDocumentFragment(); // Use DocumentFragment

        if (totalItems === 0) {
            let message = `No ${tabMappings[activeResultsTab].typeFilter || 'files'} found`;
            if (currentState.searchTerm) message += ` matching "${sanitize(currentState.searchTerm)}"`;
            if (currentState.qualityFilter) message += ` with quality "${sanitize(currentState.qualityFilter)}"`;
            message += '.';
            const noResultsRow = document.createElement('tr');
            noResultsRow.innerHTML = `<td colspan="6" class="status-message">${message}</td>`;
            fragment.appendChild(noResultsRow);
        } else {
            currentViewData.forEach((movie, indexOnPage) => {
                const uniqueIdPart = movie.id ? String(movie.id).replace(/[^a-zA-Z0-9-_]/g, '') : `gen-${indexOnPage}`;
                const actionRowId = `${activeResultsTab}-actions-${uniqueIdPart}-${indexOnPage}`;
                const rowHTML = createMovieTableRowHTML(movie, indexOnPage, actionRowId);

                // Create elements from HTML string and append to fragment
                const tempDiv = document.createElement('tbody'); // Use tbody as temporary container
                tempDiv.innerHTML = rowHTML.trim();
                while (tempDiv.firstChild) {
                    fragment.appendChild(tempDiv.firstChild); // Append the actual TR
                }
            });
        }

        tableBody.innerHTML = ''; // Clear table body ONCE
        tableBody.appendChild(fragment); // Append all rows at once

        renderPaginationControls(pagination, totalItems, currentPage, totalPages);
        updateActiveTabAndPanel(); // Ensure correct tab/panel is active
        if (tableHead) updateSortIndicators(tableHead);
        updateFilterIndicator();
        closeActiveActionRow('table', null); // Close any action row from previous view

        console.timeEnd("renderActiveResultsView");
    }
    function renderPaginationControls(targetContainer, totalItems, currentPage, totalPages) { if (!targetContainer) return; if (totalItems === 0 || totalPages <= 1) { targetContainer.innerHTML = ''; targetContainer.style.display = 'none'; return; } targetContainer.dataset.totalPages = totalPages; targetContainer.innerHTML = ''; let paginationHTML = ''; const maxPagesToShow = 5; const halfPages = Math.floor(maxPagesToShow / 2); paginationHTML += `<button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled title="First page"' : 'title="Previous page"'}>« Prev</button>`; let startPage, endPage; if (totalPages <= maxPagesToShow + 2) { startPage = 1; endPage = totalPages; } else { startPage = Math.max(2, currentPage - halfPages); endPage = Math.min(totalPages - 1, currentPage + halfPages); if (currentPage - halfPages < 2) { endPage = Math.min(totalPages - 1, maxPagesToShow); } if (currentPage + halfPages > totalPages - 1) { startPage = Math.max(2, totalPages - maxPagesToShow + 1); } } if (startPage > 1) { paginationHTML += `<button onclick="changePage(1)" title="Page 1">1</button>`; if (startPage > 2) { paginationHTML += `<span class="page-info" title="Skipped pages">...</span>`; } } for (let i = startPage; i <= endPage; i++) { paginationHTML += (i === currentPage) ? `<span class="current-page">${i}</span>` : `<button onclick="changePage(${i})" title="Page ${i}">${i}</button>`; } if (endPage < totalPages) { if (endPage < totalPages - 1) { paginationHTML += `<span class="page-info" title="Skipped pages">...</span>`; } paginationHTML += `<button onclick="changePage(${totalPages})" title="Page ${totalPages}">${totalPages}</button>`; } paginationHTML += `<button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled title="Last page"' : 'title="Next page"'}>Next »</button>`; targetContainer.innerHTML = paginationHTML; targetContainer.style.display = 'block'; }
    function updateSortIndicators(tableHeadElement) { if (!tableHeadElement) return; tableHeadElement.querySelectorAll('th.sortable').forEach(th => { th.classList.remove('sort-asc', 'sort-desc'); const sortKey = th.dataset.sortKey; if (sortKey === currentState.sortColumn) { const directionClass = currentState.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc'; th.classList.add(directionClass); th.setAttribute('aria-sort', currentState.sortDirection === 'asc' ? 'ascending' : 'descending'); } else { th.removeAttribute('aria-sort'); } }); }
    function updateFilterIndicator() { if(qualityFilterSelect) { qualityFilterSelect.classList.toggle('filter-active', !!currentState.qualityFilter); } }
    function updateActiveTabAndPanel() { Object.keys(tabMappings).forEach(tabId => { const mapping = tabMappings[tabId]; const isActive = tabId === activeResultsTab; if (mapping?.button) mapping.button.classList.toggle('active', isActive); if (mapping?.panel) mapping.panel.classList.toggle('active', isActive); }); }

    // --- Pagination and Tab Switching (Trigger API Fetch) ---
    window.changePage = function(newPage) {
        if (currentViewMode !== 'search' || newPage < 1 || newPage === currentState.currentPage) {
            return; // Do nothing if not applicable
        }
        // Check against total pages if available
        const currentPagination = tabMappings[activeResultsTab]?.pagination;
        if(currentPagination && currentPagination.dataset.totalPages) {
            const totalP = parseInt(currentPagination.dataset.totalPages, 10);
            if(newPage > totalP) {
                console.log(`Change page request to ${newPage} denied, exceeds total pages (${totalP}).`);
                return;
            }
        }

        currentState.currentPage = newPage;
        closePlayerIfNeeded(null); // Close player if open
        fetchAndRenderResults().then(() => {
            // Scroll to top of results after page loads
            const activeTableBody = tabMappings[activeResultsTab]?.tableBody;
            scrollToTopOfActiveTable(activeTableBody);
        });
        saveStateToLocalStorage(); // Save state (though page number isn't saved)
    }
    function scrollToTopOfActiveTable(tableBodyElement) { if (!tableBodyElement) return; const tableContainer = tableBodyElement.closest('.table-container'); if (tableContainer) { const searchBarArea = container.querySelector('#search-focus-area'); const backButtonElem = resultsArea.querySelector('#backToHomeButtonResults'); const filterArea = resultsArea.querySelector('.results-filter-area'); const tabNav = resultsArea.querySelector('.tab-navigation'); let stickyHeaderHeight = 0; if (container.classList.contains('results-active')) { stickyHeaderHeight = (searchBarArea?.offsetHeight || 0) + (backButtonElem?.offsetHeight || 0) + (backButtonElem ? parseFloat(getComputedStyle(backButtonElem).marginBottom) : 0) + (filterArea?.offsetHeight || 0) + (tabNav?.offsetHeight || 0); } const elementTop = tableContainer.getBoundingClientRect().top + window.pageYOffset; const scrollPosition = elementTop - stickyHeaderHeight - 20; window.scrollTo({ top: scrollPosition, behavior: 'smooth' }); } }
    window.switchTab = function(tabId) {
        if (currentViewMode !== 'search' || tabId === activeResultsTab || !tabMappings[tabId]) {
            return; // Do nothing if not applicable
        }

        activeResultsTab = tabId;
        currentState.currentPage = 1; // Reset page when tab changes
        currentState.typeFilter = tabMappings[tabId].typeFilter; // Set type filter for the new tab

        closePlayerIfNeeded(null);
        closeActiveActionRow('table', null); // Close action row if open
        updateActiveTabAndPanel(); // Visually switch tab
        showLoadingStateInTables(`Loading ${tabMappings[tabId].typeFilter || 'all files'}...`);
        fetchAndRenderResults(); // Fetch data for the new tab
        saveStateToLocalStorage(); // Save state (though tab isn't saved by default)
    }

    // --- Action Row Logic (Uses currentViewData or weeklyUpdatesData) ---
    function closeActiveActionRow(type = 'any', elementToFocusAfter = null) { let rowToClose = null; let mainElement = null; let buttonElement = null; if ((type === 'table' || type === 'any') && activeTableActionRow) { rowToClose = activeTableActionRow; mainElement = rowToClose.previousElementSibling; if (mainElement) buttonElement = mainElement.querySelector('.view-button'); activeTableActionRow = null; } else if ((type === 'preview' || type === 'any') && activePreviewActionRow) { rowToClose = activePreviewActionRow; mainElement = rowToClose.previousElementSibling; if (mainElement) buttonElement = mainElement.querySelector('.view-button'); activePreviewActionRow = null; } if (rowToClose && rowToClose.style.display !== 'none') { const isPlayerInside = videoContainer?.parentElement === rowToClose || (rowToClose.matches('tr.action-row') && videoContainer?.parentElement === rowToClose.querySelector('td')) || (rowToClose.matches('.preview-action-row') && videoContainer?.parentElement === rowToClose); if (isPlayerInside) { closePlayer(elementToFocusAfter || buttonElement || mainElement); } rowToClose.style.display = 'none'; if (mainElement) mainElement.classList.remove('active-main-row'); if (buttonElement) { buttonElement.textContent = 'View'; buttonElement.setAttribute('aria-expanded', 'false'); } if (rowToClose.classList.contains('preview-action-row')) { rowToClose.innerHTML = ''; } else if (rowToClose.matches('tr.action-row')) { if (rowToClose.parentElement) { try { rowToClose.remove(); } catch(e){ console.warn("Error removing action row:", e)} } } if (!isPlayerInside && elementToFocusAfter && typeof elementToFocusAfter.focus === 'function') { setTimeout(() => elementToFocusAfter.focus(), 50); } } }
    function toggleTableActions(mainRowElement, triggerElement = null) { if (!mainRowElement || !mainRowElement.matches('.movie-data-row')) return; const targetRowId = mainRowElement.dataset.actionRowId; const dataIndex = parseInt(mainRowElement.dataset.index, 10); if (!targetRowId || isNaN(dataIndex) || dataIndex < 0 || dataIndex >= currentViewData.length) { console.error("Invalid data attributes or index on table row:", mainRowElement, dataIndex, currentViewData.length); return; } const buttonElement = mainRowElement.querySelector('.view-button'); if (!buttonElement) { console.error("Could not find view button in row:", mainRowElement); return; } const isCurrentlyAssociatedActiveRow = activeTableActionRow && activeTableActionRow.id === targetRowId; const elementToFocusAfterClose = triggerElement || buttonElement; if (!isCurrentlyAssociatedActiveRow) { closePlayerIfNeeded(elementToFocusAfterClose); closeActiveActionRow('any', elementToFocusAfterClose); } if (isCurrentlyAssociatedActiveRow) { closeActiveActionRow('table', elementToFocusAfterClose); } else { const movie = currentViewData[dataIndex]; if (!movie) { console.error("Movie data not found for index:", dataIndex); return; } let targetRow = document.getElementById(targetRowId); const actionHTML = createActionContentHTML(movie); const colspanValue = mainRowElement.cells.length || 6; if (!targetRow) { targetRow = document.createElement('tr'); targetRow.id = targetRowId; targetRow.className = 'action-row'; targetRow.innerHTML = `<td colspan="${colspanValue}">${actionHTML}</td>`; mainRowElement.parentNode.insertBefore(targetRow, mainRowElement.nextSibling); } else { targetRow.innerHTML = `<td colspan="${colspanValue}">${actionHTML}</td>`; } targetRow.style.display = 'table-row'; buttonElement.textContent = 'Hide'; buttonElement.setAttribute('aria-expanded', 'true'); mainRowElement.classList.add('active-main-row'); activeTableActionRow = targetRow; focusFirstElementInContainer(targetRow); scrollToRowIfNeeded(mainRowElement); } }
    function togglePreviewActions(mainItemDiv, triggerElement = null) { if (!mainItemDiv || !mainItemDiv.matches('.update-item')) return; const movieIndex = parseInt(mainItemDiv.dataset.index, 10); const targetRowId = mainItemDiv.dataset.actionRowId; if (isNaN(movieIndex) || !targetRowId || movieIndex < 0 || movieIndex >= weeklyUpdatesData.length) { console.error("Invalid data attributes or index on preview item.", mainItemDiv, movieIndex, weeklyUpdatesData.length); return; } const targetRowDiv = document.getElementById(targetRowId); const buttonElement = mainItemDiv.querySelector('.view-button'); if (!targetRowDiv || !buttonElement) { console.error("Target action div or button not found.", targetRowId); return; } const isCurrentlyAssociatedActiveRow = activePreviewActionRow && activePreviewActionRow.id === targetRowId; const elementToFocusAfterClose = triggerElement || buttonElement; if (!isCurrentlyAssociatedActiveRow) { closePlayerIfNeeded(elementToFocusAfterClose); closeActiveActionRow('any', elementToFocusAfterClose); } if (isCurrentlyAssociatedActiveRow) { closeActiveActionRow('preview', elementToFocusAfterClose); } else { const movie = weeklyUpdatesData[movieIndex]; if (!movie) { console.error("Movie data not found for preview index:", movieIndex); return; } const actionContentHTML = createActionContentHTML(movie); targetRowDiv.innerHTML = actionContentHTML; targetRowDiv.style.display = 'block'; buttonElement.textContent = 'Hide'; buttonElement.setAttribute('aria-expanded', 'true'); mainItemDiv.classList.add('active-main-row'); activePreviewActionRow = targetRowDiv; focusFirstElementInContainer(targetRowDiv); scrollToRowIfNeeded(mainItemDiv); } }
    function scrollToRowIfNeeded(mainElement) { setTimeout(() => { mainElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 100); }
    function focusFirstElementInContainer(containerElement) { if (!containerElement) return; const firstFocusable = containerElement.querySelector('button, a[href]'); if (firstFocusable) { setTimeout(() => firstFocusable.focus(), 50); } }

    // --- Share Logic (Unchanged) ---
    async function handleShareClick(buttonElement) { const itemId = buttonElement.dataset.id; const itemTitle = buttonElement.dataset.title || "Cinema Ghar Item"; const itemFilename = buttonElement.dataset.filename || ""; if (!itemId) { console.error("Share failed: Item ID missing."); alert("Cannot share this item (missing ID)."); return; } const shareUrl = `${window.location.origin}${window.location.pathname}?shareId=${encodeURIComponent(itemId)}`; const shareText = `Check out: ${itemTitle}\n${itemFilename ? `(${itemFilename})\n` : ''}`; const feedbackSpan = buttonElement.nextElementSibling; if (!feedbackSpan || !feedbackSpan.classList.contains('copy-feedback')) { console.warn("Share fallback feedback span not found next to button:", buttonElement); } if (navigator.share) { try { await navigator.share({ title: itemTitle, text: shareText, url: shareUrl, }); console.log('Successful share'); } catch (error) { console.error('Error sharing:', error); if (error.name !== 'AbortError') { if (feedbackSpan) { showCopyFeedback(feedbackSpan, 'Share failed!', true); } else { alert(`Share failed: ${error.message}`); } } } } else { console.log('Web Share API not supported, falling back to copy.'); await copyToClipboard(shareUrl, feedbackSpan); } }

    // --- Shared Item Display Logic (Fetches via API - Unchanged) ---
    async function displaySharedItem(shareId) { if (!shareId || !sharedItemView || !sharedItemContent) return; sharedItemContent.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading shared item...</span></div>`; setViewMode('shared'); try { const params = { id: shareId }; const data = await fetchApiData(params); if (data && data.items && data.items.length > 0) { const sharedMovieRaw = data.items[0]; const sharedMovie = preprocessMovieData(sharedMovieRaw); console.log("Displaying shared item:", sharedMovie.displayFilename); const actionHTML = createActionContentHTML(sharedMovie); sharedItemContent.innerHTML = actionHTML; document.title = `${sharedMovie.displayFilename || 'Shared Item'} - Cinema Ghar`; if (videoContainer) videoContainer.style.display = 'none'; } else { console.error("Shared item not found via API for ID:", shareId); sharedItemContent.innerHTML = `<div class="error-message" role="alert">Error: Shared item with ID ${sanitize(shareId)} was not found. It might have been removed or the link is incorrect.</div>`; document.title = "Item Not Found - Cinema Ghar Index"; } } catch (error) { console.error("Failed to fetch shared item:", error); sharedItemContent.innerHTML = `<div class="error-message" role="alert">Error loading shared item: ${error.message}. Please try again.</div>`; document.title = "Error Loading Item - Cinema Ghar Index"; } finally { setViewMode('shared'); window.scrollTo({ top: 0, behavior: 'smooth' }); } }

    // --- Player Logic (Unchanged) ---
    function streamVideo(title, url, filenameForAudioCheck) { let currentActionContainer = null; if (currentViewMode === 'shared' && sharedItemContent) { currentActionContainer = sharedItemContent; } else { const currentActiveRow = activeTableActionRow || activePreviewActionRow; if (!currentActiveRow) { console.error("Cannot stream: active action row/div missing."); return; } currentActionContainer = currentActiveRow.matches('tr.action-row') ? currentActiveRow.querySelector('td') : currentActiveRow.matches('.preview-action-row') ? currentActiveRow : null; } if (!videoContainer || !videoElement || !currentActionContainer) { console.error("Cannot stream: player, video element, or action container missing.", { videoContainer, videoElement, currentActionContainer }); return; } if (videoContainer.parentElement !== currentActionContainer) { console.log("Moving video container to active container."); if (videoElement && videoElement.hasAttribute('src')) { videoElement.pause(); videoElement.removeAttribute('src'); videoElement.currentTime = 0; try { videoElement.load(); } catch(e){console.warn("Error on video.load() when moving:", e)} } if (vlcBox) vlcBox.style.display = 'none'; if (audioWarningDiv) audioWarningDiv.style.display = 'none'; if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; } clearCopyFeedback(); currentActionContainer.appendChild(videoContainer); } if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; } if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; } clearCopyFeedback(); const savedVolume = localStorage.getItem(config.PLAYER_VOLUME_KEY); const savedSpeed = localStorage.getItem(config.PLAYER_SPEED_KEY); videoElement.volume = (savedVolume !== null) ? Math.max(0, Math.min(1, parseFloat(savedVolume))) : 1; if (volumeSlider) volumeSlider.value = videoElement.volume; videoElement.muted = (videoElement.volume === 0); videoElement.playbackRate = (savedSpeed !== null) ? parseFloat(savedSpeed) : 1; if(playbackSpeedSelect) playbackSpeedSelect.value = String(videoElement.playbackRate); updateMuteButton(); videoElement.currentTime = 0; const ddp51Regex = /\bDDP?([ ._-]?5\.1)?\b/i; const advancedAudioRegex = /\b(DTS|ATMOS|TrueHD)\b/i; const multiAudioHintRegex = /\b(Multi|Dual)[ ._-]?Audio\b/i; let warningText = ""; if (filenameForAudioCheck) { const lowerFilename = (filenameForAudioCheck || '').toLowerCase(); if (ddp51Regex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DDP audio might not work in browser. Use 'Copy URL' or 'Open Externally'."; } else if (advancedAudioRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DTS/Atmos/TrueHD audio likely unsupported. Use external player."; } else if (multiAudioHintRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> May contain multiple audio tracks. Use selector below or external player."; } } if (warningText && audioWarningDiv) { audioWarningDiv.innerHTML = warningText; audioWarningDiv.style.display = 'block'; } if (videoTitle) videoTitle.innerText = title; if (vlcText) vlcText.innerText = url; if (vlcBox) vlcBox.style.display = 'block'; videoElement.src = url; try { videoElement.load(); } catch(e){console.warn("Error on video.load() when streaming:", e)} videoElement.play().catch(e => { console.log("Autoplay was prevented or failed:", e.message); }); videoContainer.style.display = 'flex'; const closeButton = videoContainer.querySelector('.close-btn'); if (closeButton) { setTimeout(() => closeButton.focus(), 100); } setTimeout(() => { videoContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150); }
    window.closePlayer = function(elementToFocusAfter = null) { if (elementToFocusAfter instanceof Event) { elementToFocusAfter = elementToFocusAfter?.target; } if (!videoContainer || !videoElement) return; const wasPlaying = videoContainer.style.display !== 'none'; const parentContainer = videoContainer.parentElement; try { const fsElement = document.fullscreenElement || document.webkitFullscreenElement; if (fsElement && (fsElement === videoElement || fsElement === videoContainer)) { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } } catch(err) { console.error("Error exiting fullscreen:", err); } videoElement.pause(); videoElement.removeAttribute('src'); videoElement.currentTime = 0; try { videoElement.load(); } catch(e){console.warn("Error on video.load() when closing:", e)} videoContainer.style.display = 'none'; if (vlcBox) vlcBox.style.display = 'none'; if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; } if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; } clearCopyFeedback(); if (videoTitle) videoTitle.innerText = ''; if (videoContainer.classList.contains('is-fullscreen')) { videoContainer.classList.remove('is-fullscreen'); } const mainBodyContainer = document.getElementById('cinemaghar-container'); if (mainBodyContainer && videoContainer.parentElement !== mainBodyContainer) { mainBodyContainer.appendChild(videoContainer); console.log("Moved video player back to main container."); } else if (!mainBodyContainer) { console.warn("Main container #cinemaghar-container not found, cannot move player back."); } if (wasPlaying && parentContainer?.closest('.action-row, .preview-action-row')) { const parentActionRow = parentContainer.closest('.action-row, .preview-action-row'); if (parentActionRow) { const mainElement = parentActionRow.previousElementSibling; if (mainElement) { const viewButton = mainElement.querySelector('.view-button'); if (viewButton && viewButton.getAttribute('aria-expanded') === 'true') { viewButton.textContent = 'View'; viewButton.setAttribute('aria-expanded', 'false'); } mainElement.classList.remove('active-main-row'); } if (parentActionRow.style.display !== 'none') { parentActionRow.style.display = 'none'; if (parentActionRow.classList.contains('preview-action-row')) { parentActionRow.innerHTML = ''; } } } } else if (wasPlaying && currentViewMode === 'shared') { console.log("Closed player within shared view."); } let finalFocusTarget = elementToFocusAfter || lastFocusedElement; const closedRowId = parentContainer?.closest('.action-row, .preview-action-row')?.id; if (activeTableActionRow?.id === closedRowId || activePreviewActionRow?.id === closedRowId) { finalFocusTarget = null; } if (finalFocusTarget && typeof finalFocusTarget.focus === 'function') { console.log("Returning focus to:", finalFocusTarget); setTimeout(() => finalFocusTarget.focus(), 50); } lastFocusedElement = null; if (activeTableActionRow && activeTableActionRow.id === closedRowId) { activeTableActionRow = null; } if (activePreviewActionRow && activePreviewActionRow.id === closedRowId) { activePreviewActionRow = null; } }
    function closePlayerIfNeeded(elementToFocusAfter = null) { if (videoContainer?.style.display === 'flex' || videoContainer?.style.display === 'block') { closePlayer(elementToFocusAfter); } }
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
    function highlightVlcText() { const activeContext = activeTableActionRow || activePreviewActionRow || (currentViewMode === 'shared' ? sharedItemContent : null); if (!activeContext) return; const currentVlcText = activeContext.querySelector('#vlcBox code'); if (currentVlcText && currentVlcText.closest('#vlcBox')?.style.display !== 'none') { try { const range = document.createRange(); range.selectNodeContents(currentVlcText); const selection = window.getSelection(); if (selection) { selection.removeAllRanges(); selection.addRange(range); } console.log("Highlighted VLC text as fallback."); } catch (selectErr) { console.warn("Could not highlight VLC text:", selectErr); } } }
    function handlePlayerKeyboardShortcuts(event) { if (!videoContainer || videoContainer.style.display !== 'flex' || !videoElement) return; const targetTagName = event.target.tagName.toLowerCase(); if (targetTagName === 'input' || targetTagName === 'select' || targetTagName === 'textarea') return; const key = event.key; let prevented = false; switch (key) { case ' ': case 'k': togglePlayPause(); prevented = true; break; case 'ArrowLeft': seekVideo(-10); prevented = true; break; case 'ArrowRight': seekVideo(10); prevented = true; break; case 'ArrowUp': setVolume(Math.min(videoElement.volume + 0.05, 1)); if(volumeSlider) volumeSlider.value = videoElement.volume; prevented = true; break; case 'ArrowDown': setVolume(Math.max(videoElement.volume - 0.05, 0)); if(volumeSlider) volumeSlider.value = videoElement.volume; prevented = true; break; case 'm': toggleMute(); prevented = true; break; case 'f': toggleFullscreen(); prevented = true; break; } if (prevented) event.preventDefault(); }

    // --- State Persistence (Unchanged) ---
    function saveStateToLocalStorage() { try { const stateToSave = {}; if (currentState.sortColumn !== 'lastUpdated') stateToSave.sortColumn = currentState.sortColumn; if (currentState.sortDirection !== 'desc') stateToSave.sortDirection = currentState.sortDirection; if (currentState.qualityFilter !== '') stateToSave.qualityFilter = currentState.qualityFilter; /* Don't save page or search term */ if (Object.keys(stateToSave).length > 0) { localStorage.setItem(config.LOCAL_STORAGE_KEY, JSON.stringify(stateToSave)); console.log("Saved state:", stateToSave); } else { localStorage.removeItem(config.LOCAL_STORAGE_KEY); console.log("State is default, removed saved state."); } } catch (e) { console.error("Failed to save state to localStorage:", e); } }
    function loadStateFromLocalStorage() { try { const savedState = localStorage.getItem(config.LOCAL_STORAGE_KEY); if (savedState) { const parsedState = JSON.parse(savedState); currentState.sortColumn = typeof parsedState.sortColumn === 'string' ? parsedState.sortColumn : 'lastUpdated'; currentState.sortDirection = (typeof parsedState.sortDirection === 'string' && ['asc', 'desc'].includes(parsedState.sortDirection)) ? parsedState.sortDirection : 'desc'; currentState.qualityFilter = typeof parsedState.qualityFilter === 'string' ? parsedState.qualityFilter : ''; console.log("Loaded state:", { sortColumn: currentState.sortColumn, sortDirection: currentState.sortDirection, qualityFilter: currentState.qualityFilter }); } else { currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc'; currentState.qualityFilter = ''; console.log("No saved state found, using defaults."); } } catch (e) { console.error("Failed to load or parse state from localStorage:", e); localStorage.removeItem(config.LOCAL_STORAGE_KEY); currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc'; currentState.qualityFilter = ''; } currentState.searchTerm = ''; currentState.currentPage = 1; currentState.typeFilter = ''; activeResultsTab = 'allFiles'; activeTableActionRow = null; activePreviewActionRow = null; lastFocusedElement = null; }

    // --- API Data Fetching (Centralized Function) ---
    async function fetchApiData(params = {}, signal = null) {
        // Use external signal if provided, otherwise use the main search controller
        let internalController = false;
        let effectiveSignal = signal;

        if (!effectiveSignal) {
             // Abort previous *main search* if a new one starts
            if (searchAbortController) {
                searchAbortController.abort();
            }
            searchAbortController = new AbortController();
            effectiveSignal = searchAbortController.signal;
            internalController = true; // Mark that we created this controller
        }

        const query = new URLSearchParams();

        // Add mode if specified (e.g., 'suggestions', 'qualities')
        if (params.mode) {
            query.set('mode', params.mode);
        }
        // Add suggestion term if specified
        if (params.term) {
            query.set('term', params.term);
        }

        // Add standard search/filter/sort/page params unless overridden or mode is special
        if (!params.mode || params.mode === 'updates') { // Add standard params for default or updates mode
            query.set('page', params.page || currentState.currentPage);
            query.set('limit', params.limit || currentState.limit);
            query.set('sort', params.sort || currentState.sortColumn);
            query.set('sortDir', params.sortDir || currentState.sortDirection);

            // Use searchTerm from params if provided (e.g., for direct search), else use global state
            const searchTerm = params.search !== undefined ? params.search : currentState.searchTerm;
            if (searchTerm) query.set('search', searchTerm);

            const qualityFilter = params.quality !== undefined ? params.quality : currentState.qualityFilter;
            if (qualityFilter) query.set('quality', qualityFilter);

            const typeFilter = params.type !== undefined ? params.type : currentState.typeFilter;
            if (typeFilter) query.set('type', typeFilter);
        }

        // Handle single item fetch by ID (overrides most other params)
        if (params.id) {
            query.set('id', params.id);
            // Remove potentially conflicting params for ID fetch
            ['search', 'quality', 'type', 'page', 'limit', 'sort', 'sortDir', 'mode', 'term'].forEach(p => query.delete(p));
        }

        const url = `${config.MOVIE_DATA_API_URL}?${query.toString()}`;
        console.log(`Fetching API: ${url}`);

        try {
            const response = await fetch(url, { signal: effectiveSignal });

            if (effectiveSignal.aborted) {
                throw new DOMException('Fetch aborted', 'AbortError'); // Simulate AbortError if cancelled during await
            }

            if (!response.ok) {
                let errorBody = null;
                try { errorBody = await response.json(); } catch (_) {}
                const errorDetails = errorBody?.error || errorBody?.details || `Status: ${response.status}`;
                throw new Error(`API Error: ${errorDetails}`);
            }

            const data = await response.json();
            console.log(`API data received for ${url}:`, data);

            // Store totalPages from response if pagination container exists
            const activePagination = tabMappings[activeResultsTab]?.pagination;
            if(activePagination && data.totalPages !== undefined) {
                activePagination.dataset.totalPages = data.totalPages;
            }
            return data; // Success

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('API fetch aborted.');
                return null; // Return null or specific indicator for aborted requests
            }
            console.error(`Error fetching data from ${url}:`, error);
            throw error; // Re-throw other errors to be handled by caller
        } finally {
            // Clear the main search controller only if it was internally created for this call
            // and the signal matches (prevent clearing if a rapid new call started)
            if (internalController && effectiveSignal === searchAbortController?.signal) {
                searchAbortController = null;
            }
        }
    }

    // Wrapper function specifically for fetching search/filter results
    async function fetchAndRenderResults() {
        if (currentViewMode !== 'search') return; // Only run in search mode

        try {
            // fetchApiData will use the current state (searchTerm, qualityFilter, etc.)
            const apiResponse = await fetchApiData();
            if (apiResponse === null) return; // Request was aborted

            renderActiveResultsView(apiResponse);
            saveStateToLocalStorage(); // Save sort/filter state after successful render
        } catch (error) {
            console.error("Failed to fetch/render search results:", error);
            const { tableBody } = tabMappings[activeResultsTab];
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="6" class="error-message">Error loading results: ${error.message}. Please try again.</td></tr>`;
            }
             // Hide pagination on error
            Object.values(tabMappings).forEach(m => { if(m.pagination) m.pagination.style.display = 'none'; });
        }
    }

    // --- Quality Filter Population (REVISED: Fetches from API) ---
    async function loadAndPopulateQualities() {
        if (!qualityFilterSelect) return;
        try {
            const data = await fetchApiData({ mode: 'qualities' });
            if (data && data.qualities) {
                populateQualityFilter(data.qualities);
            } else {
                 console.warn("No qualities received from API.");
                 populateQualityFilter([]); // Populate with empty list
            }
        } catch (error) {
            console.error("Failed to load qualities from API:", error);
            // Optionally show an error or leave the filter empty
             populateQualityFilter([]);
        }
    }

    function populateQualityFilter(qualities = []) {
        if (!qualityFilterSelect) return;
        const currentSelectedValue = currentState.qualityFilter; // Use stored state value

        // Sort qualities (optional, but nice UX)
        const sortedQualities = [...qualities].sort((a, b) => {
            const getScore = (q) => { q = String(q || '').toUpperCase().trim(); const resMatch = q.match(/^(\d{3,4})P$/); if (q === '4K' || q === '2160P') return 100; if (resMatch) return parseInt(resMatch[1], 10); if (q === '1080P') return 90; if (q === '720P') return 80; if (q === '480P') return 70; if (['WEBDL', 'BLURAY', 'BDRIP', 'BRRIP'].includes(q)) return 60; if (['WEBIP', 'HDTV', 'HDRIP'].includes(q)) return 50; if (['DVD', 'DVDRIP'].includes(q)) return 40; if (['DVDSCR', 'HC', 'HDCAM', 'TC', 'TS', 'CAM'].includes(q)) return 30; if (['HDR', 'DOLBY VISION', 'DV', 'HEVC', 'X265'].includes(q)) return 20; return 0; };
            const scoreA = getScore(a); const scoreB = getScore(b);
            if (scoreA !== scoreB) return scoreB - scoreA; // Higher score first
            return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
        });

        // Clear existing options (keep the "All Qualities" default)
        while (qualityFilterSelect.options.length > 1) {
            qualityFilterSelect.remove(1);
        }

        // Add sorted qualities
        sortedQualities.forEach(quality => {
            if (quality && quality !== 'N/A') {
                const option = document.createElement('option');
                option.value = quality;
                option.textContent = quality;
                qualityFilterSelect.appendChild(option);
            }
        });

        // Restore selection based on saved state
        qualityFilterSelect.value = [...qualityFilterSelect.options].some(opt => opt.value === currentSelectedValue)
            ? currentSelectedValue
            : ""; // If saved quality not found, default to "All"

        updateFilterIndicator(); // Update visual style
    }


    function displayLoadError(message) {
        const errorHtml = `<div class="error-container" role="alert">${sanitize(message)}</div>`;
        // Hide all main content areas
        if (searchFocusArea) searchFocusArea.style.display = 'none';
        if (resultsArea) resultsArea.style.display = 'none';
        if (updatesPreviewSection) updatesPreviewSection.style.display = 'none';
        if (sharedItemView) sharedItemView.style.display = 'none';
        if (pageFooter) pageFooter.style.display = 'none';
        // Remove state classes
        container.classList.remove('results-active', 'shared-view-active');
        // Display error message
        if (mainErrorArea) {
            mainErrorArea.innerHTML = errorHtml;
        } else if (container) {
            // Fallback: insert at top of container
            container.insertAdjacentHTML('afterbegin', errorHtml);
        }
        if (pageLoader) pageLoader.style.display = 'none'; // Ensure loader is hidden
    }

    // --- Initial Data Loading and Setup (REVISED) ---
    async function initializeApp() {
        const urlParams = new URLSearchParams(window.location.search);
        const shareId = urlParams.get('shareId');
        isDirectShareLoad = !!shareId;

        if (pageLoader) pageLoader.style.display = 'flex';

        // Setup initial view structure before fetching data
        if (isDirectShareLoad) {
            console.log("Direct share link detected for ID:", shareId);
            // Hide other views immediately
            if (searchFocusArea) searchFocusArea.style.display = 'none';
            if (resultsArea) resultsArea.style.display = 'none';
            if (updatesPreviewSection) updatesPreviewSection.style.display = 'none';
            if (pageFooter) pageFooter.style.display = 'none';
        } else {
            console.log("Preparing homepage view (pre-data).");
            if (searchFocusArea) searchFocusArea.style.display = 'flex';
            if (pageFooter) pageFooter.style.display = 'flex';
            if (resultsArea) resultsArea.style.display = 'none';
            if (sharedItemView) sharedItemView.style.display = 'none';
            // Set default messages/loaders
            const defaultMessageHTML = `<tr><td colspan="6" class="status-message">Enter search term above.</td></tr>`;
            Object.values(tabMappings).forEach(mapping => {
                if (mapping?.tableBody) mapping.tableBody.innerHTML = defaultMessageHTML;
                if (mapping?.pagination) mapping.pagination.style.display = 'none';
            });
            if (updatesPreviewList) updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`;
        }

        loadStateFromLocalStorage(); // Load saved sort/filter state

        try {
            if (shareId) {
                // Fetch shared item AND qualities in parallel
                await Promise.all([
                    displaySharedItem(shareId),
                    loadAndPopulateQualities() // Fetch qualities for potential future use if user navigates away
                ]);
            } else {
                // Fetch updates AND qualities in parallel for homepage
                await Promise.all([
                    loadUpdatesPreview(),
                    loadAndPopulateQualities()
                ]);
                // Set initial view to homepage *after* data fetches (or attempts)
                setViewMode('homepage');
            }

            // Set the filter dropdown value based on loaded state AFTER population
            if (qualityFilterSelect) {
                 qualityFilterSelect.value = currentState.qualityFilter || '';
                 updateFilterIndicator();
            }

        } catch (error) {
            // Catch errors from either displaySharedItem or the initial load promises
            console.error('FATAL: Failed during app initialization:', error);
            displayLoadError(`Error initializing app: ${error.message}. Try refreshing.`);
        } finally {
            if (pageLoader) pageLoader.style.display = 'none'; // Hide loader regardless of success/failure
        }
    }

    // --- Event Handling Setup (Largely Unchanged) ---
    function handleActionClick(event) { const target = event.target; const button = target.closest('.action-buttons-container .button'); if (button) { const action = button.dataset.action; const url = button.dataset.url; const title = button.dataset.title; const filename = button.dataset.filename; const id = button.dataset.id; lastFocusedElement = button; if (action === 'play' && url && title) { event.preventDefault(); streamVideo(title, url, filename); } else if (action === 'copy-vlc' && url) { event.preventDefault(); copyVLCLink(button, url); } else if (action === 'open-intent' && url) { event.preventDefault(); openWithIntent(url); } else if (action === 'share' && id) { event.preventDefault(); handleShareClick(button); } } }
    function handleContentClick(event) { const target = event.target; const viewButton = target.closest('.view-button'); const filenameLink = target.closest('td.col-filename, .preview-col-filename'); if (viewButton || filenameLink) { event.preventDefault(); const mainRowOrItem = target.closest('tr.movie-data-row, div.update-item'); if (mainRowOrItem) { lastFocusedElement = viewButton || filenameLink; if (mainRowOrItem.matches('tr.movie-data-row')) { toggleTableActions(mainRowOrItem, lastFocusedElement); } else if (mainRowOrItem.matches('div.update-item')) { togglePreviewActions(mainRowOrItem, lastFocusedElement); } } return; } handleActionClick(event); if (target.matches('.close-btn') && target.closest('#videoContainer')) { lastFocusedElement = target; closePlayer(lastFocusedElement); return; } }

    // Add listeners after DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
         initializeApp(); // Start the app initialization

        // --- Input & Filter Event Listeners ---
        if (searchInput) {
            searchInput.addEventListener('input', handleSearchInput);
            searchInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    handleSearchSubmit();
                } else if (event.key === 'Escape') {
                    suggestionsContainer.style.display = 'none'; // Hide suggestions on Escape
                    if(suggestionAbortController) suggestionAbortController.abort();
                }
            });
            // 'search' event fires when user clicks the 'x' in the search input
            searchInput.addEventListener('search', handleSearchClear);
            searchInput.addEventListener('blur', () => {
                // Delay hiding suggestions slightly to allow click on suggestion item
                setTimeout(() => {
                     const searchButton = document.getElementById('searchSubmitButton');
                    // Hide if focus is not on input, suggestions, or search button
                    if (document.activeElement !== searchInput &&
                        !suggestionsContainer.contains(document.activeElement) &&
                        document.activeElement !== searchButton)
                    {
                         suggestionsContainer.style.display = 'none';
                         if(suggestionAbortController) suggestionAbortController.abort();
                    }
                }, 150);
            });
        }
        if (qualityFilterSelect) {
            qualityFilterSelect.addEventListener('change', triggerFilterChange);
        }

        // --- Content Area Click Listeners (Event Delegation) ---
        if (resultsArea) {
            resultsArea.addEventListener('click', (event) => {
                if (event.target.closest('th.sortable')) {
                    handleSort(event); // Handle clicks on sortable table headers
                } else {
                    handleContentClick(event); // Handle clicks on view buttons, filenames, action buttons
                }
            });
        }
        if (updatesPreviewList) {
            updatesPreviewList.addEventListener('click', handleContentClick); // Handle clicks within updates preview
        }
        if (sharedItemView) {
            sharedItemView.addEventListener('click', handleContentClick); // Handle clicks within shared item view
        }
        if (videoContainer) {
             videoContainer.addEventListener('click', handleContentClick); // Handle clicks inside player (e.g., close button)
        }

        // --- Global Listeners ---
        document.addEventListener('keydown', handlePlayerKeyboardShortcuts); // Player shortcuts
        // Global click listener to hide suggestions if clicked outside
        document.addEventListener('click', (event) => {
             if (searchInput && suggestionsContainer && suggestionsContainer.style.display === 'block') {
                const searchWrapper = searchInput.closest('.search-input-wrapper');
                if (searchWrapper && !searchWrapper.contains(event.target)) {
                    suggestionsContainer.style.display = 'none';
                     if(suggestionAbortController) suggestionAbortController.abort();
                }
            }
            // Close player if clicked outside its logical container (more complex)
            /* if (videoContainer && videoContainer.style.display !== 'none' && !videoContainer.contains(event.target)) {
                 const logicalParent = videoContainer.parentElement?.closest('.action-row, .preview-action-row, #shared-item-content');
                 const triggerElement = logicalParent?.previousElementSibling; // The main row/item
                 // Check if the click target is outside the player AND outside its trigger row/item
                 if (!logicalParent?.contains(event.target) && !triggerElement?.contains(event.target)) {
                     console.log("Clicked outside player's logical container and trigger. Closing player.");
                     closePlayer(event.target);
                 }
            } */
        }, false);
    });

    // --- Player Event Listeners (Unchanged) ---
    if(videoElement) { videoElement.addEventListener('volumechange', () => { if (volumeSlider && Math.abs(parseFloat(volumeSlider.value) - videoElement.volume) > 0.01) { volumeSlider.value = videoElement.volume; } updateMuteButton(); try { localStorage.setItem(config.PLAYER_VOLUME_KEY, String(videoElement.volume)); } catch (e) { console.warn("LocalStorage volume save failed", e); } }); videoElement.addEventListener('ratechange', () => { if(playbackSpeedSelect && playbackSpeedSelect.value !== String(videoElement.playbackRate)) { playbackSpeedSelect.value = String(videoElement.playbackRate); } try { localStorage.setItem(config.PLAYER_SPEED_KEY, String(videoElement.playbackRate)); } catch (e) { console.warn("LocalStorage speed save failed", e); } }); videoElement.addEventListener('loadedmetadata', populateAudioTrackSelector); videoElement.removeEventListener('error', handleVideoError); /* Remove previous if script re-runs */ videoElement.addEventListener('error', handleVideoError); }
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

})(); // End of IIFE
