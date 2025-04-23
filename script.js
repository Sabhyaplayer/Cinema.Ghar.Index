// --- START OF script.js ---
(function() {
    'use strict';

    // ===========================================================
    // JAVASCRIPT SECTION (Optimized for Performance)
    // ===========================================================
    const config = {
        HDR_LOGO_URL: "https://as1.ftcdn.net/v2/jpg/05/32/83/72/1000_F_532837228_v8CGZRU0jy39uCtqFRnJz6xDntrGuLLx.webp",
        FOURK_LOGO_URL: "https://i.pinimg.com/736x/85/c4/b0/85c4b0a2fb8612825d0cd2f53460925f.jpg",
        ITEMS_PER_PAGE: 50,
        LOCAL_STORAGE_KEY: 'cinemaGharState_v10_db_perf', // Incremented key version
        PLAYER_VOLUME_KEY: 'cinemaGharPlayerVolume',
        PLAYER_SPEED_KEY: 'cinemaGharPlayerSpeed',
        SEARCH_DEBOUNCE_DELAY: 300, // For triggering main search fetch (if needed)
        SUGGESTIONS_DEBOUNCE_DELAY: 250, // For fetching suggestions from API
        MAX_SUGGESTIONS_API: 15, // How many suggestions to request from API
        UPDATES_PREVIEW_INITIAL_COUNT: 10, // Initial count for "Recently Added"
        UPDATES_PREVIEW_LOAD_MORE_COUNT: 10, // How many to load on "Show More"
        MOVIE_DATA_API_URL: '/api/movies' // API endpoint
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
    // NO localSuggestionData anymore! Suggestions come from API.
    let currentViewData = []; // Holds data for the *currently rendered* table view page
    let weeklyUpdatesData = []; // Holds processed data for the updates preview (MASTER LIST)
    let updatesPreviewShownCount = 0; // Tracks how many are *currently rendered* in the preview
    // NO uniqueQualities Set needed here anymore. Qualities fetched from API.
    let activeTableActionRow = null;
    let activePreviewActionRow = null;
    let copyFeedbackTimeout;
    let suggestionDebounceTimeout;
    let suggestionAbortController = null; // Abort controller specifically for suggestions
    let searchAbortController = null;     // Abort controller for main movie search/fetch
    let isDirectShareLoad = false;
    let currentViewMode = 'homepage';
    let activeResultsTab = 'allFiles';
    let lastFocusedElement = null;

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

    // --- Utility Functions (Keep ALL existing utility functions) ---
    const sanitize = (str) => { if (str === null || typeof str === 'undefined') return ""; const temp = document.createElement('div'); temp.textContent = String(str); return temp.innerHTML; };
    const TimeAgo = { MINUTE: 60, HOUR: 3600, DAY: 86400, WEEK: 604800, MONTH: 2592000, YEAR: 31536000, format: (isoString) => { if (!isoString) return 'N/A'; try { const date = new Date(isoString); const seconds = Math.floor((new Date() - date) / 1000); if (isNaN(seconds) || seconds < 0) { console.warn(`TimeAgo: Invalid seconds calculation for ${isoString}. Parsed date: ${date}. Returning full date.`); return TimeAgo.formatFullDate(date); } if (seconds < 2) return "just now"; if (seconds < TimeAgo.MINUTE) return `${seconds} sec${seconds > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.HOUR) return `${Math.floor(seconds / TimeAgo.MINUTE)} min${Math.floor(seconds / TimeAgo.MINUTE) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY) return `${Math.floor(seconds / TimeAgo.HOUR)} hr${Math.floor(seconds / TimeAgo.HOUR) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY * 2) return "Yesterday"; if (seconds < TimeAgo.WEEK) return `${Math.floor(seconds / TimeAgo.DAY)} days ago`; if (seconds < TimeAgo.MONTH) return `${Math.floor(seconds / TimeAgo.WEEK)} wk${Math.floor(seconds / TimeAgo.WEEK) > 1 ? 's' : ''} ago`; return TimeAgo.formatFullDate(date, true); } catch (e) { console.error("Date Format Error (TimeAgo):", isoString, e); return 'Invalid Date'; } }, formatFullDate: (date, short = false) => { if (!(date instanceof Date) || isNaN(date.getTime())) return 'Invalid Date'; const optsDate = short ? { year: '2-digit', month: 'numeric', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }; const optsTime = { hour: 'numeric', minute: '2-digit', hour12: true }; try { return `${date.toLocaleDateString(undefined, optsDate)}${short ? '' : ', ' + date.toLocaleTimeString(undefined, optsTime)}`; } catch (e) { console.error("toLocaleDateString/Time failed:", e); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; } } };
    function extractSizeData(inputString) { if (!inputString) return { value: 0, unit: '', display: 'N/A', bytes: 0 }; const r = /(?<size>[\d.]+)\s?(?<unit>GB|MB)/i; const m = String(inputString).match(r); if (m?.groups?.size && m?.groups?.unit) { const value = parseFloat(m.groups.size); const unit = m.groups.unit.toUpperCase(); if (!isNaN(value)) { const bytes = unit === 'GB' ? value * 1024 * 1024 * 1024 : value * 1024 * 1024; return { value: value, unit: unit, display: `${value} ${unit}`, bytes: isNaN(bytes) ? 0 : bytes }; } } return { value: 0, unit: '', display: 'N/A', bytes: 0 }; }
    function getMimeTypeFromUrl(url) { if (!url) return 'video/*'; const m = url.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/); if (!m) return 'video/*'; const ext = m[1].toLowerCase(); const mimeMap = { 'mkv': 'video/x-matroska', 'mp4': 'video/mp4', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo', 'webm': 'video/webm', 'wmv': 'video/x-ms-wmv', 'flv': 'video/x-flv', 'ts': 'video/mp2t', 'm4v': 'video/x-m4v', 'ogv': 'video/ogg' }; return mimeMap[ext] || 'video/*'; }
    function handleVideoError(event) { console.error("HTML5 Video Error:", event, videoElement?.error); let msg = "An unknown error occurred while trying to play the video."; if (videoElement?.error) { switch (videoElement.error.code) { case MediaError.MEDIA_ERR_ABORTED: msg = 'Playback was aborted.'; break; case MediaError.MEDIA_ERR_NETWORK: msg = 'A network error caused the video download to fail.'; break; case MediaError.MEDIA_ERR_DECODE: msg = 'Video decoding error (unsupported codec or corrupt file?).'; break; case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = 'Video format not supported or server/network failed.'; break; default: msg = `An unknown video error occurred (Code: ${videoElement.error.code}).`; break; } } if (audioWarningDiv) { audioWarningDiv.innerHTML = `<strong>Playback Error:</strong> ${sanitize(msg)} <br>Consider using 'Copy URL' with an external player (VLC/MX) or 'Open Externally' (Android).`; audioWarningDiv.style.display = 'block'; } } if (videoElement) { videoElement.addEventListener('error', handleVideoError); }
    function extractQualityFromFilename(filename) { if (!filename) return null; const safeFilename = String(filename); const patterns = [ /(?:^|\.|\[|\(|\s|_|-)((?:4k|2160p|1080p|720p|480p))(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(WEB-?DL|WEBRip|BluRay|BDRip|BRRip|HDTV|HDRip|DVDrip|DVDScr|HDCAM|HC|TC|TS|CAM)(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(HDR|DV|Dolby.?Vision|HEVC|x265)(?=$|\.|\]|\)|\s|_|-)/i ]; let foundQuality = null; for (const regex of patterns) { const match = safeFilename.match(regex); if (match && match[1]) { let quality = match[1].toUpperCase(); quality = quality.replace(/WEB-?DL/i, 'WEBDL'); quality = quality.replace(/BLURAY/i, 'BluRay'); quality = quality.replace(/DVDRIP/i, 'DVD'); quality = quality.replace(/DOLBY.?VISION/i, 'Dolby Vision'); if (quality === '2160P') quality = '4K'; if (patterns.indexOf(regex) < 2) return quality; if (patterns.indexOf(regex) === 2 && !foundQuality) foundQuality = quality; } } return foundQuality; }
    function normalizeTextForSearch(text) { if (!text) return ""; return String(text) .toLowerCase() .replace(/[.\-_\(\)\[\]]/g, '') .replace(/\s+/g, ' ') .trim(); }
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    async function copyToClipboard(text, feedbackSpan) { console.log("Attempting to copy:", text); let success = false; if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) { try { await navigator.clipboard.writeText(text); success = true; console.log("navigator.clipboard.writeText SUCCEEDED"); } catch (err) { console.error("Async clipboard write failed:", err); success = false; } } if (!success) { console.warn("Using fallback copy method (execCommand)."); const textArea = document.createElement("textarea"); textArea.value = text; textArea.style.position = "fixed"; textArea.style.top = "-9999px"; textArea.style.left = "-9999px"; textArea.style.opacity = "0"; textArea.setAttribute("readonly", ""); document.body.appendChild(textArea); try { textArea.select(); textArea.setSelectionRange(0, textArea.value.length); success = document.execCommand('copy'); console.log("Fallback execCommand result:", success); } catch (err) { console.error('Fallback copy execCommand failed:', err); success = false; } finally { document.body.removeChild(textArea); } } if (success) { console.log("Copy successful!"); if (feedbackSpan) { showCopyFeedback(feedbackSpan, 'Copied!', false); } } else { console.error("Copy FAILED."); if (feedbackSpan) { showCopyFeedback(feedbackSpan, 'Copy Failed!', true); } else { alert("Copy failed. Please try again or copy manually. Check console for errors (F12)."); } } return success; }

    // --- Data Preprocessing (Called less often now) ---
    function preprocessMovieData(movie) {
        // Assume API returns necessary fields directly now thanks to specific SELECT
        const processed = { ...movie };
        processed.id = movie.original_id; // Map DB field to frontend field name
        processed.displayFilename = sanitize(movie.filename || '');
        processed.sizeData = extractSizeData(movie.size_display);
        if (!processed.size_bytes && processed.sizeData.bytes > 0) {
             processed.size_bytes = processed.sizeData.bytes;
        }
        processed.displayQuality = sanitize(movie.quality || 'N/A');
        // No need to manage uniqueQualities Set here anymore

        const tsString = movie.last_updated_ts;
        let dateObject = null;
        if (tsString) {
            try { dateObject = new Date(tsString); } catch(e) { console.warn("Date parse error in preprocessMovieData:", e); }
        }
        processed.lastUpdatedTimestamp = (dateObject && !isNaN(dateObject)) ? dateObject.getTime() : 0;
        if (processed.lastUpdatedTimestamp === 0 && tsString) {
            console.warn(`Invalid date format received for movie ID ${processed.id}, filename "${processed.displayFilename}":`, tsString);
        }
        processed.numericId = typeof processed.id === 'number' ? processed.id : Infinity;
        // searchText only needed if doing client-side filtering (which we removed for suggestions)
        // processed.searchText = normalizeTextForSearch(`${processed.id || ''} ${processed.displayFilename}`);
        processed.isSeries = !!movie.is_series;
        return processed;
    }

    // --- HTML Generation (Largely Unchanged - uses processed data) ---
    function createActionContentHTML(movie) { const displayFilename = movie.displayFilename; const displaySize = movie.sizeData.display; const displayQuality = movie.displayQuality; const streamTitle = (displayFilename || '').split(/[\.\(\[]/)[0].replace(/[_ ]+/g, ' ').trim() + (displayQuality !== 'N/A' ? ` (${displayQuality})` : ''); const timestampString = movie.last_updated_ts; const formattedDateRelative = TimeAgo.format(timestampString); const dateObject = timestampString ? new Date(timestampString) : null; const formattedDateFull = (dateObject && !isNaN(dateObject)) ? TimeAgo.formatFullDate(dateObject) : 'N/A'; let hdrLogoHtml = ''; let fourkLogoHtml = ''; const lowerFilename = (displayFilename || '').toLowerCase(); if (displayQuality === '4K' || lowerFilename.includes('2160p') || lowerFilename.includes('.4k.')) { fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo fourk-logo" title="4K Ultra HD" />`; } if ((displayQuality || '').includes('HDR') || (displayQuality || '').includes('DOLBY VISION') || displayQuality === 'DV' || lowerFilename.includes('hdr') || lowerFilename.includes('dolby.vision') || lowerFilename.includes('.dv.')) { hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo hdr-logo" title="HDR / Dolby Vision Content" />`; } const escapedStreamTitle = streamTitle.replace(/'/g, "\\'"); const escapedFilename = displayFilename.replace(/'/g, "\\'"); const escapedUrl = movie.url ? movie.url.replace(/'/g, "\\'") : ''; const escapedId = movie.id ? String(movie.id).replace(/'/g, "\\'") : ''; let actionButtonsHTML = ''; if (movie.url && movie.url.toLowerCase() !== 'null') { actionButtonsHTML += `<button class="button play-button" data-action="play" data-title="${escapedStreamTitle}" data-url="${escapedUrl}" data-filename="${escapedFilename}"><span aria-hidden="true">▶️</span> Play here</button>`; actionButtonsHTML += `<a class="button download-button" href="${sanitize(movie.url)}" download="${displayFilename}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">💾</span> Direct Download</a>`; actionButtonsHTML += `<button class="button vlc-button" data-action="copy-vlc" data-url="${escapedUrl}"><span aria-hidden="true">📋</span> Copy URL (for VLC/MX)</button><span class="copy-feedback" role="status" aria-live="polite">Copied!</span>`; if (navigator.userAgent.toLowerCase().includes("android")) { actionButtonsHTML += `<button class="button intent-button" data-action="open-intent" data-url="${escapedUrl}"><span aria-hidden="true">📱</span> Open Externally (Android)</button>`; } } if (movie.telegram_link && movie.telegram_link.toLowerCase() !== 'null') actionButtonsHTML += `<a class="button telegram-button" href="${sanitize(movie.telegram_link)}" target="_blank" rel="noopener noreferrer">Telegram File</a>`; if (movie.gdflix_link) actionButtonsHTML += `<a class="button gdflix-button" href="${sanitize(movie.gdflix_link)}" target="_blank" rel="noopener noreferrer">GDFLIX</a>`; if (movie.hubcloud_link && movie.hubcloud_link.toLowerCase() !== 'null') actionButtonsHTML += `<a class="button hubcloud-button" href="${sanitize(movie.hubcloud_link)}" target="_blank" rel="noopener noreferrer">HubCloud</a>`; if (movie.filepress_link) actionButtonsHTML += `<a class="button filepress-button" href="${sanitize(movie.filepress_link)}" target="_blank" rel="noopener noreferrer">Filepress</a>`; if (movie.gdtot_link) actionButtonsHTML += `<a class="button gdtot-button" href="${sanitize(movie.gdtot_link)}" target="_blank" rel="noopener noreferrer">GDToT</a>`; if (movie.id) { actionButtonsHTML += `<button class="button share-button" data-action="share" data-id="${escapedId}" data-title="${escapedStreamTitle}" data-filename="${escapedFilename}"><span aria-hidden="true">🔗</span> Share Post</button><span class="copy-feedback share-fallback" role="status" aria-live="polite">Link copied!</span>`; } if (!actionButtonsHTML) { actionButtonsHTML = '<span style="color: var(--text-muted); font-style: italic; text-align: center; width: 100%; display: block; padding: 10px 0;">No stream/download actions available</span>'; } const actionContentHTML = ` <div class="action-info"> <span class="info-item"><strong>Filename:</strong> ${displayFilename}</span> <span class="info-item"><strong>Quality:</strong> ${displayQuality} ${fourkLogoHtml}${hdrLogoHtml}</span> <span class="info-item"><strong>Size:</strong> ${displaySize}</span> <span class="info-item"><strong>Language:</strong> ${sanitize(movie.languages || 'N/A')}</span> <span class="info-item"><strong>Updated:</strong> ${formattedDateFull} (${formattedDateRelative})</span> ${movie.originalFilename ? `<span class="info-item"><strong>Original Name:</strong> ${sanitize(movie.originalFilename)}</span>` : ''} </div> <div class="action-buttons-container"> ${actionButtonsHTML} </div>`; return actionContentHTML; }
    function createMovieTableRowHTML(movie, dataIndex, actionRowId) { const displayFilename = movie.displayFilename; const displaySize = movie.sizeData.display; const displayQuality = movie.displayQuality; const timestampString = movie.last_updated_ts; const formattedDateRelative = TimeAgo.format(timestampString); const dateObject = timestampString ? new Date(timestampString) : null; const formattedDateFull = (dateObject && !isNaN(dateObject)) ? TimeAgo.formatFullDate(dateObject) : 'N/A'; let hdrLogoHtml = ''; let fourkLogoHtml = ''; const lowerFilename = (displayFilename || '').toLowerCase(); if (displayQuality === '4K' || lowerFilename.includes('2160p') || lowerFilename.includes('.4k.')) { fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo fourk-logo" title="4K Ultra HD" />`; } if ((displayQuality || '').includes('HDR') || (displayQuality || '').includes('DOLBY VISION') || displayQuality === 'DV' || lowerFilename.includes('hdr') || lowerFilename.includes('dolby.vision') || lowerFilename.includes('.dv.')) { hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo hdr-logo" title="HDR / Dolby Vision Content" />`; } const mainRowHTML = ` <tr class="movie-data-row" data-index="${dataIndex}" data-action-row-id="${actionRowId}"> <td class="col-id">${sanitize(movie.id || 'N/A')}</td> <td class="col-filename" title="Click to view details: ${displayFilename}"> ${displayFilename}${fourkLogoHtml}${hdrLogoHtml} </td> <td class="col-size">${displaySize}</td> <td class="col-quality">${displayQuality}</td> <td class="col-updated" title="${formattedDateFull}">${formattedDateRelative}</td> <td class="col-view"> <button class="button view-button" aria-expanded="false">View</button> </td> </tr>`; return mainRowHTML; }

    // --- View Control (Largely Unchanged) ---
    function setViewMode(mode) { console.log("Setting view mode to:", mode); const previousMode = currentViewMode; currentViewMode = mode; if (mode !== previousMode) { closePlayerIfNeeded(null); } container.classList.toggle('results-active', mode === 'search'); container.classList.toggle('shared-view-active', mode === 'shared'); const showHomepage = mode === 'homepage'; const showSearch = mode === 'search'; const showShared = mode === 'shared'; if (searchFocusArea) searchFocusArea.style.display = (showHomepage || showSearch) ? 'flex' : 'none'; if (resultsArea) resultsArea.style.display = showSearch ? 'block' : 'none'; if (sharedItemView) sharedItemView.style.display = showShared ? 'block' : 'none'; if (updatesPreviewSection) updatesPreviewSection.style.display = showHomepage ? 'block' : 'none'; if (pageFooter) pageFooter.style.display = (showHomepage || showSearch) ? 'flex' : 'none'; if (showHomepage) { if (searchInput) searchInput.value = ''; currentState.searchTerm = ''; if (suggestionsContainer) suggestionsContainer.style.display = 'none'; activeResultsTab = 'allFiles'; currentState.currentPage = 1; currentState.typeFilter = ''; closeActiveActionRow('table', null); closeActiveActionRow('preview', null); // Check if updates are already loaded or trigger loading if needed if (weeklyUpdatesData.length === 0 && updatesPreviewList && !updatesPreviewList.querySelector('.status-message')) { // Avoid re-showing loader if it's already failed loadUpdatesPreview(); } else if (weeklyUpdatesData.length > 0) { displayInitialUpdates(); } document.title = "Cinema Ghar Index"; } else if (showSearch) { closeActiveActionRow('preview', null); document.title = "Cinema Ghar Index"; } else if (showShared) { closeActiveActionRow('table', null); closeActiveActionRow('preview', null); } saveStateToLocalStorage(); }
    window.resetToHomepage = function(event) { const triggerElement = event?.target; const wasInSharedView = (currentViewMode === 'shared'); if (!wasInSharedView && window.history.pushState) { const cleanUrl = window.location.origin + window.location.pathname; window.history.pushState({ path: cleanUrl }, '', cleanUrl); } else if (!wasInSharedView) { window.location.hash = ''; } isDirectShareLoad = false; if (wasInSharedView) { console.log("Returning from shared view, performing full page reload to reset."); window.location.href = window.location.origin + window.location.pathname; } else { lastFocusedElement = triggerElement; setViewMode('homepage'); if (searchInput) { setTimeout(() => searchInput.focus(), 100); } } }

    // --- Search and Suggestions Logic (REVISED - Uses API) ---
    function handleSearchInput() {
        clearTimeout(suggestionDebounceTimeout);
        const searchTerm = searchInput.value.trim();

        if (searchTerm.length < 2) {
            suggestionsContainer.innerHTML = '';
            suggestionsContainer.style.display = 'none';
            return;
        }

        suggestionDebounceTimeout = setTimeout(() => {
            fetchAndDisplaySuggestions(searchTerm);
        }, config.SUGGESTIONS_DEBOUNCE_DELAY);
    }
    async function fetchAndDisplaySuggestions(term) {
        const normalizedTerm = normalizeTextForSearch(term);
        if (!normalizedTerm) {
            suggestionsContainer.innerHTML = '';
            suggestionsContainer.style.display = 'none';
            return;
        }

        if (suggestionAbortController) {
            suggestionAbortController.abort(); // Abort previous suggestion request
        }
        suggestionAbortController = new AbortController();
        const signal = suggestionAbortController.signal;

        try {
            console.log(`Fetching suggestions for: ${term}`);
            const params = { mode: 'suggestions', term: term };
            // Use a separate fetch call here or reuse fetchApiData carefully
            const response = await fetch(`${config.MOVIE_DATA_API_URL}?${new URLSearchParams(params).toString()}`, { signal });

            if (!response.ok) {
                if (response.status === 404) console.warn("Suggestions endpoint not found?"); // Or handle differently
                else throw new Error(`Suggestion API Error: Status ${response.status}`);
                suggestionsContainer.innerHTML = '';
                suggestionsContainer.style.display = 'none';
                return;
            }

            const data = await response.json();

            if (signal.aborted) {
                console.log("Suggestion fetch aborted.");
                return;
            }

            const suggestions = data.suggestions || [];
            suggestionsContainer.innerHTML = ''; // Clear previous

            if (suggestions.length > 0) {
                const fragment = document.createDocumentFragment();
                suggestions.forEach(itemText => {
                    const div = document.createElement('div');
                    let displayText = sanitize(itemText); // Sanitize suggestion text
                    let highlighted = false;
                     try {
                         const safeTerm = escapeRegExp(term);
                         const regex = new RegExp(`(${safeTerm})`, 'i');
                         if (displayText.match(regex)) {
                             div.innerHTML = displayText.replace(regex, '<strong>$1</strong>');
                             highlighted = true;
                         }
                     } catch (e) { console.warn("Regex error during suggestion highlighting:", e); }
                    if (!highlighted) { div.textContent = displayText; } // Fallback if regex fails
                    div.title = itemText; // Show full text on hover
                    div.onclick = () => selectSuggestion(itemText); // Use original text for search if needed
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
                suggestionsContainer.innerHTML = '';
                suggestionsContainer.style.display = 'none';
            }
        } finally {
             if (signal === suggestionAbortController?.signal) {
                suggestionAbortController = null; // Clear controller if this was the request that finished
             }
        }
    }
    function selectSuggestion(selectedValue) { searchInput.value = selectedValue; suggestionsContainer.style.display = 'none'; handleSearchSubmit(); }
    window.handleSearchSubmit = function() { if (suggestionsContainer) { suggestionsContainer.style.display = 'none'; } const searchTerm = searchInput.value.trim(); console.log("Handling search submit for:", searchTerm); if (searchInput) { searchInput.blur(); } if (searchTerm.length === 0 && currentViewMode !== 'homepage') { resetToHomepage(); return; } if (searchTerm.length === 0 && currentViewMode === 'homepage') { return; } setViewMode('search'); activeResultsTab = 'allFiles'; currentState.currentPage = 1; currentState.searchTerm = searchTerm; currentState.qualityFilter = qualityFilterSelect.value || ''; currentState.typeFilter = ''; // Reset type filter on new search updateActiveTabAndPanel(); showLoadingStateInTables(`Searching for "${sanitize(searchTerm)}"...`); fetchAndRenderResults(); }
    function handleSearchClear() { clearTimeout(suggestionDebounceTimeout); suggestionsContainer.style.display = 'none'; if (currentViewMode !== 'homepage') { setTimeout(() => { if (searchInput.value.trim() === '') { console.log("Search input cleared via 'x', resetting to homepage."); resetToHomepage(); } }, 100); } else { currentState.searchTerm = ''; saveStateToLocalStorage(); } }
    function showLoadingStateInTables(message = 'Loading...') { const loadingHTML = `<tr><td colspan="6" class="loading-message" role="status" aria-live="polite"><div class="spinner"></div>${sanitize(message)}</td></tr>`; Object.values(tabMappings).forEach(mapping => { if (mapping?.tableBody) { mapping.tableBody.innerHTML = loadingHTML; } if (mapping?.pagination) { mapping.pagination.style.display = 'none'; } }); }

    // --- Updates Preview Logic (API Fetch & Display - REVISED) ---
    async function loadUpdatesPreview() {
        if (isDirectShareLoad || !updatesPreviewSection || !updatesPreviewList || !showMoreUpdatesButton) return;
        updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`;
        showMoreUpdatesButton.style.display = 'none';
        updatesPreviewShownCount = 0;
        weeklyUpdatesData = []; // Clear previous updates data
        try {
            const params = {
                // mode: 'movies' (default, no need to specify)
                sort: 'lastUpdated',
                sortDir: 'desc',
                limit: config.UPDATES_PREVIEW_INITIAL_COUNT,
                page: 1
            };
            const data = await fetchApiData(params); // Use the main fetch function
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
        // Check if potentially more items exist based on initial fetch size vs limit
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
        // Calculate next page based on *total items already in the master list*
        const currentPageInMasterList = Math.floor(weeklyUpdatesData.length / config.UPDATES_PREVIEW_LOAD_MORE_COUNT);
        const nextPageToFetch = currentPageInMasterList + 1;
        console.log(`Attempting to load page ${nextPageToFetch} for updates preview.`);
        try {
            const params = {
                sort: 'lastUpdated',
                sortDir: 'desc',
                limit: config.UPDATES_PREVIEW_LOAD_MORE_COUNT,
                page: nextPageToFetch
            };
            const data = await fetchApiData(params);
            if (data && data.items && data.items.length > 0) {
                const newItems = data.items.map(preprocessMovieData);
                const startIndex = weeklyUpdatesData.length;
                weeklyUpdatesData.push(...newItems); // Add to master list
                appendUpdatesToPreview(startIndex, weeklyUpdatesData.length); // Append only new ones to DOM
                updatesPreviewShownCount = weeklyUpdatesData.length; // Update total count shown
                console.log(`Loaded ${newItems.length} more updates. Total now: ${updatesPreviewShownCount}. Current API page: ${data.page}, Total API pages: ${data.totalPages}`);
                if (data.page >= data.totalPages) {
                    showMoreUpdatesButton.textContent = "All Updates Shown";
                    // Keep disabled
                } else {
                    showMoreUpdatesButton.disabled = false;
                    showMoreUpdatesButton.textContent = "Show More";
                }
            } else {
                console.log("No more updates found from API.");
                showMoreUpdatesButton.textContent = "No More Updates";
                // Keep disabled
            }
        } catch (error) {
            console.error("Failed to load more updates:", error);
            showMoreUpdatesButton.textContent = "Error Loading";
            showMoreUpdatesButton.disabled = false; // Re-enable after error
        }
    }
    function appendUpdatesToPreview(startIndex, endIndex) { // Renders items from weeklyUpdatesData slice
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
            itemDiv.dataset.index = overallIndex; // Index within weeklyUpdatesData
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

            // Action Row creation
            const actionRowDiv = document.createElement('div');
            actionRowDiv.id = actionRowId;
            actionRowDiv.className = 'preview-action-row';
            actionRowDiv.style.display = 'none';
            fragment.appendChild(actionRowDiv);
        });
        // Remove initial loader if this is the first batch
        const initialLoader = updatesPreviewList.querySelector('.loading-inline-spinner');
        if (initialLoader && startIndex === 0) { initialLoader.remove(); }
        updatesPreviewList.appendChild(fragment);
    }

    // --- Filtering, Sorting (Trigger API Fetch) ---
    function triggerFilterChange() { if (!qualityFilterSelect || currentViewMode !== 'search') return; const newQualityFilter = qualityFilterSelect.value; if (newQualityFilter !== currentState.qualityFilter) { currentState.qualityFilter = newQualityFilter; currentState.currentPage = 1; closePlayerIfNeeded(null); showLoadingStateInTables(`Applying filter: ${sanitize(newQualityFilter || 'All Qualities')}...`); fetchAndRenderResults(); } }
    function handleSort(event) { const header = event.target.closest('th.sortable'); if (!header || currentViewMode !== 'search') return; const sortKey = header.dataset.sortKey; if (!sortKey) return; const oldSortColumn = currentState.sortColumn; const oldSortDirection = currentState.sortDirection; if (currentState.sortColumn === sortKey) { currentState.sortDirection = currentState.sortDirection === 'asc' ? 'desc' : 'asc'; } else { currentState.sortColumn = sortKey; currentState.sortDirection = ['filename', 'quality'].includes(sortKey) ? 'asc' : 'desc'; /* Default desc for others */ } if (oldSortColumn !== currentState.sortColumn || oldSortDirection !== currentState.sortDirection) { currentState.currentPage = 1; closePlayerIfNeeded(null); showLoadingStateInTables(`Sorting by ${sanitize(sortKey)} (${currentState.sortDirection})...`); fetchAndRenderResults(); } }

    // --- Rendering Logic (Uses API response) ---
    function renderActiveResultsView(apiResponse) {
        if (currentViewMode !== 'search' || !tabMappings[activeResultsTab]) { if (currentViewMode === 'search') { showLoadingStateInTables('Enter search term above.'); } return; }
        console.log(`Rendering results for tab: ${activeResultsTab}`, apiResponse);
        console.time("renderActiveResultsView");

        const { tableBody, pagination, tableHead } = tabMappings[activeResultsTab];
        if (!tableBody || !pagination) { console.error("Missing table body or pagination controls for tab:", activeResultsTab); console.timeEnd("renderActiveResultsView"); return; }

        const itemsToRender = apiResponse.items || [];
        const totalItems = apiResponse.totalItems || 0;
        const currentPage = apiResponse.page || 1;
        const totalPages = apiResponse.totalPages || 1;

        // Preprocess only the items for the current page
        currentViewData = itemsToRender.map(preprocessMovieData);

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

                // Append row HTML to fragment efficiently
                const tempDiv = document.createElement('tbody'); // Use temporary element to parse
                tempDiv.innerHTML = rowHTML.trim();
                while (tempDiv.firstChild) {
                    fragment.appendChild(tempDiv.firstChild); // Move parsed TR to fragment
                }

                // Action Row creation (as placeholders, content loaded on demand)
                 const actionRow = document.createElement('tr');
                 actionRow.id = actionRowId;
                 actionRow.className = 'action-row';
                 actionRow.style.display = 'none';
                 const colspanValue = allFilesTableHead?.rows[0]?.cells?.length || 6; // Get colspan based on header
                 actionRow.innerHTML = `<td colspan="${colspanValue}"></td>`; // Empty cell initially
                 fragment.appendChild(actionRow);
            });
        }

        tableBody.innerHTML = ''; // Clear table body once
        tableBody.appendChild(fragment); // Append all rows at once

        renderPaginationControls(pagination, totalItems, currentPage, totalPages);
        updateActiveTabAndPanel();
        if (tableHead) updateSortIndicators(tableHead);
        updateFilterIndicator();
        closeActiveActionRow('table', null); // Close any actions from previous page/sort
        console.timeEnd("renderActiveResultsView");
    }
    function renderPaginationControls(targetContainer, totalItems, currentPage, totalPages) { if (!targetContainer) return; if (totalItems === 0 || totalPages <= 1) { targetContainer.innerHTML = ''; targetContainer.style.display = 'none'; return; } targetContainer.dataset.totalPages = totalPages; targetContainer.innerHTML = ''; let paginationHTML = ''; const maxPagesToShow = 5; const halfPages = Math.floor(maxPagesToShow / 2); paginationHTML += `<button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled title="First page"' : 'title="Previous page"'}>« Prev</button>`; let startPage, endPage; if (totalPages <= maxPagesToShow + 2) { startPage = 1; endPage = totalPages; } else { startPage = Math.max(2, currentPage - halfPages); endPage = Math.min(totalPages - 1, currentPage + halfPages); if (currentPage - halfPages < 2) { endPage = Math.min(totalPages - 1, maxPagesToShow); } if (currentPage + halfPages > totalPages - 1) { startPage = Math.max(2, totalPages - maxPagesToShow + 1); } } if (startPage > 1) { paginationHTML += `<button onclick="changePage(1)" title="Page 1">1</button>`; if (startPage > 2) { paginationHTML += `<span class="page-info" title="Skipped pages">...</span>`; } } for (let i = startPage; i <= endPage; i++) { paginationHTML += (i === currentPage) ? `<span class="current-page">${i}</span>` : `<button onclick="changePage(${i})" title="Page ${i}">${i}</button>`; } if (endPage < totalPages) { if (endPage < totalPages - 1) { paginationHTML += `<span class="page-info" title="Skipped pages">...</span>`; } paginationHTML += `<button onclick="changePage(${totalPages})" title="Page ${totalPages}">${totalPages}</button>`; } paginationHTML += `<button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled title="Last page"' : 'title="Next page"'}>Next »</button>`; targetContainer.innerHTML = paginationHTML; targetContainer.style.display = 'block'; }
    function updateSortIndicators(tableHeadElement) { if (!tableHeadElement) return; tableHeadElement.querySelectorAll('th.sortable').forEach(th => { th.classList.remove('sort-asc', 'sort-desc'); const sortKey = th.dataset.sortKey; if (sortKey === currentState.sortColumn) { const directionClass = currentState.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc'; th.classList.add(directionClass); th.setAttribute('aria-sort', currentState.sortDirection === 'asc' ? 'ascending' : 'descending'); } else { th.removeAttribute('aria-sort'); } }); }
    function updateFilterIndicator() { if(qualityFilterSelect) { qualityFilterSelect.classList.toggle('filter-active', !!currentState.qualityFilter); } }
    function updateActiveTabAndPanel() { Object.keys(tabMappings).forEach(tabId => { const mapping = tabMappings[tabId]; const isActive = tabId === activeResultsTab; if (mapping?.button) mapping.button.classList.toggle('active', isActive); if (mapping?.panel) mapping.panel.classList.toggle('active', isActive); }); }

    // --- Pagination and Tab Switching (Trigger API Fetch) ---
    window.changePage = function(newPage) { if (currentViewMode !== 'search' || newPage < 1 || newPage === currentState.currentPage) { return; } const currentPagination = tabMappings[activeResultsTab]?.pagination; if(currentPagination && currentPagination.dataset.totalPages) { const totalP = parseInt(currentPagination.dataset.totalPages, 10); if(newPage > totalP) { console.log(`Change page request to ${newPage} denied, exceeds total pages (${totalP}).`); return; } } currentState.currentPage = newPage; closePlayerIfNeeded(null); // Fetch new page data fetchAndRenderResults().then(() => { const activeTableBody = tabMappings[activeResultsTab]?.tableBody; scrollToTopOfActiveTable(activeTableBody); }); saveStateToLocalStorage(); // Save other state, page isn't saved }
    function scrollToTopOfActiveTable(tableBodyElement) { if (!tableBodyElement) return; const tableContainer = tableBodyElement.closest('.table-container'); if (tableContainer) { const searchBarArea = container.querySelector('#search-focus-area'); const backButtonElem = resultsArea.querySelector('#backToHomeButtonResults'); const filterArea = resultsArea.querySelector('.results-filter-area'); const tabNav = resultsArea.querySelector('.tab-navigation'); let stickyHeaderHeight = 0; if (container.classList.contains('results-active')) { stickyHeaderHeight = (searchBarArea?.offsetHeight || 0) + (backButtonElem?.offsetHeight || 0) + (backButtonElem ? parseFloat(getComputedStyle(backButtonElem).marginBottom) : 0) + (filterArea?.offsetHeight || 0) + (tabNav?.offsetHeight || 0); } const elementTop = tableContainer.getBoundingClientRect().top + window.pageYOffset; const scrollPosition = elementTop - stickyHeaderHeight - 20; window.scrollTo({ top: scrollPosition, behavior: 'smooth' }); } }
    window.switchTab = function(tabId) { if (currentViewMode !== 'search' || tabId === activeResultsTab || !tabMappings[tabId]) { return; } activeResultsTab = tabId; currentState.currentPage = 1; // Reset page on tab switch currentState.typeFilter = tabMappings[tabId].typeFilter; closePlayerIfNeeded(null); closeActiveActionRow('table', null); updateActiveTabAndPanel(); showLoadingStateInTables(`Loading ${tabMappings[tabId].typeFilter || 'all files'}...`); fetchAndRenderResults(); saveStateToLocalStorage(); }

    // --- Action Row Logic (Uses currentViewData or weeklyUpdatesData) ---
    function closeActiveActionRow(type = 'any', elementToFocusAfter = null) { let rowToClose = null; let mainElement = null; let buttonElement = null; if ((type === 'table' || type === 'any') && activeTableActionRow) { rowToClose = activeTableActionRow; mainElement = rowToClose.previousElementSibling; if (mainElement) buttonElement = mainElement.querySelector('.view-button'); activeTableActionRow = null; } else if ((type === 'preview' || type === 'any') && activePreviewActionRow) { rowToClose = activePreviewActionRow; mainElement = rowToClose.previousElementSibling; if (mainElement) buttonElement = mainElement.querySelector('.view-button'); activePreviewActionRow = null; } if (rowToClose && rowToClose.style.display !== 'none') { const isPlayerInside = videoContainer?.parentElement === rowToClose || (rowToClose.matches('tr.action-row') && videoContainer?.parentElement === rowToClose.querySelector('td')) || (rowToClose.matches('.preview-action-row') && videoContainer?.parentElement === rowToClose); if (isPlayerInside) { closePlayer(elementToFocusAfter || buttonElement || mainElement); } rowToClose.style.display = 'none'; if (mainElement) mainElement.classList.remove('active-main-row'); if (buttonElement) { buttonElement.textContent = 'View'; buttonElement.setAttribute('aria-expanded', 'false'); } if (rowToClose.classList.contains('preview-action-row')) { rowToClose.innerHTML = ''; // Clear content for preview row } else if (rowToClose.matches('tr.action-row')) { // Only clear TD for table row const td = rowToClose.querySelector('td'); if(td) td.innerHTML = ''; } if (!isPlayerInside && elementToFocusAfter && typeof elementToFocusAfter.focus === 'function') { setTimeout(() => elementToFocusAfter.focus(), 50); } } }
    function toggleTableActions(mainRowElement, triggerElement = null) { if (!mainRowElement || !mainRowElement.matches('.movie-data-row')) return; const targetRowId = mainRowElement.dataset.actionRowId; const dataIndex = parseInt(mainRowElement.dataset.index, 10); // Index within currentViewData if (!targetRowId || isNaN(dataIndex) || dataIndex < 0 || dataIndex >= currentViewData.length) { console.error("Invalid data attributes or index on table row:", mainRowElement, dataIndex, currentViewData.length); return; } const buttonElement = mainRowElement.querySelector('.view-button'); if (!buttonElement) { console.error("Could not find view button in row:", mainRowElement); return; } // Find the *actual* action row TR element (should be next sibling if render is correct) const targetRow = mainRowElement.nextElementSibling; if (!targetRow || !targetRow.matches('.action-row') || targetRow.id !== targetRowId) { console.error("Action row TR not found or mismatched ID:", targetRowId, targetRow); // Attempt to find by ID as fallback, though structure is likely wrong targetRow = document.getElementById(targetRowId); if (!targetRow) return; // Give up if not found } const isCurrentlyAssociatedActiveRow = activeTableActionRow && activeTableActionRow.id === targetRowId; const elementToFocusAfterClose = triggerElement || buttonElement; // Close other rows first if opening a new one if (!isCurrentlyAssociatedActiveRow) { closePlayerIfNeeded(elementToFocusAfterClose); closeActiveActionRow('any', elementToFocusAfterClose); } // Toggle the target row if (isCurrentlyAssociatedActiveRow) { closeActiveActionRow('table', elementToFocusAfterClose); } else { const movie = currentViewData[dataIndex]; // Get data for the specific row if (!movie) { console.error("Movie data not found for index:", dataIndex); return; } const actionHTML = createActionContentHTML(movie); const cell = targetRow.querySelector('td'); // Get the single cell if (cell) { cell.innerHTML = actionHTML; } else { console.error("Could not find TD cell within action row TR:", targetRow); return; } targetRow.style.display = 'table-row'; buttonElement.textContent = 'Hide'; buttonElement.setAttribute('aria-expanded', 'true'); mainRowElement.classList.add('active-main-row'); activeTableActionRow = targetRow; focusFirstElementInContainer(targetRow); scrollToRowIfNeeded(mainRowElement); } }
    function togglePreviewActions(mainItemDiv, triggerElement = null) { if (!mainItemDiv || !mainItemDiv.matches('.update-item')) return; const movieIndex = parseInt(mainItemDiv.dataset.index, 10); // Index within weeklyUpdatesData const targetRowId = mainItemDiv.dataset.actionRowId; if (isNaN(movieIndex) || !targetRowId || movieIndex < 0 || movieIndex >= weeklyUpdatesData.length) { console.error("Invalid data attributes or index on preview item.", mainItemDiv, movieIndex, weeklyUpdatesData.length); return; } const targetRowDiv = document.getElementById(targetRowId); const buttonElement = mainItemDiv.querySelector('.view-button'); if (!targetRowDiv || !buttonElement) { console.error("Target action div or button not found.", targetRowId); return; } const isCurrentlyAssociatedActiveRow = activePreviewActionRow && activePreviewActionRow.id === targetRowId; const elementToFocusAfterClose = triggerElement || buttonElement; if (!isCurrentlyAssociatedActiveRow) { closePlayerIfNeeded(elementToFocusAfterClose); closeActiveActionRow('any', elementToFocusAfterClose); } if (isCurrentlyAssociatedActiveRow) { closeActiveActionRow('preview', elementToFocusAfterClose); } else { const movie = weeklyUpdatesData[movieIndex]; // Get data from the master updates list if (!movie) { console.error("Movie data not found for preview index:", movieIndex); return; } const actionContentHTML = createActionContentHTML(movie); targetRowDiv.innerHTML = actionContentHTML; targetRowDiv.style.display = 'block'; buttonElement.textContent = 'Hide'; buttonElement.setAttribute('aria-expanded', 'true'); mainItemDiv.classList.add('active-main-row'); activePreviewActionRow = targetRowDiv; focusFirstElementInContainer(targetRowDiv); scrollToRowIfNeeded(mainItemDiv); } }
    function scrollToRowIfNeeded(mainElement) { setTimeout(() => { mainElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 100); }
    function focusFirstElementInContainer(containerElement) { if (!containerElement) return; const firstFocusable = containerElement.querySelector('button, a[href]'); if (firstFocusable) { setTimeout(() => firstFocusable.focus(), 50); } }

    // --- Share Logic (Unchanged) ---
    async function handleShareClick(buttonElement) { const itemId = buttonElement.dataset.id; const itemTitle = buttonElement.dataset.title || "Cinema Ghar Item"; const itemFilename = buttonElement.dataset.filename || ""; if (!itemId) { console.error("Share failed: Item ID missing."); alert("Cannot share this item (missing ID)."); return; } const shareUrl = `${window.location.origin}${window.location.pathname}?shareId=${encodeURIComponent(itemId)}`; const shareText = `Check out: ${itemTitle}\n${itemFilename ? `(${itemFilename})\n` : ''}`; const feedbackSpan = buttonElement.nextElementSibling; if (!feedbackSpan || !feedbackSpan.classList.contains('copy-feedback')) { console.warn("Share fallback feedback span not found next to button:", buttonElement); } if (navigator.share) { try { await navigator.share({ title: itemTitle, text: shareText, url: shareUrl, }); console.log('Successful share'); } catch (error) { console.error('Error sharing:', error); if (error.name !== 'AbortError') { if (feedbackSpan) { showCopyFeedback(feedbackSpan, 'Share failed!', true); } else { alert(`Share failed: ${error.message}`); } } } } else { console.log('Web Share API not supported, falling back to copy.'); await copyToClipboard(shareUrl, feedbackSpan); } }

    // --- Shared Item Display Logic (Fetches via API) ---
    async function displaySharedItem(shareId) { if (!shareId || !sharedItemView || !sharedItemContent) return; sharedItemContent.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading shared item...</span></div>`; setViewMode('shared'); try { const params = { id: shareId }; // Let fetchApiData handle mode detection based on 'id' const data = await fetchApiData(params); if (data && data.items && data.items.length > 0) { const sharedMovieRaw = data.items[0]; const sharedMovie = preprocessMovieData(sharedMovieRaw); console.log("Displaying shared item:", sharedMovie.displayFilename); const actionHTML = createActionContentHTML(sharedMovie); sharedItemContent.innerHTML = actionHTML; document.title = `${sharedMovie.displayFilename || 'Shared Item'} - Cinema Ghar`; if (videoContainer) videoContainer.style.display = 'none'; } else { console.error("Shared item not found via API for ID:", shareId); sharedItemContent.innerHTML = `<div class="error-message" role="alert">Error: Shared item with ID ${sanitize(shareId)} was not found. It might have been removed or the link is incorrect.</div>`; document.title = "Item Not Found - Cinema Ghar Index"; } } catch (error) { console.error("Failed to fetch shared item:", error); sharedItemContent.innerHTML = `<div class="error-message" role="alert">Error loading shared item: ${error.message}. Please try again.</div>`; document.title = "Error Loading Item - Cinema Ghar Index"; } finally { // Ensure view mode is set even on error setViewMode('shared'); window.scrollTo({ top: 0, behavior: 'smooth' }); } }

    // --- Player Logic (Unchanged) ---
    function streamVideo(title, url, filenameForAudioCheck) { let currentActionContainer = null; if (currentViewMode === 'shared' && sharedItemContent) { currentActionContainer = sharedItemContent; } else { const currentActiveRow = activeTableActionRow || activePreviewActionRow; if (!currentActiveRow) { console.error("Cannot stream: active action row/div missing."); return; } currentActionContainer = currentActiveRow.matches('tr.action-row') ? currentActiveRow.querySelector('td') : currentActiveRow.matches('.preview-action-row') ? currentActiveRow : null; } if (!videoContainer || !videoElement || !currentActionContainer) { console.error("Cannot stream: player, video element, or action container missing.", { videoContainer, videoElement, currentActionContainer }); return; } if (videoContainer.parentElement !== currentActionContainer) { console.log("Moving video container to active container."); if (videoElement && videoElement.hasAttribute('src')) { videoElement.pause(); videoElement.removeAttribute('src'); videoElement.currentTime = 0; videoElement.load(); } if (vlcBox) vlcBox.style.display = 'none'; if (audioWarningDiv) audioWarningDiv.style.display = 'none'; if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; } clearCopyFeedback(); currentActionContainer.appendChild(videoContainer); } if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; } if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; } clearCopyFeedback(); const savedVolume = localStorage.getItem(config.PLAYER_VOLUME_KEY); const savedSpeed = localStorage.getItem(config.PLAYER_SPEED_KEY); videoElement.volume = (savedVolume !== null) ? Math.max(0, Math.min(1, parseFloat(savedVolume))) : 1; if (volumeSlider) volumeSlider.value = videoElement.volume; videoElement.muted = (videoElement.volume === 0); videoElement.playbackRate = (savedSpeed !== null) ? parseFloat(savedSpeed) : 1; if(playbackSpeedSelect) playbackSpeedSelect.value = String(videoElement.playbackRate); updateMuteButton(); videoElement.currentTime = 0; const ddp51Regex = /\bDDP?([ ._-]?5\.1)?\b/i; const advancedAudioRegex = /\b(DTS|ATMOS|TrueHD)\b/i; const multiAudioHintRegex = /\b(Multi|Dual)[ ._-]?Audio\b/i; let warningText = ""; if (filenameForAudioCheck) { const lowerFilename = (filenameForAudioCheck || '').toLowerCase(); if (ddp51Regex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DDP audio might not work in browser. Use 'Copy URL' or 'Open Externally'."; } else if (advancedAudioRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DTS/Atmos/TrueHD audio likely unsupported. Use external player."; } else if (multiAudioHintRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> May contain multiple audio tracks. Use selector below or external player."; } } if (warningText && audioWarningDiv) { audioWarningDiv.innerHTML = warningText; audioWarningDiv.style.display = 'block'; } if (videoTitle) videoTitle.innerText = title; if (vlcText) vlcText.innerText = url; if (vlcBox) vlcBox.style.display = 'block'; videoElement.src = url; videoElement.load(); videoElement.play().catch(e => { console.log("Autoplay was prevented or failed:", e.message); }); videoContainer.style.display = 'flex'; const closeButton = videoContainer.querySelector('.close-btn'); if (closeButton) { setTimeout(() => closeButton.focus(), 100); } setTimeout(() => { videoContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150); }
    window.closePlayer = function(elementToFocusAfter = null) { if (elementToFocusAfter instanceof Event) { elementToFocusAfter = elementToFocusAfter?.target; } if (!videoContainer || !videoElement) return; const wasPlaying = videoContainer.style.display !== 'none'; const parentContainer = videoContainer.parentElement; try { const fsElement = document.fullscreenElement || document.webkitFullscreenElement; if (fsElement && (fsElement === videoElement || fsElement === videoContainer)) { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } } catch(err) { console.error("Error exiting fullscreen:", err); } videoElement.pause(); videoElement.removeAttribute('src'); videoElement.currentTime = 0; videoElement.load(); videoContainer.style.display = 'none'; if (vlcBox) vlcBox.style.display = 'none'; if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; } if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; } clearCopyFeedback(); if (videoTitle) videoTitle.innerText = ''; if (videoContainer.classList.contains('is-fullscreen')) { videoContainer.classList.remove('is-fullscreen'); } const mainBodyContainer = document.getElementById('cinemaghar-container'); if (mainBodyContainer && videoContainer.parentElement !== mainBodyContainer) { mainBodyContainer.appendChild(videoContainer); console.log("Moved video player back to main container."); } else if (!mainBodyContainer) { console.warn("Main container #cinemaghar-container not found, cannot move player back."); } if (wasPlaying && parentContainer?.closest('.action-row, .preview-action-row')) { const parentActionRow = parentContainer.closest('.action-row, .preview-action-row'); if (parentActionRow) { const mainElement = parentActionRow.previousElementSibling; if (mainElement) { const viewButton = mainElement.querySelector('.view-button'); if (viewButton && viewButton.getAttribute('aria-expanded') === 'true') { viewButton.textContent = 'View'; viewButton.setAttribute('aria-expanded', 'false'); } mainElement.classList.remove('active-main-row'); } if (parentActionRow.style.display !== 'none') { parentActionRow.style.display = 'none'; if (parentActionRow.classList.contains('preview-action-row')) { parentActionRow.innerHTML = ''; } else if (parentActionRow.matches('tr.action-row')) { const td = parentActionRow.querySelector('td'); if(td) td.innerHTML = ''; } } } } else if (wasPlaying && currentViewMode === 'shared') { console.log("Closed player within shared view."); } let finalFocusTarget = elementToFocusAfter || lastFocusedElement; const closedRowId = parentContainer?.closest('.action-row, .preview-action-row')?.id; if (activeTableActionRow?.id === closedRowId || activePreviewActionRow?.id === closedRowId) { finalFocusTarget = null; } if (finalFocusTarget && typeof finalFocusTarget.focus === 'function') { console.log("Returning focus to:", finalFocusTarget); setTimeout(() => finalFocusTarget.focus(), 50); } lastFocusedElement = null; if (activeTableActionRow && activeTableActionRow.id === closedRowId) { activeTableActionRow = null; } if (activePreviewActionRow && activePreviewActionRow.id === closedRowId) { activePreviewActionRow = null; } }
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

    // --- State Persistence (Largely Unchanged) ---
    function saveStateToLocalStorage() { try { const stateToSave = {}; if (currentState.sortColumn !== 'lastUpdated') stateToSave.sortColumn = currentState.sortColumn; if (currentState.sortDirection !== 'desc') stateToSave.sortDirection = currentState.sortDirection; if (currentState.qualityFilter !== '') stateToSave.qualityFilter = currentState.qualityFilter; /* Don't save page or search term */ if (Object.keys(stateToSave).length > 0) { localStorage.setItem(config.LOCAL_STORAGE_KEY, JSON.stringify(stateToSave)); console.log("Saved state:", stateToSave); } else { localStorage.removeItem(config.LOCAL_STORAGE_KEY); console.log("State is default, removed saved state."); } } catch (e) { console.error("Failed to save state to localStorage:", e); } }
    function loadStateFromLocalStorage() { try { const savedState = localStorage.getItem(config.LOCAL_STORAGE_KEY); if (savedState) { const parsedState = JSON.parse(savedState); currentState.sortColumn = typeof parsedState.sortColumn === 'string' ? parsedState.sortColumn : 'lastUpdated'; currentState.sortDirection = (typeof parsedState.sortDirection === 'string' && ['asc', 'desc'].includes(parsedState.sortDirection)) ? parsedState.sortDirection : 'desc'; currentState.qualityFilter = typeof parsedState.qualityFilter === 'string' ? parsedState.qualityFilter : ''; console.log("Loaded state:", { sortColumn: currentState.sortColumn, sortDirection: currentState.sortDirection, qualityFilter: currentState.qualityFilter }); } else { currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc'; currentState.qualityFilter = ''; console.log("No saved state found, using defaults."); } } catch (e) { console.error("Failed to load or parse state from localStorage:", e); localStorage.removeItem(config.LOCAL_STORAGE_KEY); currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc'; currentState.qualityFilter = ''; } currentState.searchTerm = ''; currentState.currentPage = 1; currentState.typeFilter = ''; activeResultsTab = 'allFiles'; activeTableActionRow = null; activePreviewActionRow = null; lastFocusedElement = null; }

    // --- API Fetching Abstraction ---
    async function fetchApiData(params = {}) {
        // Determine the correct abort controller based on mode
        let controller;
        if (params.mode === 'suggestions') {
            if (suggestionAbortController) suggestionAbortController.abort();
            suggestionAbortController = new AbortController();
            controller = suggestionAbortController;
        } else { // Default to main search controller for movies, qualities, etc.
            if (searchAbortController) searchAbortController.abort();
            searchAbortController = new AbortController();
            controller = searchAbortController;
        }
        const signal = controller.signal;

        const query = new URLSearchParams();

        // Add mode if specified
        if (params.mode) query.set('mode', params.mode);

        // Add parameters based on mode or defaults
        if (params.mode === 'suggestions') {
            if (params.term) query.set('term', params.term);
        } else if (params.mode === 'qualities') {
            // No specific params needed for quality fetch
        } else { // Default ('movies' mode)
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

            if (params.id) { // Specific ID fetch overrides list params
                query.set('id', params.id);
                // Clear list-specific params if ID is present
                query.delete('search');
                query.delete('quality');
                query.delete('type');
                query.delete('page');
                query.delete('limit');
                query.delete('sort');
                query.delete('sortDir');
                query.delete('mode'); // Let backend deduce mode from id
            }
        }

        const url = `${config.MOVIE_DATA_API_URL}?${query.toString()}`;
        console.log(`Fetching API: ${url}`);

        try {
            const response = await fetch(url, { signal });

            if (!response.ok) {
                let errorBody = null;
                try { errorBody = await response.json(); } catch (_) {}
                const errorDetails = errorBody?.error || errorBody?.details || `Status: ${response.status}`;
                throw new Error(`API Error: ${errorDetails}`);
            }

            const data = await response.json();

            if (signal.aborted) {
                 console.log(`API fetch aborted for ${url}.`);
                 return null; // Indicate abortion
            }

            console.log(`API data received for ${url}:`, data);

            // Update total pages in dataset if available (for pagination)
            if(params.mode !== 'suggestions' && params.mode !== 'qualities' && activeResultsTab && tabMappings[activeResultsTab]) {
                const activePagination = tabMappings[activeResultsTab].pagination;
                if(activePagination && data.totalPages !== undefined) {
                    activePagination.dataset.totalPages = data.totalPages;
                }
            }

            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log(`API fetch aborted for ${url}.`);
                return null; // Indicate abortion
            }
            console.error(`Error fetching data from ${url}:`, error);
            throw error; // Re-throw for calling function to handle
        } finally {
            // Clear the *specific* abort controller that was used for this request
             if (controller === suggestionAbortController && signal === suggestionAbortController?.signal) {
                suggestionAbortController = null;
             } else if (controller === searchAbortController && signal === searchAbortController?.signal) {
                searchAbortController = null;
             }
        }
    }

    // --- Main Search Fetch Logic ---
    async function fetchAndRenderResults() {
        if (currentViewMode !== 'search') return;
        // No specific mode needed, defaults to 'movies' in fetchApiData
        try {
            const apiResponse = await fetchApiData();
            if (apiResponse === null) return; // Fetch was aborted
            renderActiveResultsView(apiResponse);
            saveStateToLocalStorage(); // Save sorting/filter state
        } catch (error) {
            console.error("Failed to fetch/render search results:", error);
            const currentTab = tabMappings[activeResultsTab];
            if (currentTab?.tableBody) {
                currentTab.tableBody.innerHTML = `<tr><td colspan="6" class="error-message">Error loading results: ${error.message}. Please try again.</td></tr>`;
            }
             Object.values(tabMappings).forEach(m => { if(m.pagination) m.pagination.style.display = 'none'; });
        }
    }

    // --- Quality Filter Population ---
    function populateQualityFilter(qualities = []) {
        if (!qualityFilterSelect) return;
        const currentSelectedValue = qualityFilterSelect.value;

        // Simple sort, customize if needed
        const sortedQualities = [...new Set(qualities)] // Ensure unique
                             .filter(q => q && q !== 'N/A') // Remove null/empty/N/A
                             .sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }));

        // Clear existing options (except the first "All Qualities")
        while (qualityFilterSelect.options.length > 1) {
            qualityFilterSelect.remove(1);
        }

        // Add sorted qualities
        sortedQualities.forEach(quality => {
            const option = document.createElement('option');
            option.value = quality;
            option.textContent = quality;
            qualityFilterSelect.appendChild(option);
        });

        // Restore previous selection if it still exists
        qualityFilterSelect.value = [...qualityFilterSelect.options].some(opt => opt.value === currentSelectedValue) ? currentSelectedValue : "";
        updateFilterIndicator();
    }

    // --- NEW: Fetch Initial Qualities ---
    async function loadInitialQualities() {
         if (!qualityFilterSelect) return;
         console.log("Fetching distinct qualities...");
         try {
            const data = await fetchApiData({ mode: 'qualities' });
            if (data && data.qualities) {
                populateQualityFilter(data.qualities);
                console.log(`Populated quality filter with ${data.qualities.length} items.`);
            } else {
                 console.warn("Did not receive qualities from API.");
            }
         } catch (error) {
             console.error("Failed to fetch initial qualities:", error);
             // Optional: display an error or leave the filter empty
         }
    }

    // --- Error Display ---
    function displayLoadError(message) { const errorHtml = `<div class="error-container" role="alert">${sanitize(message)}</div>`; if (searchFocusArea) searchFocusArea.innerHTML = ''; searchFocusArea.style.display = 'none'; if (resultsArea) resultsArea.innerHTML = ''; resultsArea.style.display = 'none'; if (updatesPreviewSection) updatesPreviewSection.innerHTML = ''; updatesPreviewSection.style.display = 'none'; if (sharedItemContent) sharedItemContent.innerHTML = ''; if (sharedItemView) sharedItemView.style.display = 'none'; if (pageFooter) pageFooter.style.display = 'none'; container.classList.remove('results-active', 'shared-view-active'); if (mainErrorArea) { mainErrorArea.innerHTML = errorHtml; } else if (container) { container.insertAdjacentHTML('afterbegin', errorHtml); } if (pageLoader) pageLoader.style.display = 'none'; }

    // --- Initialization ---
    async function initializeApp() {
        const urlParams = new URLSearchParams(window.location.search);
        const shareId = urlParams.get('shareId');
        isDirectShareLoad = !!shareId;

        if (pageLoader) pageLoader.style.display = 'flex';

        if (isDirectShareLoad) {
            console.log("Direct share link detected for ID:", shareId);
        } else {
            console.log("Preparing homepage view (pre-data).");
            if (searchFocusArea) searchFocusArea.style.display = 'flex';
            if (pageFooter) pageFooter.style.display = 'flex';
            if (resultsArea) resultsArea.style.display = 'none';
            if (sharedItemView) sharedItemView.style.display = 'none';
             const defaultMessageHTML = `<tr><td colspan="6" class="status-message">Enter search term above.</td></tr>`;
             Object.values(tabMappings).forEach(mapping => {
                 if (mapping?.tableBody) mapping.tableBody.innerHTML = defaultMessageHTML;
                 if (mapping?.pagination) mapping.pagination.style.display = 'none';
             });
        }

        loadStateFromLocalStorage(); // Load sort/filter preferences

        try {
            if (shareId) {
                // Fetch shared item first
                await displaySharedItem(shareId);
                // In background, fetch qualities for filter (might be needed if user navigates away)
                loadInitialQualities().catch(e => console.warn("Background quality fetch failed on shared view", e));
            } else {
                // Homepage: Fetch qualities and recent updates concurrently
                await Promise.all([
                    loadInitialQualities(),
                    loadUpdatesPreview()
                ]);
                setViewMode('homepage'); // Set homepage view *after* initial data attempts
            }

            // Set filter dropdown to loaded state value (if any)
            if (qualityFilterSelect) {
                qualityFilterSelect.value = currentState.qualityFilter || '';
                updateFilterIndicator();
            }

        } catch (error) {
            console.error('FATAL: Failed during app initialization:', error);
            displayLoadError(`Error initializing app: ${error.message}. Try refreshing.`);
        } finally {
            if (pageLoader) pageLoader.style.display = 'none'; // Hide loader regardless of outcome
        }
    }

    // --- Event Handling Setup ---
    function handleActionClick(event) { const target = event.target; const button = target.closest('.action-buttons-container .button'); if (button) { const action = button.dataset.action; const url = button.dataset.url; const title = button.dataset.title; const filename = button.dataset.filename; const id = button.dataset.id; lastFocusedElement = button; if (action === 'play' && url && title) { event.preventDefault(); streamVideo(title, url, filename); } else if (action === 'copy-vlc' && url) { event.preventDefault(); copyVLCLink(button, url); } else if (action === 'open-intent' && url) { event.preventDefault(); openWithIntent(url); } else if (action === 'share' && id) { event.preventDefault(); handleShareClick(button); } } }
    function handleContentClick(event) { const target = event.target; const viewButton = target.closest('.view-button'); const filenameLink = target.closest('td.col-filename, .preview-col-filename'); if (viewButton || filenameLink) { event.preventDefault(); const mainRowOrItem = target.closest('tr.movie-data-row, div.update-item'); if (mainRowOrItem) { lastFocusedElement = viewButton || filenameLink; if (mainRowOrItem.matches('tr.movie-data-row')) { toggleTableActions(mainRowOrItem, lastFocusedElement); } else if (mainRowOrItem.matches('div.update-item')) { togglePreviewActions(mainRowOrItem, lastFocusedElement); } } return; } handleActionClick(event); if (target.matches('.close-btn') && target.closest('#videoContainer')) { lastFocusedElement = target; closePlayer(lastFocusedElement); return; } }

    // --- Initial Event Listener Attachment (DOM Ready) ---
    // No need for DOMContentLoaded wrapper as script is deferred
    initializeApp().then(() => {
        console.log("App initialized, attaching listeners.");
        if (searchInput) {
            searchInput.addEventListener('input', handleSearchInput);
            searchInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    handleSearchSubmit();
                } else if (event.key === 'Escape') {
                    suggestionsContainer.style.display = 'none';
                }
            });
            searchInput.addEventListener('search', handleSearchClear); // Handle native clear button
            searchInput.addEventListener('blur', () => {
                // Delay hiding suggestions to allow click
                setTimeout(() => {
                     const searchButton = document.getElementById('searchSubmitButton');
                     // Check if focus moved to input, button, or within suggestions
                     if (document.activeElement !== searchInput &&
                         !suggestionsContainer.contains(document.activeElement) &&
                         document.activeElement !== searchButton)
                    {
                         suggestionsContainer.style.display = 'none';
                    }
                }, 150);
            });
        }

        if (qualityFilterSelect) {
            qualityFilterSelect.addEventListener('change', triggerFilterChange);
        }

        // Delegate clicks for tables and previews
        if (resultsArea) {
            resultsArea.addEventListener('click', (event) => {
                if (event.target.closest('th.sortable')) {
                    handleSort(event); // Handle sorting clicks
                } else {
                    handleContentClick(event); // Handle view buttons, links, action buttons
                }
            });
        }
        if (updatesPreviewList) {
             updatesPreviewList.addEventListener('click', handleContentClick);
        }
         if (sharedItemView) {
             sharedItemView.addEventListener('click', handleContentClick);
         }
         if (videoContainer) {
             // Allow clicks inside player without closing it
             // videoContainer.addEventListener('click', handleContentClick);
         }

        // Global listeners
        document.addEventListener('keydown', handlePlayerKeyboardShortcuts);
        document.addEventListener('click', (event) => {
            // Hide suggestions if clicked outside
            if (searchInput && suggestionsContainer && suggestionsContainer.style.display === 'block') {
                const searchWrapper = searchInput.closest('.search-input-wrapper');
                if (searchWrapper && !searchWrapper.contains(event.target)) {
                    suggestionsContainer.style.display = 'none';
                }
            }
            // Close player if clicked outside its logical context (action row/shared view)
            if (videoContainer && videoContainer.style.display !== 'none' && !videoContainer.contains(event.target)) {
                const logicalParent = videoContainer.parentElement?.closest('.action-row, .preview-action-row, #shared-item-content');
                // Check if click was outside the player AND outside its associated trigger row/button
                 if (!logicalParent || !logicalParent.contains(event.target)) {
                    // Also check if the click was on the original view button that opened it
                    const mainElement = logicalParent?.previousElementSibling;
                    const viewButton = mainElement?.querySelector('.view-button');
                    if (!viewButton || !viewButton.contains(event.target)) {
                        console.log("Clicked outside player's logical container/trigger. Closing player.");
                        closePlayer(event.target); // Close player, potentially return focus to clicked element
                    }
                 }
            }
        }, false); // Use capture phase? No, bubble is fine.

        // Player event listeners
        if(videoElement) {
            videoElement.addEventListener('volumechange', () => { if (volumeSlider && Math.abs(parseFloat(volumeSlider.value) - videoElement.volume) > 0.01) { volumeSlider.value = videoElement.volume; } updateMuteButton(); try { localStorage.setItem(config.PLAYER_VOLUME_KEY, String(videoElement.volume)); } catch (e) { console.warn("LocalStorage volume save failed", e); } });
            videoElement.addEventListener('ratechange', () => { if(playbackSpeedSelect && playbackSpeedSelect.value !== String(videoElement.playbackRate)) { playbackSpeedSelect.value = String(videoElement.playbackRate); } try { localStorage.setItem(config.PLAYER_SPEED_KEY, String(videoElement.playbackRate)); } catch (e) { console.warn("LocalStorage speed save failed", e); } });
            videoElement.addEventListener('loadedmetadata', populateAudioTrackSelector);
            videoElement.removeEventListener('error', handleVideoError); // Remove potential duplicate if attached earlier
            videoElement.addEventListener('error', handleVideoError);
        }
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

        console.log("Event listeners attached.");
    }).catch(err => {
        console.error("Error during initializeApp or listener attachment:", err);
        // displayLoadError might have already been called if init failed
    });

})(); // End of IIFE
// --- END OF script.js ---
