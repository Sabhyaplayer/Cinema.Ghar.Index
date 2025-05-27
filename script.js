// --- START OF script.js (MODIFIED FOR GROUPING, GRID VIEW, GROUP DETAIL VIEW + ALL EXISTING FEATURES) ---
(function() {
    'use strict';

    // ===========================================================
    // JAVASCRIPT SECTION (Restructured for Movie/Series Grouping)
    // ===========================================================
    const config = {
        HDR_LOGO_URL: "https://as1.ftcdn.net/v2/jpg/05/32/83/72/1000_F_532837228_v8CGZRU0jy39uCtqFRnJz6xDntrGuLLx.webp",
        FOURK_LOGO_URL: "https://i.pinimg.com/736x/85/c4/b0/85c4b0a2fb8612825d0cd2f53460925f.jpg",
        ITEMS_PER_PAGE: 50, // This will now be GROUPS_PER_PAGE for main listings
        LOCAL_STORAGE_KEY: 'cinemaGharState_v18_grouping', // Incremented version
        PLAYER_VOLUME_KEY: 'cinemaGharPlayerVolume',
        PLAYER_SPEED_KEY: 'cinemaGharPlayerSpeed',
        SEARCH_DEBOUNCE_DELAY: 300,
        SUGGESTIONS_DEBOUNCE_DELAY: 250,
        MAX_SUGGESTIONS: 50, // Suggestions will still be based on individual filenames
        UPDATES_PREVIEW_INITIAL_COUNT: 12, // Number of groups for updates preview
        UPDATES_PREVIEW_LOAD_MORE_COUNT: 12,
        MOVIE_DATA_API_URL: '/api/movies',
        BYPASS_API_URL: 'https://hubcloud-bypass.onrender.com/api/hubcloud',
        GDFLIX_BYPASS_API_URL: 'https://gdflix-bypass.onrender.com/api/gdflix',
        BYPASS_TIMEOUT: 60000,
        TMDB_API_PROXY_URL: '/api/tmdb',
        TMDB_FETCH_TIMEOUT: 15000,
        POSTER_PLACEHOLDER_URL: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'%3E%3Crect width='2' height='3' fill='%23e9ecef'/%3E%3C/svg%3E"
    };

    // --- DOM Element References ---
    const container = document.getElementById('cinemaghar-container');
    const pageLoader = document.getElementById('page-loader');
    const searchFocusArea = document.getElementById('search-focus-area');
    const resultsArea = document.getElementById('results-area');
    // ITEM DETAIL VIEW IS NOW GROUP DETAIL VIEW
    const groupDetailViewEl = document.getElementById('item-detail-view'); // Repurposed for Group Detail
    const groupDetailContentEl = document.getElementById('item-detail-content'); // Repurposed for Group Detail

    const searchInput = document.getElementById('mainSearchInput');
    const suggestionsContainer = document.getElementById('searchInputSuggestions');
    const qualityFilterSelect = document.getElementById('mainQualityFilterSelect');
    const mainErrorArea = document.getElementById('main-error-area');
    const updatesPreviewSection = document.getElementById('updates-preview-section');
    const updatesPreviewList = document.getElementById('updates-preview-list'); // Will show grouped updates
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

    const allFilesGridContainer = document.getElementById('allFilesGridContainer');
    const moviesGridContainer = document.getElementById('moviesGridContainer');
    const seriesGridContainer = document.getElementById('seriesGridContainer');

    // Table heads might be less relevant if not using table view, but keep refs if sort indicators are used
    const allFilesTableHead = document.querySelector('#allFilesTable thead');
    const moviesTableHead = document.querySelector('#moviesTable thead');
    const seriesTableHead = document.querySelector('#seriesTable thead');

    const allFilesPaginationControls = document.getElementById('allFilesPaginationControls');
    const moviesPaginationControls = document.getElementById('moviesPaginationControls');
    const seriesPaginationControls = document.getElementById('seriesPaginationControls');

    const backToHomeButtonResults = document.getElementById('backToHomeButtonResults');
    // These back buttons are inside the repurposed item-detail-view (now group-detail-view)
    const backToHomeButtonGroupDetail = document.getElementById('backToHomeButtonShared'); // Renamed for clarity in context
    const backToResultsButtonGroupDetail = document.getElementById('backToResultsButton'); // Renamed for clarity

    const pageFooter = document.getElementById('page-footer');
    const playerCustomUrlSection = document.getElementById('playerCustomUrlSection');
    const playerCustomUrlInput = document.getElementById('playerCustomUrlInput');
    const playerPlayCustomUrlButton = document.getElementById('playerPlayCustomUrlButton');
    const playerCustomUrlFeedback = playerCustomUrlSection?.querySelector('.player-custom-url-feedback');
    const playCustomUrlGlobalButton = document.getElementById('playCustomUrlGlobalButton');

    // --- State Variables ---
    let localSuggestionData = []; // For individual file name suggestions
    let currentFetchedItems = []; // Raw items from API before grouping for current search/tab
    let currentDisplayedGroups = []; // Array of group objects currently displayed in a grid
    let allKnownGroups = new Map(); // Stores all fetched groups { groupKey: groupObject }
    let weeklyUpdatesGroups = []; // Groups for the updates preview

    let currentGroupData = null; // Holds data for the currently viewed group in Group Detail
    let currentFileForAction = null; // Holds the specific file data when an action button in group detail is clicked

    let updatesPreviewShownCount = 0; // Number of groups shown in updates
    let uniqueQualities = new Set();
    let copyFeedbackTimeout;
    let bypassFeedbackTimeout;
    let suggestionDebounceTimeout;
    let searchAbortController = null;
    let groupDetailAbortController = null; // For aborting fetches within group detail
    let isInitialLoad = true;
    let currentViewMode = 'homepage'; // 'homepage', 'search', 'groupDetail'
    let activeResultsTab = 'allFiles';
    let lastFocusedElement = null;
    let isGlobalCustomUrlMode = false;
    let lastSearchTermForResults = ''; // To compare if search results need re-grouping

    let currentState = {
        searchTerm: '',
        qualityFilter: '',
        typeFilter: '', // 'movies', 'series', ''
        sortColumn: 'lastUpdated', // Default sort for fetching raw items; grouping might affect final display order
        sortDirection: 'desc',
        currentPage: 1, // For paginating groups
        limit: config.ITEMS_PER_PAGE, // Groups per page
    };

    const tabMappings = {
        allFiles: { button: document.getElementById('allFilesTabButton'), panel: document.getElementById('allFilesTabPanel'), gridContainer: allFilesGridContainer, pagination: allFilesPaginationControls, typeFilter: '', tableHead: allFilesTableHead },
        movies: { button: document.getElementById('moviesTabButton'), panel: document.getElementById('moviesTabPanel'), gridContainer: moviesGridContainer, pagination: moviesPaginationControls, typeFilter: 'movies', tableHead: moviesTableHead },
        series: { button: document.getElementById('seriesTabButton'), panel: document.getElementById('seriesTabPanel'), gridContainer: seriesGridContainer, pagination: seriesPaginationControls, typeFilter: 'series', tableHead: seriesTableHead }
    };

    // --- Utility Functions (mostly unchanged) ---
    const sanitize = (str) => { if (str === null || typeof str === 'undefined') return ""; const temp = document.createElement('div'); temp.textContent = String(str); return temp.innerHTML; };
    const TimeAgo = { MINUTE: 60, HOUR: 3600, DAY: 86400, WEEK: 604800, MONTH: 2592000, YEAR: 31536000, format: (isoString) => { if (!isoString) return 'N/A'; try { const date = new Date(isoString); const seconds = Math.floor((new Date() - date) / 1000); if (isNaN(seconds) || seconds < 0) { return TimeAgo.formatFullDate(date); } if (seconds < 2) return "just now"; if (seconds < TimeAgo.MINUTE) return `${seconds} sec${seconds > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.HOUR) return `${Math.floor(seconds / TimeAgo.MINUTE)} min${Math.floor(seconds / TimeAgo.MINUTE) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY) return `${Math.floor(seconds / TimeAgo.HOUR)} hr${Math.floor(seconds / TimeAgo.HOUR) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY * 2) return "Yesterday"; if (seconds < TimeAgo.WEEK) return `${Math.floor(seconds / TimeAgo.DAY)} days ago`; if (seconds < TimeAgo.MONTH) return `${Math.floor(seconds / TimeAgo.WEEK)} wk${Math.floor(seconds / TimeAgo.WEEK) > 1 ? 's' : ''} ago`; return TimeAgo.formatFullDate(date, true); } catch (e) { return 'Invalid Date'; } }, formatFullDate: (date, short = false) => { if (!(date instanceof Date) || isNaN(date.getTime())) return 'Invalid Date'; const optsDate = short ? { year: '2-digit', month: 'numeric', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }; const optsTime = { hour: 'numeric', minute: '2-digit', hour12: true }; try { return `${date.toLocaleDateString(undefined, optsDate)}${short ? '' : ', ' + date.toLocaleTimeString(undefined, optsTime)}`; } catch (e) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; } } };
    function extractSizeData(inputString) { if (!inputString) return { value: 0, unit: '', display: 'N/A', bytes: 0 }; const r = /(?<size>[\d.]+)\s?(?<unit>GB|MB)/i; const m = String(inputString).match(r); if (m?.groups?.size && m?.groups?.unit) { const value = parseFloat(m.groups.size); const unit = m.groups.unit.toUpperCase(); if (!isNaN(value)) { const bytes = unit === 'GB' ? value * 1024 * 1024 * 1024 : value * 1024 * 1024; return { value: value, unit: unit, display: `${value} ${unit}`, bytes: isNaN(bytes) ? 0 : bytes }; } } return { value: 0, unit: '', display: 'N/A', bytes: 0 }; }
    function getMimeTypeFromUrl(url) { if (!url) return 'video/*'; const m = url.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/); if (!m) return 'video/*'; const ext = m[1].toLowerCase(); const mimeMap = { 'mkv': 'video/x-matroska', 'mp4': 'video/mp4', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo', 'webm': 'video/webm', 'wmv': 'video/x-ms-wmv', 'flv': 'video/x-flv', 'ts': 'video/mp2t', 'm4v': 'video/x-m4v', 'ogv': 'video/ogg' }; return mimeMap[ext] || 'video/*'; }
    function handleVideoError(event) { console.error("HTML5 Video Error:", event, videoElement?.error); let msg = "An unknown error occurred while trying to play the video."; if (videoElement?.error) { switch (videoElement.error.code) { case MediaError.MEDIA_ERR_ABORTED: msg = 'Playback was aborted.'; break; case MediaError.MEDIA_ERR_NETWORK: msg = 'A network error caused the video download to fail.'; break; case MediaError.MEDIA_ERR_DECODE: msg = 'Video decoding error (unsupported codec or corrupt file?).'; break; case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = 'Video format not supported or server/network failed.'; break; default: msg = `An unknown video error occurred (Code: ${videoElement.error.code}).`; break; } } if (audioWarningDiv) { audioWarningDiv.innerHTML = `<strong>Playback Error:</strong> ${sanitize(msg)} <br>Consider using 'Copy URL' with an external player (VLC/MX), 'Play in VLC or MX Player' (Android), or the 'Play Custom URL' option below.`; audioWarningDiv.style.display = 'block'; }
        // Show custom URL input within the player if an error occurs
        const customUrlToggleButtonInPlayer = videoContainer.querySelector('.custom-url-toggle-button');
        if (customUrlToggleButtonInPlayer) {
            customUrlToggleButtonInPlayer.style.display = 'inline-flex'; // Make sure it's visible
            if (playerCustomUrlSection && playerCustomUrlSection.style.display === 'none') {
                toggleCustomUrlInputInPlayer(customUrlToggleButtonInPlayer, true); // Open it
            }
            setTimeout(() => { customUrlToggleButtonInPlayer.focus(); }, 100);
        } else if (isGlobalCustomUrlMode) {
             if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'flex';
             if (videoElement) videoElement.style.display = 'none';
             if (customControlsContainer) customControlsContainer.style.display = 'none';
        }
    }
    function extractQualityFromFilename(filename) { if (!filename) return null; const safeFilename = String(filename); const patterns = [ /(?:^|\.|\[|\(|\s|_|-)((?:4k|2160p|1080p|720p|480p))(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(WEB-?DL|WEBRip|BluRay|BDRip|BRRip|HDTV|HDRip|DVDrip|DVDScr|HDCAM|HC|TC|TS|CAM)(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(HDR|DV|Dolby.?Vision|HEVC|x265)(?=$|\.|\]|\)|\s|_|-)/i ]; let foundQuality = null; for (const regex of patterns) { const match = safeFilename.match(regex); if (match && match[1]) { let quality = match[1].toUpperCase(); quality = quality.replace(/WEB-?DL/i, 'WEBDL'); quality = quality.replace(/BLURAY/i, 'BluRay'); quality = quality.replace(/DVDRIP/i, 'DVD'); quality = quality.replace(/DOLBY.?VISION/i, 'Dolby Vision'); if (quality === '2160P') quality = '4K'; if (patterns.indexOf(regex) < 2) return quality; if (patterns.indexOf(regex) === 2 && !foundQuality) foundQuality = quality; } } return foundQuality; }
    function normalizeTextForSearch(text) { if (!text) return ""; return String(text) .toLowerCase() .replace(/[.\-_\(\)\[\]]/g, '') .replace(/\s+/g, ' ') .trim(); }
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    async function copyToClipboard(text, feedbackSpan) { let success = false; if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) { try { await navigator.clipboard.writeText(text); success = true; } catch (err) { success = false; } } if (!success) { const textArea = document.createElement("textarea"); textArea.value = text; textArea.style.position = "fixed"; textArea.style.top = "-9999px"; textArea.style.left = "-9999px"; textArea.style.opacity = "0"; textArea.setAttribute("readonly", ""); document.body.appendChild(textArea); try { textArea.select(); textArea.setSelectionRange(0, textArea.value.length); success = document.execCommand('copy'); } catch (err) { success = false; } finally { document.body.removeChild(textArea); } } if (success) { if (feedbackSpan) showCopyFeedback(feedbackSpan, 'Copied!', false); } else { if (feedbackSpan) showCopyFeedback(feedbackSpan, 'Copy Failed!', true); else alert("Copy failed."); } return success; }

    // --- Data Preprocessing (for individual files) ---
    function preprocessMovieData(movie) {
        const processed = { ...movie };
        processed.id = movie.original_id; // This is the unique ID for the *file*
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
        processed.searchText = normalizeTextForSearch(`${processed.id || ''} ${processed.displayFilename}`); // For filename suggestions
        processed.isSeries = !!movie.is_series; // From DB
        processed.extractedTitle = null; processed.extractedYear = null; processed.extractedSeason = null;
        processed.tmdbDetails = movie.tmdbDetails || null; // Store any pre-fetched TMDb details for the file (might be rare)

        const filename = processed.displayFilename;
        if (filename) {
            let cleanedName = filename;
            const qualityTagsRegex = /(\b(4k|2160p|1080p|720p|480p|web-?dl|webrip|bluray|bdrip|brrip|hdtv|hdrip|dvdrip|dvdscr|hdcam|hc|tc|ts|cam|hdr|dv|dolby.?vision|hevc|x265)\b)/gi;
            cleanedName = cleanedName.replace(qualityTagsRegex, '');
            const seasonMatch = cleanedName.match(/[. (_-](S(\d{1,2}))(?:E\d{1,2}|[. (_-])/i) || cleanedName.match(/[. (_-](Season[. _]?(\d{1,2}))(?:[. (_]|$)/i);
            if (seasonMatch && (seasonMatch[2] || seasonMatch[3])) {
                processed.extractedSeason = parseInt(seasonMatch[2] || seasonMatch[3], 10);
                if (!processed.isSeries) processed.isSeries = true; // Override if filename indicates series
                const titleEndIndex = seasonMatch.index;
                processed.extractedTitle = cleanedName.substring(0, titleEndIndex).replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
                const yearInTitleMatch = processed.extractedTitle.match(/[.(_[](\d{4})[.)_\]]$/);
                if(yearInTitleMatch && yearInTitleMatch[1]) {
                     const potentialYear = parseInt(yearInTitleMatch[1], 10);
                     if (potentialYear > 1900 && potentialYear < 2050) {
                         processed.extractedYear = potentialYear; // Year can exist for series title too
                         processed.extractedTitle = processed.extractedTitle.replace(new RegExp(`[.(_[]${potentialYear}[.)_\]]$`), '').trim();
                     }
                }
            } else { // Not a season match, assume movie
                if (processed.isSeries === true && !seasonMatch) { /* keep isSeries if DB said so */ }
                else { processed.isSeries = false; }

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
                 if (/^\d{4}$/.test(processed.extractedTitle) && !processed.extractedYear) {
                    processed.extractedYear = parseInt(processed.extractedTitle, 10);
                    processed.extractedTitle = null;
                 } else if (/^\d{4}$/.test(processed.extractedTitle) && processed.extractedYear) {
                    processed.extractedTitle = cleanedName.split(/[\.({\[]/)[0].replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
                    if (/^\d{4}$/.test(processed.extractedTitle)) processed.extractedTitle = null;
                 }
            }
        }
        if (!processed.extractedTitle && processed.displayFilename) { // Ultimate fallback for title
             processed.extractedTitle = processed.displayFilename.split(/[\.\(\[]/)[0].replace(/[_ ]+/g, ' ').trim();
        }
        return processed;
    }

    // --- Item Grouping Logic ---
    function getGroupKey(item) {
        if (!item.extractedTitle) return `__nogroup_${item.id}`; // Fallback for items that couldn't be parsed
        let key = item.extractedTitle.toLowerCase().replace(/\s+/g, '_');
        if (item.isSeries) {
            if (item.extractedSeason) key += `_s${item.extractedSeason}`;
            // Optionally, include year for series if available and helps differentiate remakes/etc.
            // if (item.extractedYear) key += `_y${item.extractedYear}`;
        } else {
            if (item.extractedYear) key += `_y${item.extractedYear}`;
        }
        return key;
    }

    function groupItems(items) {
        const groups = new Map();
        items.forEach(item => {
            const groupKey = getGroupKey(item);
            if (!groups.has(groupKey)) {
                groups.set(groupKey, {
                    groupKey: groupKey,
                    displayTitle: item.extractedTitle || "Unknown Title",
                    year: item.extractedYear, // Will be null if not present
                    season: item.extractedSeason, // Will be null if not a series or no season
                    isSeries: item.isSeries,
                    files: [],
                    tmdbDetails: null, // To be fetched per group
                    posterPathFetchAttempted: false,
                    posterPathFetchFailed: false,
                    // Use the timestamp of the most recently updated file in the group
                    lastUpdatedTimestamp: 0,
                });
            }
            const group = groups.get(groupKey);
            group.files.push(item);
            if (item.lastUpdatedTimestamp > group.lastUpdatedTimestamp) {
                group.lastUpdatedTimestamp = item.lastUpdatedTimestamp;
            }
        });

        // Sort files within each group (e.g., by quality, filename) - Optional
        groups.forEach(group => {
            group.files.sort((a, b) => {
                // Example sort: by quality (desc), then filename (asc)
                const qualityComparison = (b.displayQuality || '').localeCompare(a.displayQuality || '');
                if (qualityComparison !== 0) return qualityComparison;
                return (a.displayFilename || '').localeCompare(b.displayFilename || '');
            });
            // Store combined qualities for the group for filtering display
            group.qualities = [...new Set(group.files.map(f => f.displayQuality).filter(q => q && q !== 'N/A'))];
        });


        // Convert Map to array and sort groups (e.g., by latest update in group)
        return Array.from(groups.values()).sort((a, b) => b.lastUpdatedTimestamp - a.lastUpdatedTimestamp);
    }


    // --- HTML Generation (Group Grid Item) ---
    function setupFallbackDisplayForGroup(group, posterContainer) {
        if (!group || !posterContainer) return;
        const img = posterContainer.querySelector('.poster-image');
        const fallbackContent = posterContainer.querySelector('.poster-fallback-content');
        if (!fallbackContent) return;

        const titleEl = fallbackContent.querySelector('.fallback-title');
        const yearEl = fallbackContent.querySelector('.fallback-year');

        if (img) img.style.display = 'none';

        if (titleEl) titleEl.textContent = group.displayTitle;
        
        let yearTextContent = '';
        if (group.isSeries && group.season) {
            yearTextContent = `Season ${group.season}`;
        } else if (!group.isSeries && group.year) {
            yearTextContent = String(group.year);
        }
        if (yearEl) yearEl.textContent = yearTextContent;
        
        fallbackContent.style.display = 'flex';
    }

    function createGroupGridItemHTML(group) {
        const card = document.createElement('div');
        card.className = 'grid-item'; // Or 'update-item' if used for updates preview
        card.dataset.groupKey = sanitize(group.groupKey);
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        const baseTitleForAria = group.displayTitle + (group.year ? ` (${group.year})` : '') + (group.isSeries && group.season ? ` Season ${group.season}` : '');
        card.setAttribute('aria-label', `View details for ${sanitize(baseTitleForAria)}`);

        // Badges for 4K/HDR can be based on if *any* file in the group has it
        let fourkLogoHtml = '';
        let hdrLogoHtml = '';
        if (group.files.some(f => (f.displayQuality === '4K' || (f.displayFilename||'').toLowerCase().includes('2160p') || (f.displayFilename||'').toLowerCase().includes('.4k.')))) {
            fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo-badge fourk-logo-badge" title="4K Ultra HD Available" />`;
        }
        if (group.files.some(f => ((f.displayQuality||'').includes('HDR') || (f.displayQuality||'').includes('DOLBY VISION') || f.displayQuality === 'DV' || (f.displayFilename||'').toLowerCase().includes('hdr') || (f.displayFilename||'').toLowerCase().includes('dolby.vision') || (f.displayFilename||'').toLowerCase().includes('.dv.')))) {
            hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo-badge hdr-logo-badge" title="HDR / Dolby Vision Content Available" />`;
        }
        
        const fileCountBadge = `<span class="file-count-badge">${group.files.length} ${group.files.length === 1 ? 'file' : 'files'}</span>`;

        const initialSpinnerDisplay = (!group.tmdbDetails?.posterPath && !group.posterPathFetchAttempted) ? 'block' : 'none';

        card.innerHTML = `
            <div class="poster-container">
                <img src="${config.POSTER_PLACEHOLDER_URL}" alt="Poster for ${sanitize(group.displayTitle)}" class="poster-image" loading="lazy">
                <div class="poster-fallback-content" style="display: none;">
                    <h3 class="fallback-title"></h3>
                    <p class="fallback-year"></p>
                </div>
                <div class="poster-spinner spinner" style="display: ${initialSpinnerDisplay};"></div>
                <div class="quality-badges-overlay">${fileCountBadge}${fourkLogoHtml}${hdrLogoHtml}</div>
            </div>
        `;
        // No .item-info div below poster for group grid items. Title/year is in fallback.

        const posterContainer = card.querySelector('.poster-container');
        const imgElement = posterContainer.querySelector('.poster-image');
        const spinnerElement = posterContainer.querySelector('.poster-spinner');

        imgElement.onerror = function() {
            this.style.display = 'none';
            const parentPosterContainer = this.closest('.poster-container');
            if (group && parentPosterContainer) {
                setupFallbackDisplayForGroup(group, parentPosterContainer);
            }
            const localSpinner = parentPosterContainer ? parentPosterContainer.querySelector('.poster-spinner') : null;
            if (localSpinner) localSpinner.style.display = 'none';
        };

        if (group.tmdbDetails?.posterPath) {
            imgElement.src = group.tmdbDetails.posterPath;
            if (spinnerElement) spinnerElement.style.display = 'none';
        } else if (!group.posterPathFetchAttempted) {
            fetchPosterForGroup(group, imgElement, spinnerElement, posterContainer);
        } else { // Fetch attempted and failed or no poster
            setupFallbackDisplayForGroup(group, posterContainer);
            if (spinnerElement) spinnerElement.style.display = 'none';
        }
        return card;
    }

    async function fetchPosterForGroup(group, imgElement, spinnerElement, posterContainerElement) {
        if (!imgElement || !posterContainerElement) {
            if (spinnerElement) spinnerElement.style.display = 'none';
            if (group && posterContainerElement) setupFallbackDisplayForGroup(group, posterContainerElement);
            return;
        }

        const fallbackContentElement = posterContainerElement.querySelector('.poster-fallback-content');
        if (group.posterPathFetchAttempted) { // Already tried
            if (spinnerElement) spinnerElement.style.display = 'none';
            if (group.tmdbDetails?.posterPath) {
                if (imgElement.src !== group.tmdbDetails.posterPath) imgElement.src = group.tmdbDetails.posterPath;
                imgElement.style.display = 'block';
                if (fallbackContentElement) fallbackContentElement.style.display = 'none';
            } else {
                setupFallbackDisplayForGroup(group, posterContainerElement);
            }
            return;
        }

        if (spinnerElement) spinnerElement.style.display = 'block';
        imgElement.style.display = 'block'; // Show placeholder
        if (fallbackContentElement) fallbackContentElement.style.display = 'none';
        group.posterPathFetchAttempted = true;

        try {
            const tmdbQuery = new URLSearchParams();
            tmdbQuery.set('query', group.displayTitle);
            tmdbQuery.set('type', group.isSeries ? 'tv' : 'movie');
            if (!group.isSeries && group.year) {
                tmdbQuery.set('year', group.year);
            } else if (group.isSeries && group.year) { // For series, year is less common for search but can be used if available
                 // tmdbQuery.set('first_air_date_year', group.year); // This might be too restrictive
            }

            const tmdbUrl = `${config.TMDB_API_PROXY_URL}?${tmdbQuery.toString()}&fetchFullDetails=false`; // Don't need full details for grid poster
            const tmdbController = new AbortController();
            const tmdbTimeoutId = setTimeout(() => tmdbController.abort(), config.TMDB_FETCH_TIMEOUT);

            const tmdbResponse = await fetch(tmdbUrl, { signal: tmdbController.signal });
            clearTimeout(tmdbTimeoutId);

            if (!group.tmdbDetails) group.tmdbDetails = {};

            if (tmdbResponse.ok) {
                const fetchedTmdbData = await tmdbResponse.json();
                if (fetchedTmdbData && fetchedTmdbData.posterPath) {
                    imgElement.src = fetchedTmdbData.posterPath;
                    imgElement.style.display = 'block';
                    if (fallbackContentElement) fallbackContentElement.style.display = 'none';
                    group.tmdbDetails.posterPath = fetchedTmdbData.posterPath;
                    // Keep original extracted title unless TMDb is significantly better
                    // group.tmdbDetails.title = fetchedTmdbData.title;
                } else {
                    setupFallbackDisplayForGroup(group, posterContainerElement);
                    group.posterPathFetchFailed = true;
                }
            } else {
                setupFallbackDisplayForGroup(group, posterContainerElement);
                group.posterPathFetchFailed = true;
            }
        } catch (tmdbError) {
            if (tmdbError.name !== 'AbortError') {
                console.error(`Error fetching TMDb poster for group "${group.displayTitle}":`, tmdbError);
            }
            setupFallbackDisplayForGroup(group, posterContainerElement);
            if (!group.tmdbDetails) group.tmdbDetails = {};
            group.posterPathFetchFailed = true;
        } finally {
            if (spinnerElement) spinnerElement.style.display = 'none';
            // Update the group in allKnownGroups map to persist poster info
            if(allKnownGroups.has(group.groupKey)) {
                allKnownGroups.set(group.groupKey, {...allKnownGroups.get(group.groupKey), ...group});
            }
        }
    }


    // --- View Control ---
    function setViewMode(mode) {
        console.log(`Setting view mode to: ${mode}`);
        const previousMode = currentViewMode;
        currentViewMode = mode;

        if (mode !== previousMode) {
             closePlayerIfNeeded(null); // Close player if changing major views
        }

        container.classList.toggle('results-active', mode === 'search');
        container.classList.toggle('item-detail-active', mode === 'groupDetail'); // Changed class name for clarity

        const showHomepage = mode === 'homepage';
        const showSearch = mode === 'search';
        const showGroupDetail = mode === 'groupDetail';

        if (searchFocusArea) searchFocusArea.style.display = (showHomepage || showSearch) ? 'flex' : 'none';
        if (resultsArea) resultsArea.style.display = showSearch ? 'block' : 'none';
        if (groupDetailViewEl) groupDetailViewEl.style.display = showGroupDetail ? 'block' : 'none';
        if (updatesPreviewSection) updatesPreviewSection.style.display = showHomepage ? 'block' : 'none';
        if (pageFooter) pageFooter.style.display = (showHomepage || showSearch) ? 'flex' : 'none';


        if (showHomepage) {
            if (searchInput) searchInput.value = '';
            currentState.searchTerm = '';
            if (suggestionsContainer) suggestionsContainer.style.display = 'none';
            activeResultsTab = 'allFiles'; currentState.currentPage = 1; currentState.typeFilter = '';
            if (weeklyUpdatesGroups.length > 0) { displayInitialUpdates(); }
            else if (localSuggestionData.length > 0) { // if suggestion data (raw files) is loaded but no groups yet
                 if (updatesPreviewList) updatesPreviewList.innerHTML = '<div class="status-message grid-status-message">No recent updates found.</div>';
                 if (showMoreUpdatesButton) showMoreUpdatesButton.style.display = 'none';
            } else { // Still loading
                if (updatesPreviewList) updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`;
            }
            document.title = "Cinema Ghar Index";
            currentGroupData = null;
        } else if (showGroupDetail) {
            if (searchFocusArea) searchFocusArea.style.display = 'none';
            if (resultsArea) resultsArea.style.display = 'none';
            if (updatesPreviewSection) updatesPreviewSection.style.display = 'none';
            if (pageFooter) pageFooter.style.display = 'none';
        } else if (showSearch) {
            currentGroupData = null;
        }

        if (!isInitialLoad) { saveStateToLocalStorage(); }
    }

    window.resetToHomepage = function(event) {
        if (window.history.pushState) { const cleanUrl = window.location.origin + window.location.pathname; if (window.location.search !== '') { window.history.pushState({ path: cleanUrl }, '', cleanUrl); } }
        currentGroupData = null;
        if (groupDetailAbortController) { groupDetailAbortController.abort(); groupDetailAbortController = null; }
        lastFocusedElement = event?.target;
        setViewMode('homepage');
        if (searchInput) { setTimeout(() => searchInput.focus(), 100); }
    }

    window.goBackToResults = function() { // From Group Detail view
        currentGroupData = null;
        if (groupDetailAbortController) { groupDetailAbortController.abort(); groupDetailAbortController = null; }
        // history.back() should trigger popstate which calls handleUrlChange
        // Ensure last search term is available to repopulate search if that was the origin
        if (currentState.searchTerm || lastSearchTermForResults) {
            const urlParams = new URLSearchParams(window.location.search);
            urlParams.delete('viewGroup');
            urlParams.delete('fileId');
            if (lastSearchTermForResults && !urlParams.has('q')) urlParams.set('q', lastSearchTermForResults);
            const newQuery = urlParams.toString();
            const targetUrl = window.location.pathname + (newQuery ? `?${newQuery}` : '');
            history.pushState({}, '', targetUrl); // Update URL to reflect search state
            handleUrlChange(true); // Manually trigger to ensure search re-renders
        } else {
            history.back();
        }
    }

    window.addEventListener('popstate', (event) => { handleUrlChange(true); });

    function handleUrlChange(isPopState = false) {
        if (groupDetailAbortController) { groupDetailAbortController.abort(); groupDetailAbortController = null; }

        const urlParams = new URLSearchParams(window.location.search);
        const groupKey = urlParams.get('viewGroup');
        const fileIdToOpen = urlParams.get('fileId'); // For deep-linking to a specific file within a group
        const legacyShareId = urlParams.get('shareId'); // old individual file ID
        const legacyViewId = urlParams.get('viewId');   // old individual file ID
        const queryParam = urlParams.get('q');


        if (groupKey) {
            // If already on the correct group detail page (e.g. navigated back to it via history)
            if (currentViewMode === 'groupDetail' && currentGroupData && currentGroupData.groupKey === groupKey) {
                 setViewMode('groupDetail'); // Ensure correct classes are set
                 // Potentially re-scroll to fileIdToOpen if provided
                 if (fileIdToOpen && groupDetailContentEl) {
                    const fileElement = groupDetailContentEl.querySelector(`.file-item[data-file-id="${sanitize(fileIdToOpen)}"]`);
                    if (fileElement) {
                        setTimeout(() => fileElement.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
                    }
                 }
            } else {
                displayGroupDetail(groupKey, fileIdToOpen);
            }
        } else if (legacyShareId || legacyViewId) {
            // Handle old share/view links by finding the group and redirecting
            const targetFileId = legacyShareId || legacyViewId;
            handleLegacyFileLink(targetFileId);
            // Clear these old params from URL after processing
            urlParams.delete('shareId');
            urlParams.delete('viewId');
            const newQueryString = urlParams.toString();
            history.replaceState(null, '', window.location.pathname + (newQueryString ? `?${newQueryString}` : ''));

        } else if (queryParam) { // Navigating to search results
            if (currentViewMode !== 'search' || currentState.searchTerm !== queryParam) {
                searchInput.value = queryParam;
                handleSearchSubmit(false); // false to not push history again if isPopState
            } else {
                setViewMode('search'); // Ensure view is correct
            }
        }
        else { // No groupKey, no legacy IDs, no query -> Homepage or back from group to search
            if (currentViewMode === 'groupDetail') {
                currentGroupData = null;
                if (isPopState && (currentState.searchTerm || lastSearchTermForResults)) {
                    setViewMode('search');
                    // If searchInput.value is not already set by a 'q' param, set it from saved state
                    if (searchInput && !searchInput.value && (currentState.searchTerm || lastSearchTermForResults)) {
                        searchInput.value = currentState.searchTerm || lastSearchTermForResults;
                    }
                    fetchAndRenderResults();
                } else {
                    setViewMode('homepage');
                }
            } else if (currentViewMode === 'search' && !queryParam && isPopState) {
                setViewMode('homepage');
            } else if (currentViewMode !== 'homepage' && (isInitialLoad || !isPopState)) {
                 setViewMode('homepage');
            }
        }
        isInitialLoad = false; // Moved here from initializeApp
    }

    async function handleLegacyFileLink(fileId) {
        // This function tries to find the group for an old file-specific link
        if (pageLoader) pageLoader.style.display = 'flex';
        try {
            const fileDataResponse = await fetchApiData({ id: fileId }); // Fetch the single file by its original_id
            if (fileDataResponse && fileDataResponse.items && fileDataResponse.items.length > 0) {
                const fileItem = preprocessMovieData(fileDataResponse.items[0]);
                const groupKey = getGroupKey(fileItem);

                // Update URL to new group-based URL
                const newUrlParams = new URLSearchParams();
                newUrlParams.set('viewGroup', groupKey);
                newUrlParams.set('fileId', fileId); // Keep fileId to highlight it
                history.replaceState({ viewGroup: groupKey, fileId: fileId }, '', `${window.location.pathname}?${newUrlParams.toString()}`);
                
                displayGroupDetail(groupKey, fileId); // Display the group, highlighting the specific file
            } else {
                console.warn(`Legacy file ID ${fileId} not found. Redirecting to homepage.`);
                resetToHomepage();
            }
        } catch (error) {
            console.error(`Error handling legacy file link for ID ${fileId}:`, error);
            resetToHomepage();
        } finally {
            if (pageLoader) pageLoader.style.display = 'none';
        }
    }


    // --- Search and Suggestions Logic ---
    function handleSearchInput() { clearTimeout(suggestionDebounceTimeout); const searchTerm = searchInput.value.trim(); if (searchTerm.length < 2) { suggestionsContainer.style.display = 'none'; return; } suggestionDebounceTimeout = setTimeout(() => { fetchAndDisplaySuggestions(searchTerm); }, config.SUGGESTIONS_DEBOUNCE_DELAY); }
    function fetchAndDisplaySuggestions(term) { const normalizedTerm = normalizeTextForSearch(term); if (!normalizedTerm) { suggestionsContainer.style.display = 'none'; return; } const matchingItems = localSuggestionData.filter(movie => movie.searchText.includes(normalizedTerm)).slice(0, config.MAX_SUGGESTIONS); suggestionsContainer.innerHTML = ''; if (matchingItems.length > 0) { const fragment = document.createDocumentFragment(); matchingItems.forEach(item => { const div = document.createElement('div'); let displayText = item.displayFilename; let highlighted = false; if (term.length > 0) { try { const safeTerm = escapeRegExp(term); const regex = new RegExp(`(${safeTerm})`, 'i'); if ((item.displayFilename || '').match(regex)) { div.innerHTML = (item.displayFilename || '').replace(regex, '<strong>$1</strong>'); highlighted = true; } } catch (e) { console.warn("Regex error for highlight:", e); } } if (!highlighted) { div.textContent = item.displayFilename; } div.title = item.displayFilename; div.onclick = () => selectSuggestion(item.displayFilename); fragment.appendChild(div); }); suggestionsContainer.appendChild(fragment); suggestionsContainer.style.display = 'block'; } else { suggestionsContainer.style.display = 'none'; } }
    function selectSuggestion(selectedValue) { searchInput.value = selectedValue; suggestionsContainer.style.display = 'none'; handleSearchSubmit(); }

    window.handleSearchSubmit = function(pushHistory = true) {
        if (suggestionsContainer) { suggestionsContainer.style.display = 'none'; }
        const searchTerm = searchInput.value.trim();
        if (searchInput) { searchInput.blur(); }

        if (searchTerm.length === 0 && currentViewMode !== 'homepage') {
            resetToHomepage(); return;
        }
        if (searchTerm.length === 0 && currentViewMode === 'homepage') {
            return; // Do nothing if search is empty on homepage
        }

        if (currentViewMode === 'groupDetail') { // If searching from group detail view
            if (groupDetailAbortController) { groupDetailAbortController.abort(); groupDetailAbortController = null; }
            currentGroupData = null;
        }
        lastSearchTermForResults = searchTerm; // Store for back navigation
        setViewMode('search');
        activeResultsTab = 'allFiles'; // Default to all files tab on new search
        currentState.currentPage = 1;
        currentState.searchTerm = searchTerm;
        currentState.qualityFilter = qualityFilterSelect.value || '';
        currentState.typeFilter = ''; // Reset type filter on new search from input bar

        if (pushHistory) {
            const urlParams = new URLSearchParams();
            urlParams.set('q', searchTerm);
            // Add other relevant filters if needed (e.g. quality, type if they should persist with search term)
            history.pushState({ q: searchTerm }, '', `${window.location.pathname}?${urlParams.toString()}`);
        }
        
        updateActiveTabAndPanel(); // Ensure 'allFiles' tab is visually active
        showLoadingStateInGrids(`Searching for "${sanitize(searchTerm)}"...`);
        fetchAndRenderResults();
    }
    function handleSearchClear() { clearTimeout(suggestionDebounceTimeout); suggestionsContainer.style.display = 'none'; setTimeout(() => { if (searchInput.value.trim() === '') { if (currentViewMode === 'search') { resetToHomepage(); } else { currentState.searchTerm = ''; saveStateToLocalStorage(); } } }, 100); }
    function showLoadingStateInGrids(message = 'Loading...') {
        const loadingHTML = `<div class="loading-message grid-status-message"><div class="spinner"></div>${sanitize(message)}</div>`;
        Object.values(tabMappings).forEach(mapping => {
            if (mapping?.gridContainer) {
                mapping.gridContainer.innerHTML = loadingHTML;
            }
            if (mapping?.pagination) {
                mapping.pagination.style.display = 'none';
            }
        });
    }

    // --- Updates Preview Logic (Displays Grouped Updates) ---
    async function loadUpdatesPreview() {
        if (currentViewMode !== 'homepage' || !updatesPreviewList || !showMoreUpdatesButton) return;
        updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`;
        showMoreUpdatesButton.style.display = 'none';
        updatesPreviewShownCount = 0;
        weeklyUpdatesGroups = [];

        try {
            // Fetch more raw items than needed for initial display to have enough for "load more"
            const rawItemsToFetch = config.UPDATES_PREVIEW_INITIAL_COUNT + (config.UPDATES_PREVIEW_LOAD_MORE_COUNT * 2); // Fetch a bit more
            const params = { sort: 'lastUpdated', sortDir: 'desc', limit: rawItemsToFetch, page: 1 };
            const data = await fetchApiData(params);

            if (data && data.items && data.items.length > 0) {
                const preprocessedItems = data.items.map(preprocessMovieData);
                weeklyUpdatesGroups = groupItems(preprocessedItems); // Group the fetched items
                
                // Cache these groups in allKnownGroups
                weeklyUpdatesGroups.forEach(group => {
                    if (!allKnownGroups.has(group.groupKey) || allKnownGroups.get(group.groupKey).files.length < group.files.length) {
                         allKnownGroups.set(group.groupKey, group);
                    }
                });

                displayInitialUpdates(); // This will use weeklyUpdatesGroups
            } else {
                updatesPreviewList.innerHTML = '<div class="status-message grid-status-message">No recent updates found.</div>';
                showMoreUpdatesButton.style.display = 'none';
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                updatesPreviewList.innerHTML = `<div class="error-message grid-status-message">Could not load updates. ${error.message}</div>`;
            }
            showMoreUpdatesButton.style.display = 'none';
        }
    }

    function displayInitialUpdates() { // Uses weeklyUpdatesGroups
        if (!updatesPreviewList || !showMoreUpdatesButton) return;
        updatesPreviewList.innerHTML = '';
        updatesPreviewShownCount = 0;
        if (weeklyUpdatesGroups.length === 0) {
            updatesPreviewList.innerHTML = '<div class="status-message grid-status-message">No recent updates found.</div>';
            showMoreUpdatesButton.style.display = 'none';
            return;
        }
        const initialCount = Math.min(weeklyUpdatesGroups.length, config.UPDATES_PREVIEW_INITIAL_COUNT);
        appendUpdatesToPreview(0, initialCount); // Appends groups
        updatesPreviewShownCount = initialCount;
        const potentiallyMore = weeklyUpdatesGroups.length > initialCount;
        if (potentiallyMore) {
            showMoreUpdatesButton.style.display = 'block';
            showMoreUpdatesButton.disabled = false;
            showMoreUpdatesButton.textContent = "Show More";
        } else {
            showMoreUpdatesButton.style.display = 'none';
        }
    }

    window.appendMoreUpdates = async function() { // Appends more groups
        if (!updatesPreviewList || !showMoreUpdatesButton) return;
        showMoreUpdatesButton.disabled = true;
        showMoreUpdatesButton.textContent = "Loading...";
        const groupsToLoad = weeklyUpdatesGroups.slice(updatesPreviewShownCount, updatesPreviewShownCount + config.UPDATES_PREVIEW_LOAD_MORE_COUNT);
        if (groupsToLoad.length > 0) {
            appendUpdatesToPreview(updatesPreviewShownCount, updatesPreviewShownCount + groupsToLoad.length);
            updatesPreviewShownCount += groupsToLoad.length;
            const hasMoreAfterThis = weeklyUpdatesGroups.length > updatesPreviewShownCount;
            if (hasMoreAfterThis) {
                showMoreUpdatesButton.disabled = false;
                showMoreUpdatesButton.textContent = "Show More";
            } else {
                showMoreUpdatesButton.textContent = "All Updates Shown";
                showMoreUpdatesButton.disabled = true;
            }
        } else {
            showMoreUpdatesButton.textContent = "No More Updates";
            showMoreUpdatesButton.disabled = true;
        }
    }

    function appendUpdatesToPreview(startIndex, endIndex) { // Appends group grid items
        if (!updatesPreviewList) return;
        const fragment = document.createDocumentFragment();
        const groupsToAppend = weeklyUpdatesGroups.slice(startIndex, endIndex);

        groupsToAppend.forEach((group) => {
            if (!group || !group.groupKey) return;
            const groupGridItemElement = createGroupGridItemHTML(group); // Use the group renderer
            // Ensure class is 'update-item' for shared styling if needed, or just 'grid-item'
            groupGridItemElement.classList.add('update-item'); // If specific update item styling exists
            fragment.appendChild(groupGridItemElement);
        });

        const initialLoader = updatesPreviewList.querySelector('.loading-inline-spinner');
        if (initialLoader && startIndex === 0) { initialLoader.remove(); }
        updatesPreviewList.appendChild(fragment);
    }


    // --- Filtering (applies to groups), Sorting (applies to fetching raw items) ---
    function triggerFilterChange() { if (!qualityFilterSelect || currentViewMode !== 'search') return; const newQualityFilter = qualityFilterSelect.value; if (newQualityFilter !== currentState.qualityFilter) { currentState.qualityFilter = newQualityFilter; currentState.currentPage = 1; closePlayerIfNeeded(null); showLoadingStateInGrids(`Applying filter: ${sanitize(newQualityFilter || 'All Qualities')}...`); fetchAndRenderResults(); /* This will re-fetch, re-group, then filter groups */ } }
    function handleSort(event) { const header = event.target.closest('th.sortable'); if (!header || currentViewMode !== 'search') return; const sortKey = header.dataset.sortKey; if (!sortKey) return; const oldSortColumn = currentState.sortColumn; const oldSortDirection = currentState.sortDirection; if (currentState.sortColumn === sortKey) { currentState.sortDirection = currentState.sortDirection === 'asc' ? 'desc' : 'asc'; } else { currentState.sortColumn = sortKey; currentState.sortDirection = ['filename', 'quality'].includes(sortKey) ? 'asc' : 'desc'; } if (oldSortColumn !== currentState.sortColumn || oldSortDirection !== currentState.sortDirection) { currentState.currentPage = 1; closePlayerIfNeeded(null); showLoadingStateInGrids(`Sorting by ${sanitize(sortKey)} (${currentState.sortDirection})...`); fetchAndRenderResults(); /* Re-fetches raw items with new sort, then re-groups */ } }


    // --- Rendering Logic (for grouped results) ---
    function renderActiveResultsView(apiResponse) { // apiResponse contains raw items
         if (currentViewMode !== 'search' || !tabMappings[activeResultsTab]) {
             if (currentViewMode === 'search') { showLoadingStateInGrids('Enter search term above.'); }
             return;
         }
         const { gridContainer, pagination, tableHead } = tabMappings[activeResultsTab];
         if (!gridContainer || !pagination) { console.error("Missing grid container or pagination for tab:", activeResultsTab); return; }

         const rawItems = apiResponse.items || [];
         currentFetchedItems = rawItems.map(preprocessMovieData); // Preprocess individual files

         // Group the fetched items
         let groupsToDisplay = groupItems(currentFetchedItems);

         // Filter groups based on currentState.qualityFilter
         if (currentState.qualityFilter) {
             groupsToDisplay = groupsToDisplay.filter(group =>
                 group.files.some(file => file.displayQuality === currentState.qualityFilter)
             );
         }

         // Filter groups based on currentState.typeFilter (already applied in API, but can double check here if needed)
         // This is mostly handled by the tab selection which sets currentState.typeFilter for the API call.
         // If API returns mixed types despite filter (should not happen with correct API), an additional client-side filter:
         // if (currentState.typeFilter === 'movies') groupsToDisplay = groupsToDisplay.filter(g => !g.isSeries);
         // if (currentState.typeFilter === 'series') groupsToDisplay = groupsToDisplay.filter(g => g.isSeries);

         currentDisplayedGroups = groupsToDisplay; // Store the final groups for this view

         // Cache these groups in allKnownGroups
         currentDisplayedGroups.forEach(group => {
             if (!allKnownGroups.has(group.groupKey) || allKnownGroups.get(group.groupKey).files.length < group.files.length) {
                  allKnownGroups.set(group.groupKey, group);
             }
         });


         gridContainer.innerHTML = '';
         const fragment = document.createDocumentFragment();

         // Pagination now applies to groups
         const totalGroups = currentDisplayedGroups.length;
         // For client-side pagination of groups (if API doesn't support group pagination)
         // const paginatedGroups = currentDisplayedGroups.slice(offset, offset + currentState.limit);
         // For now, assume API pagination of raw items is sufficient, and we display all resulting groups.
         // If client-side group pagination is needed, this logic changes significantly.
         // For simplicity, let's assume API pagination gives enough raw items that after grouping and filtering,
         // the number of groups is manageable per "page" of raw items.
         // The `apiResponse.totalItems` is total RAW items, not total groups.

         if (currentDisplayedGroups.length === 0) {
             let message = `No ${tabMappings[activeResultsTab].typeFilter || 'content'} found`;
             if (currentState.searchTerm) message += ` matching "${sanitize(currentState.searchTerm)}"`;
             if (currentState.qualityFilter) message += ` with quality "${sanitize(currentState.qualityFilter)}"`;
             message += '.';
             gridContainer.innerHTML = `<div class="status-message grid-status-message">${message}</div>`;
         } else {
             currentDisplayedGroups.forEach((group) => {
                 const groupGridItemElement = createGroupGridItemHTML(group);
                 fragment.appendChild(groupGridItemElement);
             });
             gridContainer.appendChild(fragment);
         }

         // Pagination controls: This is tricky. API paginates raw files. We display groups.
         // If one API page of 50 files results in 5 groups, and next page also 5 groups,
         // the pagination should reflect the API's pages of raw files.
         renderPaginationControls(pagination, apiResponse.totalItems, apiResponse.page, apiResponse.totalPages);

         updateActiveTabAndPanel();
         if (tableHead) updateSortIndicators(tableHead); // If sort indicators are still used visually
         updateFilterIndicator();
     }

    function renderPaginationControls(targetContainer, totalRawItems, currentRawPage, totalRawPages) {
        if (!targetContainer) return;
        if (totalRawItems === 0 || totalRawPages <= 1) {
            targetContainer.innerHTML = '';
            targetContainer.style.display = 'none';
            return;
        }
        targetContainer.dataset.totalPages = totalRawPages; // Store total pages of RAW items
        targetContainer.innerHTML = '';
        let paginationHTML = '';
        const maxPagesToShow = 5;
        const halfPages = Math.floor(maxPagesToShow / 2);

        paginationHTML += `<button onclick="changePage(${currentRawPage - 1})" ${currentRawPage === 1 ? 'disabled title="First page"' : 'title="Previous page"'}>« Prev</button>`;
        let startPage, endPage;
        if (totalRawPages <= maxPagesToShow + 2) {
            startPage = 1; endPage = totalRawPages;
        } else {
            startPage = Math.max(2, currentRawPage - halfPages);
            endPage = Math.min(totalRawPages - 1, currentRawPage + halfPages);
            if (currentRawPage - halfPages < 2) { endPage = Math.min(totalRawPages - 1, maxPagesToShow); }
            if (currentRawPage + halfPages > totalRawPages - 1) { startPage = Math.max(2, totalRawPages - maxPagesToShow + 1); }
        }

        if (startPage > 1) {
            paginationHTML += `<button onclick="changePage(1)" title="Page 1">1</button>`;
            if (startPage > 2) { paginationHTML += `<span class="page-info" title="Skipped pages">...</span>`; }
        }
        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += (i === currentRawPage) ? `<span class="current-page">${i}</span>` : `<button onclick="changePage(${i})" title="Page ${i}">${i}</button>`;
        }
        if (endPage < totalRawPages) {
            if (endPage < totalRawPages - 1) { paginationHTML += `<span class="page-info" title="Skipped pages">...</span>`; }
            paginationHTML += `<button onclick="changePage(${totalRawPages})" title="Page ${totalRawPages}">${totalRawPages}</button>`;
        }
        paginationHTML += `<button onclick="changePage(${currentRawPage + 1})" ${currentRawPage === totalRawPages ? 'disabled title="Last page"' : 'title="Next page"'}>Next »</button>`;
        targetContainer.innerHTML = paginationHTML;
        targetContainer.style.display = 'block';
    }

    function updateSortIndicators(tableHeadElement) { if (!tableHeadElement) return; tableHeadElement.querySelectorAll('th.sortable').forEach(th => { th.classList.remove('sort-asc', 'sort-desc'); const sortKey = th.dataset.sortKey; if (sortKey === currentState.sortColumn) { const directionClass = currentState.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc'; th.classList.add(directionClass); th.setAttribute('aria-sort', currentState.sortDirection === 'asc' ? 'ascending' : 'descending'); } else { th.removeAttribute('aria-sort'); } }); }
    function updateFilterIndicator() { if(qualityFilterSelect) { qualityFilterSelect.classList.toggle('filter-active', !!currentState.qualityFilter); } }
    function updateActiveTabAndPanel() { Object.keys(tabMappings).forEach(tabId => { const mapping = tabMappings[tabId]; const isActive = tabId === activeResultsTab; if (mapping?.button) mapping.button.classList.toggle('active', isActive); if (mapping?.panel) mapping.panel.classList.toggle('active', isActive); }); }

    // --- Pagination and Tab Switching ---
    window.changePage = function(newPage) { // newPage is for raw items
        if (currentViewMode !== 'search' || newPage < 1 || newPage === currentState.currentPage) { return; }
        const currentPagination = tabMappings[activeResultsTab]?.pagination;
        if(currentPagination && currentPagination.dataset.totalPages) {
            const totalP = parseInt(currentPagination.dataset.totalPages, 10);
            if(newPage > totalP) { return; }
        }
        currentState.currentPage = newPage; // This is page of raw items
        closePlayerIfNeeded(null);
        fetchAndRenderResults().then(() => {
            const activeGridContainer = tabMappings[activeResultsTab]?.gridContainer;
            scrollToTopOfActiveGrid(activeGridContainer);
        });
        saveStateToLocalStorage();
    }
    function scrollToTopOfActiveGrid(gridContainerElement) {
        if (!gridContainerElement) return;
        let stickyHeaderHeight = 0;
        if (container.classList.contains('results-active')) {
            const searchBarArea = container.querySelector('#search-focus-area');
            const backButtonElem = resultsArea.querySelector('#backToHomeButtonResults');
            const filterAreaElem = resultsArea.querySelector('.results-filter-area');
            const tabNavElem = resultsArea.querySelector('.tab-navigation');
            stickyHeaderHeight = (searchBarArea?.offsetHeight || 0) +
                                 (backButtonElem?.offsetHeight || 0) +
                                 (backButtonElem ? parseFloat(getComputedStyle(backButtonElem).marginBottom) : 0) +
                                 (filterAreaElem?.offsetHeight || 0) +
                                 (tabNavElem?.offsetHeight || 0);
        }
        const elementTop = gridContainerElement.getBoundingClientRect().top + window.pageYOffset;
        const scrollPosition = elementTop - stickyHeaderHeight - 20;
        window.scrollTo({ top: scrollPosition, behavior: 'smooth' });
    }
    window.switchTab = function(tabId) {
        if (currentViewMode !== 'search' || tabId === activeResultsTab || !tabMappings[tabId]) { return; }
        activeResultsTab = tabId;
        currentState.currentPage = 1; // Reset to page 1 of raw items for the new tab
        currentState.typeFilter = tabMappings[tabId].typeFilter;
        closePlayerIfNeeded(null);
        updateActiveTabAndPanel();
        showLoadingStateInGrids(`Loading ${tabMappings[tabId].typeFilter || 'all content'}...`);
        fetchAndRenderResults(); // This will fetch raw items based on new typeFilter
        saveStateToLocalStorage();
    }

    // --- Navigation to Group Detail View ---
    function navigateToGroupView(groupKey) {
        if (!groupKey) return;
        lastFocusedElement = document.activeElement;
        if (groupDetailAbortController) { groupDetailAbortController.abort(); groupDetailAbortController = null; }

        const newUrlParams = new URLSearchParams(window.location.search);
        newUrlParams.delete('q'); // Remove search query when navigating to a group
        newUrlParams.set('viewGroup', groupKey);
        newUrlParams.delete('fileId'); // Clear any previous fileId

        const newUrl = `${window.location.pathname}?${newUrlParams.toString()}`;
        
        try {
            history.pushState({ viewGroup: groupKey }, '', newUrl);
        } catch (e) { console.error("History pushState failed:", e); }
        
        displayGroupDetail(groupKey);
    }


    // --- Share Logic (Now shares a group, or a specific file within a group) ---
    async function handleShareClick(buttonElement) { // Now triggered per file in group detail
        const fileId = buttonElement.dataset.fileId; // original_id of the specific file
        const groupKey = buttonElement.dataset.groupKey;
        const itemTitle = buttonElement.dataset.title || "Cinema Ghar Item"; // Filename or group title
        const itemFilename = buttonElement.dataset.filename || "";

        if (!groupKey || !fileId) { alert("Cannot share: Item or Group ID missing."); return; }

        // New share URL: points to group and highlights the file
        const shareUrlParams = new URLSearchParams();
        shareUrlParams.set('viewGroup', groupKey);
        shareUrlParams.set('fileId', fileId);
        const shareUrl = `${window.location.origin}${window.location.pathname}?${shareUrlParams.toString()}`;

        const shareText = `Check out: ${itemTitle}\n${itemFilename ? `(${itemFilename})\n` : ''}`;
        const feedbackSpan = buttonElement.closest('.file-actions').querySelector('.copy-feedback.share-fallback');

        if (navigator.share) {
            try {
                await navigator.share({ title: itemTitle, text: shareText, url: shareUrl });
            } catch (error) {
                if (error.name !== 'AbortError') {
                    if (feedbackSpan) showCopyFeedback(feedbackSpan, 'Share failed!', true);
                    else alert(`Share failed: ${error.message}`);
                }
            }
        } else {
            await copyToClipboard(shareUrl, feedbackSpan);
        }
    }

    // --- Group Detail Display Logic ---
    async function displayGroupDetail(groupKey, fileIdToHighlight = null) {
        if (!groupKey || !groupDetailViewEl || !groupDetailContentEl) return;

        if (groupDetailAbortController) { groupDetailAbortController.abort(); groupDetailAbortController = null; }
        groupDetailAbortController = new AbortController();
        const signal = groupDetailAbortController.signal;

        setViewMode('groupDetail');
        groupDetailContentEl.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading group details (ID: ${sanitize(groupKey)})...</span></div>`;
        currentGroupData = null; // Clear previous group data

        // Configure back buttons
        if (backToHomeButtonGroupDetail) backToHomeButtonGroupDetail.style.display = 'inline-flex'; // Always show back to home
        if (backToResultsButtonGroupDetail) { // Show back to results if we came from search
            backToResultsButtonGroupDetail.style.display = (lastSearchTermForResults || currentState.searchTerm) ? 'inline-flex' : 'none';
        }


        try {
            let groupData = allKnownGroups.get(groupKey);

            // If group not in cache or file list is empty (e.g., from a minimal update preview), fetch its files
            if (!groupData || groupData.files.length === 0) {
                // Heuristic: Infer search term for the group's title to fetch its files.
                // This assumes the API can find files for this title.
                // This is a simplification; a more robust way would be a dedicated API endpoint to get all files for a groupKey.
                const inferredSearchTerm = groupData ? groupData.displayTitle : groupKey.split('_y')[0].replace(/_/g, ' '); // Basic inference
                console.log(`Group ${groupKey} not fully cached. Fetching files for title: "${inferredSearchTerm}"`);
                
                const params = { search: inferredSearchTerm, limit: 500 }; // Fetch many files for the title
                if (groupData && groupData.isSeries) params.type = 'series';
                else if (groupData && !groupData.isSeries) params.type = 'movies';

                const apiResponse = await fetchApiData(params, signal);
                if (signal.aborted) return;

                if (apiResponse && apiResponse.items && apiResponse.items.length > 0) {
                    const preprocessedItems = apiResponse.items.map(preprocessMovieData);
                    const tempGrouped = groupItems(preprocessedItems); // Re-group fetched items
                    const foundGroup = tempGrouped.find(g => g.groupKey === groupKey);
                    if (foundGroup) {
                        groupData = foundGroup;
                        allKnownGroups.set(groupKey, groupData); // Update cache
                    } else {
                         // If after fetching by title, the specific groupKey is still not found.
                        console.warn(`Could not re-locate group ${groupKey} after fetching files for "${inferredSearchTerm}". Using existing minimal data or failing.`);
                        if (!groupData) throw new Error(`Group ${groupKey} could not be found or constructed.`);
                    }
                } else if (!groupData) { // No groupData from cache and API returned nothing
                     throw new Error(`No files found for group ${groupKey} (title: ${inferredSearchTerm}).`);
                }
                // If groupData existed minimally from cache, and API returned no *new* files, we proceed with cached files.
            }
            if (signal.aborted) return;

            currentGroupData = groupData;
            document.title = `${currentGroupData.displayTitle || 'Group Detail'} - Cinema Ghar`;

            // Fetch full TMDb details for the group if not already present or only partial
            if (!currentGroupData.tmdbDetails || !currentGroupData.tmdbDetails.genres) {
                const tmdbQuery = new URLSearchParams();
                tmdbQuery.set('query', currentGroupData.displayTitle);
                tmdbQuery.set('type', currentGroupData.isSeries ? 'tv' : 'movie');
                if (!currentGroupData.isSeries && currentGroupData.year) tmdbQuery.set('year', currentGroupData.year);
                
                // Fetch full details including cast, genres for detail view
                tmdbQuery.set('fetchFullDetails', 'true');
                const tmdbUrl = `${config.TMDB_API_PROXY_URL}?${tmdbQuery.toString()}`;

                const tmdbController = new AbortController();
                const tmdbTimeoutId = setTimeout(() => tmdbController.abort(), config.TMDB_FETCH_TIMEOUT);
                try {
                    const tmdbResponse = await fetch(tmdbUrl, { signal: tmdbController.signal });
                    clearTimeout(tmdbTimeoutId);
                    if (tmdbResponse.ok) {
                        const fullTmdbData = await tmdbResponse.json();
                        // Merge with existing tmdbDetails, prioritizing new full data
                        currentGroupData.tmdbDetails = { ...(currentGroupData.tmdbDetails || {}), ...fullTmdbData };
                        allKnownGroups.set(groupKey, currentGroupData); // Update cache with full TMDb
                    }
                } catch (tmdbError) {
                    clearTimeout(tmdbTimeoutId);
                    if (tmdbError.name !== 'AbortError') console.error("Error fetching full TMDb details for group detail view:", tmdbError);
                }
            }
            if (signal.aborted) return;

            // Render the group detail content
            renderGroupDetailContent(currentGroupData, fileIdToHighlight);
            if (videoContainer) videoContainer.style.display = 'none'; // Ensure player is hidden initially

        } catch (error) {
            if (signal.aborted || error.name === 'AbortError') {
                console.log(`Group detail fetch aborted for key: ${groupKey}.`);
            } else {
                groupDetailContentEl.innerHTML = `<div class="error-message" role="alert">Error loading group details for <strong>${sanitize(groupKey)}</strong>: ${sanitize(error.message)}.</div>`;
                document.title = "Error Loading Group - Cinema Ghar";
                currentGroupData = null;
            }
        } finally {
            if (groupDetailAbortController && groupDetailAbortController.signal === signal && !signal.aborted) {
                groupDetailAbortController = null;
            }
            if (groupDetailContentEl.innerHTML && !groupDetailContentEl.querySelector('.loading-inline-spinner')) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            if (pageLoader && pageLoader.style.display !== 'none') {
                pageLoader.style.display = 'none';
            }
        }
    }

    function renderGroupDetailContent(groupData, fileIdToHighlight = null) {
        if (!groupDetailContentEl || !groupData) return;

        let tmdbSectionHTML = '';
        if (groupData.tmdbDetails && groupData.tmdbDetails.id) {
            const tmdb = groupData.tmdbDetails;
            const posterHTML = tmdb.posterPath ? `<img src="${sanitize(tmdb.posterPath)}" alt="Poster for ${sanitize(tmdb.title)}" class="tmdb-poster" loading="lazy">` : '<div class="tmdb-poster-placeholder">No Poster</div>';
            const ratingHTML = tmdb.voteAverage && tmdb.voteCount ? `<span class="tmdb-rating" title="${tmdb.voteCount} votes">⭐ ${sanitize(tmdb.voteAverage)}/10</span>` : '';
            const genresHTML = tmdb.genres && tmdb.genres.length > 0 ? `<div class="tmdb-genres"><strong>Genres:</strong> ${tmdb.genres.map(g => `<span class="genre-tag">${sanitize(g)}</span>`).join(' ')}</div>` : '';
            const overviewHTML = tmdb.overview ? `<div class="tmdb-overview"><strong>Overview:</strong><p>${sanitize(tmdb.overview)}</p></div>` : '';
            const releaseDateText = tmdb.releaseDate ? TimeAgo.formatFullDate(new Date(tmdb.releaseDate), true) : 'N/A';
            const releaseDateHTML = `<div><strong>Released:</strong> ${sanitize(releaseDateText)}</div>`;
            const runtimeHTML = tmdb.runtime ? `<div><strong>Runtime:</strong> ${sanitize(tmdb.runtime)} min</div>` : '';
            const taglineHTML = tmdb.tagline ? `<div class="tmdb-tagline"><em>${sanitize(tmdb.tagline)}</em></div>` : '';
            const actorsHTML = tmdb.actors && tmdb.actors.length > 0 ? `<div class="tmdb-actors"><strong>Starring:</strong><ul>${tmdb.actors.map(actor => `<li>${sanitize(actor.name)} ${actor.character ? `(${sanitize(actor.character)})` : ''}</li>`).join('')}</ul></div>` : '';
            
            let ytSearchTerms = [groupData.displayTitle];
            if (groupData.isSeries && groupData.season) ytSearchTerms.push(`Season ${groupData.season}`);
            else if (!groupData.isSeries && groupData.year) ytSearchTerms.push(String(groupData.year));
            ytSearchTerms.push("Official Trailer");
            const youtubeSearchQuery = encodeURIComponent(ytSearchTerms.join(' '));
            const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${youtubeSearchQuery}`;
            const youtubeIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M21.582,6.186c-0.23-0.86-0.908-1.538-1.768-1.768C18.267,4,12,4,12,4S5.733,4,4.186,4.418 c-0.86,0.23-1.538,0.908-1.768,1.768C2,7.734,2,12,2,12s0,4.266,0.418,5.814c0.23,0.86,0.908,1.538,1.768,1.768 C5.733,20,12,20,12,20s6.267,0,7.814-0.418c0.861-0.23,1.538-0.908,1.768-1.768C22,16.266,22,12,22,12S22,7.734,21.582,6.186z M10,15.464V8.536L16,12L10,15.464z"></path></svg>`;
            const youtubeTrailerButtonHTML = `<a href="${youtubeSearchUrl}" target="_blank" rel="noopener noreferrer" class="button youtube-button">${youtubeIconSVG} Watch Trailer</a>`;
            
            const infoIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"></path></svg>`;
            const tmdbLinkButtonHTML = `<a href="${sanitize(tmdb.tmdbLink)}" target="_blank" rel="noopener noreferrer" class="button tmdb-link-button">${infoIconSVG} View on TMDb</a>`;


            tmdbSectionHTML = `
                <div class="tmdb-details-container">
                    <div class="tmdb-poster-column">${posterHTML}</div>
                    <div class="tmdb-info-column">
                        <h3 class="tmdb-title">${sanitize(tmdb.title || groupData.displayTitle)}</h3>
                        ${taglineHTML}
                        <div class="tmdb-meta">${ratingHTML}${releaseDateHTML}${runtimeHTML}</div>
                        ${genresHTML}
                        ${overviewHTML}
                        <div class="action-buttons-container group-meta-actions">${youtubeTrailerButtonHTML}${tmdbLinkButtonHTML}</div>
                        ${actorsHTML}
                    </div>
                </div>`;
        } else if (groupData.displayTitle && !groupData.tmdbDetails) {
             tmdbSectionHTML = `<div class="tmdb-fetch-failed">Could not fetch additional details from TMDb for ${sanitize(groupData.displayTitle)}.</div>`;
        }

        let filesListHTML = '<div class="files-list-container"><h4>Available Files:</h4><ul>';
        if (groupData.files && groupData.files.length > 0) {
            groupData.files.forEach(file => {
                filesListHTML += createGroupDetailFileListItemHTML(file, groupData);
            });
        } else {
            filesListHTML += '<li>No individual files found for this group.</li>';
        }
        filesListHTML += '</ul></div>';

        // Placeholder for player related custom URL input, which is now inside the player itself
        // We still need a button to *trigger* showing the player with the custom URL input section
        const playerCustomUrlTriggerHTML = `<button class="button custom-url-toggle-button" data-action="toggle-custom-url-player" aria-expanded="false" style="display: inline-flex; margin-top: 15px;"><span aria-hidden="true">🔗</span> Play Custom URL in Player</button>`;


        groupDetailContentEl.innerHTML = `${tmdbSectionHTML}<hr class="detail-separator">${filesListHTML}${playerCustomUrlTriggerHTML}`;
        
        // Add the video container at the end of groupDetailContentEl (or a specific place)
        // It will be hidden until a video is played.
        if (videoContainer.parentElement !== groupDetailContentEl) {
            groupDetailContentEl.appendChild(videoContainer);
        }


        if (fileIdToHighlight) {
            const fileElement = groupDetailContentEl.querySelector(`.file-item[data-file-id="${sanitize(fileIdToHighlight)}"]`);
            if (fileElement) {
                setTimeout(() => {
                    fileElement.scrollIntoView({ behavior: 'auto', block: 'center' });
                    fileElement.classList.add('highlighted-file'); // Add a class for styling
                    setTimeout(() => fileElement.classList.remove('highlighted-file'), 2500);
                }, 200);
            }
        }
    }

    function createGroupDetailFileListItemHTML(file, groupData) {
        const displayFilename = file.displayFilename;
        const displaySize = file.sizeData.display;
        const displayQuality = file.displayQuality;
        // Use file's specific extracted title OR filename as stream title basis
        const streamTitleBase = file.extractedTitle || displayFilename.split(/[\.\(\[]/)[0].replace(/[_ ]+/g, ' ').trim();
        const streamTitle = streamTitleBase + (displayQuality !== 'N/A' ? ` (${displayQuality})` : '');

        const timestampString = file.last_updated_ts;
        const formattedDateRelative = TimeAgo.format(timestampString);

        let hdrLogoHtml = ''; let fourkLogoHtml = '';
        const lowerFilename = (displayFilename || '').toLowerCase();
        if (displayQuality === '4K' || lowerFilename.includes('2160p') || lowerFilename.includes('.4k.')) { fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo fourk-logo" title="4K Ultra HD" />`; }
        if ((displayQuality || '').includes('HDR') || (displayQuality || '').includes('DOLBY VISION') || displayQuality === 'DV' || lowerFilename.includes('hdr') || lowerFilename.includes('dolby.vision') || lowerFilename.includes('.dv.')) { hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo hdr-logo" title="HDR / Dolby Vision Content" />`; }

        const escapedStreamTitle = streamTitle.replace(/'/g, "\\'");
        const escapedFilename = displayFilename.replace(/'/g, "\\'");
        const escapedUrl = file.url ? file.url.replace(/'/g, "\\'") : '';
        const escapedFileId = file.id ? String(file.id).replace(/[^a-zA-Z0-9-_]/g, '') : ''; // file.id is original_id
        const escapedGroupKey = groupData.groupKey.replace(/'/g, "\\'");
        const escapedHubcloudUrl = file.hubcloud_link ? file.hubcloud_link.replace(/'/g, "\\'") : '';
        const escapedGdflixUrl = file.gdflix_link ? file.gdflix_link.replace(/'/g, "\\'") : '';

        let fileActionButtonsHTML = '<div class="file-actions">';
        if (file.url) {
            fileActionButtonsHTML += `<button class="button play-button" data-action="play-file" data-file-id="${escapedFileId}" data-title="${escapedStreamTitle}" data-url="${escapedUrl}" data-filename="${escapedFilename}"><span aria-hidden="true">▶️</span> Play</button>`;
            fileActionButtonsHTML += `<a class="button download-button" href="${file.url}" download="${displayFilename}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">💾</span> Download</a>`;
            fileActionButtonsHTML += `<button class="button vlc-button" data-action="copy-vlc-file" data-file-id="${escapedFileId}" data-url="${escapedUrl}"><span aria-hidden="true">📋</span> Copy URL</button><span class="copy-feedback" role="status" aria-live="polite"></span>`;
            if (navigator.userAgent.toLowerCase().includes("android")) {
                fileActionButtonsHTML += `<button class="button intent-button" data-action="open-intent-file" data-file-id="${escapedFileId}" data-url="${escapedUrl}"><span aria-hidden="true">📱</span> Play External</button>`;
            }
        }
        // Pass file.id as data-file-id for bypass context
        if (file.hubcloud_link) { fileActionButtonsHTML += `<button class="button hubcloud-bypass-button" data-action="bypass-hubcloud-file" data-file-id="${escapedFileId}" data-hubcloud-url="${escapedHubcloudUrl}"><span aria-hidden="true" class="button-icon">☁️</span><span class="button-spinner spinner"></span><span class="button-text">Bypass HubCloud</span></button><span class="bypass-feedback" role="status" aria-live="polite"></span>`; }
        if (file.gdflix_link) { fileActionButtonsHTML += `<button class="button gdflix-bypass-button" data-action="bypass-gdflix-file" data-file-id="${escapedFileId}" data-gdflix-url="${escapedGdflixUrl}"><span aria-hidden="true" class="button-icon">🎬</span><span class="button-spinner spinner"></span><span class="button-text">Bypass GDFLIX</span></button><span class="bypass-feedback" role="status" aria-live="polite"></span>`; }
        
        // Share button specific to this file, using its ID and the group key
        fileActionButtonsHTML += `<button class="button share-button" data-action="share-file" data-file-id="${escapedFileId}" data-group-key="${escapedGroupKey}" data-title="${escapedStreamTitle}" data-filename="${escapedFilename}"><span aria-hidden="true">🔗</span> Share File</button><span class="copy-feedback share-fallback" role="status" aria-live="polite">Link copied!</span>`;
        
        // Other direct links if present on the file object
        if (file.telegram_link) { fileActionButtonsHTML += `<a class="button telegram-button" href="${sanitize(file.telegram_link)}" target="_blank" rel="noopener noreferrer">Telegram File</a>`; }
        // ... add other specific link types like filepress, gdtot if they are per-file properties

        fileActionButtonsHTML += '</div>'; // End .file-actions

        return `
            <li class="file-item" data-file-id="${escapedFileId}">
                <div class="file-info">
                    <span class="file-name" title="${displayFilename}">${displayFilename}</span>
                    <span class="file-meta">
                        Quality: ${displayQuality} ${fourkLogoHtml}${hdrLogoHtml} | Size: ${displaySize} | Lang: ${sanitize(file.languages || 'N/A')} | Updated: ${formattedDateRelative}
                    </span>
                </div>
                ${fileActionButtonsHTML}
            </li>`;
    }

    // Called when a bypass succeeds for a file within a group, needs to update that specific file's data
    function updateFileInGroupAfterBypass(fileId, encodedFinalUrl) {
        if (!currentGroupData || !groupDetailContentEl) return;
        const fileIndex = currentGroupData.files.findIndex(f => String(f.id) === String(fileId));
        if (fileIndex === -1) return;

        currentGroupData.files[fileIndex].url = encodedFinalUrl; // Update the specific file's URL
        currentGroupData.files[fileIndex].hubcloud_link = null; // Clear bypass link as it's resolved
        currentGroupData.files[fileIndex].gdflix_link = null;

        // Re-render just that list item for efficiency, or re-render the whole list if simpler
        const fileListItem = groupDetailContentEl.querySelector(`.file-item[data-file-id="${sanitize(fileId)}"]`);
        if (fileListItem) {
            const newListItemHTML = createGroupDetailFileListItemHTML(currentGroupData.files[fileIndex], currentGroupData);
            fileListItem.outerHTML = newListItemHTML; // Replace the old item
            const newPlayButton = groupDetailContentEl.querySelector(`.file-item[data-file-id="${sanitize(fileId)}"] .play-button`);
            if(newPlayButton) setTimeout(() => newPlayButton.focus(), 50);
        }

        // If player was trying to play this file and failed, this bypass might enable it
        // Potentially, auto-play if the context is right (e.g., user just clicked bypass then play)
    }


    // --- Player Logic (largely same, but context of calling changes) ---
    function streamVideo(title, url, filenameForAudioCheck, isFromCustom = false) {
        // The videoContainer is now expected to be a child of groupDetailContentEl
        if (!videoContainer || !videoElement || !groupDetailContentEl || !groupDetailContentEl.contains(videoContainer)) {
            console.error("Video player or its container not correctly set up in Group Detail View.");
            // If player not in DOM correctly, try to append it:
            if (videoContainer && groupDetailContentEl && !groupDetailContentEl.contains(videoContainer)) {
                groupDetailContentEl.appendChild(videoContainer);
            } else if (!videoContainer || !videoElement) {
                return; // Critical player elements missing
            }
        }

        if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none'; // Hide player's own custom URL section
        if (videoElement) videoElement.style.display = 'block';
        if (customControlsContainer) customControlsContainer.style.display = 'flex';
        if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; }
        if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; }
        clearCopyFeedback();

        // Video player is already in groupDetailContentEl or global custom mode
        if (videoElement.hasAttribute('src')) {
            videoElement.pause();
            videoElement.removeAttribute('src');
            videoElement.currentTime = 0;
            videoElement.load();
        }
        if (vlcBox) vlcBox.style.display = 'none';

        const savedVolume = localStorage.getItem(config.PLAYER_VOLUME_KEY);
        const savedSpeed = localStorage.getItem(config.PLAYER_SPEED_KEY);
        videoElement.volume = (savedVolume !== null) ? Math.max(0, Math.min(1, parseFloat(savedVolume))) : 1;
        if (volumeSlider) volumeSlider.value = videoElement.volume;
        videoElement.muted = (videoElement.volume === 0);
        videoElement.playbackRate = (savedSpeed !== null) ? parseFloat(savedSpeed) : 1;
        if(playbackSpeedSelect) playbackSpeedSelect.value = String(videoElement.playbackRate);
        updateMuteButton();
        videoElement.currentTime = 0;

        const ddp51Regex = /\bDDP?([ ._-]?5\.1)?\b/i;
        const advancedAudioRegex = /\b(DTS|ATMOS|TrueHD)\b/i;
        const multiAudioHintRegex = /\b(Multi|Dual)[ ._-]?Audio\b/i;
        let warningText = "";
        if (filenameForAudioCheck && !isFromCustom) {
            const lowerFilename = (filenameForAudioCheck || '').toLowerCase();
            if (ddp51Regex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DDP audio might not work. Use external player."; }
            else if (advancedAudioRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DTS/Atmos/TrueHD audio likely unsupported. Use external player."; }
            else if (multiAudioHintRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> May contain multiple audio tracks. Use selector below or external player."; }
        }
        if (warningText && audioWarningDiv) { audioWarningDiv.innerHTML = warningText; audioWarningDiv.style.display = 'block'; }

        if (videoTitle) videoTitle.innerText = title || "Video";
        if (vlcText) vlcText.innerText = url;
        if (vlcBox) vlcBox.style.display = 'block';

        videoElement.src = url;
        videoElement.load();
        videoElement.play().catch(e => { console.warn("Video play failed:", e); handleVideoError(e); });

        if (videoContainer.style.display === 'none') { videoContainer.style.display = 'flex'; }
        
        if (!isGlobalCustomUrlMode) {
            const closeButton = videoContainer.querySelector('.close-btn');
            if (closeButton) { setTimeout(() => closeButton.focus(), 100); }
            setTimeout(() => { videoContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150);
        }
    }
    // closePlayer, seekVideo, toggleMute, setVolume, etc., remain largely the same.
    // Ensure lastFocusedElement is handled correctly based on where play was initiated.
    window.closePlayer = function(elementToFocusAfter = null) {
        if (elementToFocusAfter instanceof Event) { elementToFocusAfter = elementToFocusAfter?.target; }
        if (!videoContainer || !videoElement) return;

        const wasGlobalMode = isGlobalCustomUrlMode;
        try {
            const fsElement = document.fullscreenElement || document.webkitFullscreenElement;
            if (fsElement && (fsElement === videoElement || fsElement === videoContainer)) {
                if (document.exitFullscreen) document.exitFullscreen();
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            }
        } catch(err) {}

        videoElement.pause();
        videoElement.removeAttribute('src');
        videoElement.currentTime = 0;
        videoElement.load();
        videoContainer.style.display = 'none';
        videoContainer.classList.remove('global-custom-url-mode', 'is-fullscreen');
        isGlobalCustomUrlMode = false;

        if (vlcBox) vlcBox.style.display = 'none';
        if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; }
        if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; }
        if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none';
        if (playerCustomUrlInput) playerCustomUrlInput.value = '';
        if (playerCustomUrlFeedback) playerCustomUrlFeedback.textContent = '';
        clearCopyFeedback(); clearBypassFeedback();
        if (videoTitle) videoTitle.innerText = '';
        
        // Don't remove videoContainer from DOM if it's meant to be part of groupDetailContentEl
        // if (videoContainer.parentElement && videoContainer.parentElement !== groupDetailContentEl && videoContainer.parentElement !== container) {
        //    videoContainer.parentElement.removeChild(videoContainer);
        // }

        if (wasGlobalMode) {
            resetToHomepage(); // Or back to wherever it was opened from if we track that
            lastFocusedElement = null;
            return;
        }

        let finalFocusTarget = elementToFocusAfter || lastFocusedElement;
        if (!wasGlobalMode && currentViewMode === 'groupDetail' && groupDetailContentEl) {
            // Try to focus the play button of the file that was playing, or the first play button.
            if (currentFileForAction && currentFileForAction.id) {
                const playedFileButton = groupDetailContentEl.querySelector(`.file-item[data-file-id="${currentFileForAction.id}"] .play-button`);
                if (playedFileButton) finalFocusTarget = playedFileButton;
            }
            if (!finalFocusTarget) {
                 const firstPlayButtonInList = groupDetailContentEl.querySelector('.file-item .play-button');
                 if (firstPlayButtonInList) finalFocusTarget = firstPlayButtonInList;
                 else {
                    const customUrlToggle = groupDetailContentEl.querySelector('.custom-url-toggle-button');
                    if (customUrlToggle) finalFocusTarget = customUrlToggle;
                    else finalFocusTarget = groupDetailContentEl; // Fallback
                 }
            }
        }
        if (finalFocusTarget && typeof finalFocusTarget.focus === 'function') {
            setTimeout(() => { try { finalFocusTarget.focus({preventScroll: true}); } catch(e) {} }, 50);
        }
        lastFocusedElement = null;
        currentFileForAction = null; // Clear the context of the last played file
    }

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
    function openWithIntent(url, title = "Video") { if (!url) return; const mime = getMimeTypeFromUrl(url); const titleEncoded = encodeURIComponent(title); const intentUri = `intent:${url}#Intent;type=${mime};action=android.intent.action.VIEW;S.title=${titleEncoded};end`; window.location.href = intentUri; }
    function copyVLCLink(buttonElement, url) { if (!url) { alert("Cannot copy: URL missing."); return; } const feedbackSpan = buttonElement.nextElementSibling; copyToClipboard(url, feedbackSpan).catch(err => { if (feedbackSpan) { feedbackSpan.classList.remove('show', 'error'); feedbackSpan.style.display = 'none'; } }); }
    function showCopyFeedback(spanElement, message = 'Copied!', isError = false) { if (!spanElement) return; clearTimeout(copyFeedbackTimeout); spanElement.textContent = message; spanElement.classList.toggle('error', isError); spanElement.classList.remove('share-fallback'); if (spanElement.classList.contains('share-fallback')) { spanElement.classList.add('share-fallback'); } spanElement.style.display = 'inline-block'; spanElement.classList.add('show'); copyFeedbackTimeout = setTimeout(() => { spanElement.classList.remove('show', 'error'); setTimeout(() => { if (!spanElement.classList.contains('show')) { spanElement.style.display = 'none'; spanElement.textContent = spanElement.classList.contains('share-fallback') ? 'Link copied!' : 'Copied!'; } }, 300); }, 2500); }
    function clearCopyFeedback() { clearTimeout(copyFeedbackTimeout); document.querySelectorAll('.copy-feedback.show').forEach(span => { span.classList.remove('show', 'error'); span.style.display = 'none'; span.textContent = span.classList.contains('share-fallback') ? 'Link copied!' : 'Copied!'; }); }
    function clearBypassFeedback() { clearTimeout(bypassFeedbackTimeout); document.querySelectorAll('.bypass-feedback.show').forEach(span => { span.classList.remove('show', 'error', 'loading'); span.style.display = 'none'; span.textContent = ''; }); }
    function highlightVlcText() { const currentVlcText = videoContainer?.querySelector('#vlcBox code'); if (currentVlcText && currentVlcText.closest('#vlcBox')?.style.display !== 'none') { try { const range = document.createRange(); range.selectNodeContents(currentVlcText); const selection = window.getSelection(); if (selection) { selection.removeAllRanges(); selection.addRange(range); } } catch (selectErr) {} } }
    function handlePlayerKeyboardShortcuts(event) { if (!videoContainer || videoContainer.style.display === 'none' || !videoElement) return; const targetTagName = event.target.tagName.toLowerCase(); if (targetTagName === 'input' || targetTagName === 'select' || targetTagName === 'textarea') return; const key = event.key; let prevented = false; switch (key) { case ' ': case 'k': togglePlayPause(); prevented = true; break; case 'ArrowLeft': seekVideo(-10); prevented = true; break; case 'ArrowRight': seekVideo(10); prevented = true; break; case 'ArrowUp': setVolume(Math.min(videoElement.volume + 0.05, 1)); if(volumeSlider) volumeSlider.value = videoElement.volume; prevented = true; break; case 'ArrowDown': setVolume(Math.max(videoElement.volume - 0.05, 0)); if(volumeSlider) volumeSlider.value = videoElement.volume; prevented = true; break; case 'm': toggleMute(); prevented = true; break; case 'f': toggleFullscreen(); prevented = true; break; } if (prevented) event.preventDefault(); }


    // --- State Persistence ---
    function saveStateToLocalStorage() { try { const stateToSave = {}; if (currentState.sortColumn !== 'lastUpdated') stateToSave.sortColumn = currentState.sortColumn; if (currentState.sortDirection !== 'desc') stateToSave.sortDirection = currentState.sortDirection; if (currentState.qualityFilter !== '') stateToSave.qualityFilter = currentState.qualityFilter; if (currentState.searchTerm !== '') stateToSave.searchTerm = currentState.searchTerm;
            if (currentViewMode === 'search') { stateToSave.viewMode = 'search'; stateToSave.activeTab = activeResultsTab; stateToSave.currentPage = currentState.currentPage; }
            else if (currentViewMode === 'groupDetail' && currentGroupData) { stateToSave.viewMode = 'groupDetail'; stateToSave.currentGroupKey = currentGroupData.groupKey; }
            else { stateToSave.viewMode = 'homepage'; }
            if (Object.keys(stateToSave).length > 0) { localStorage.setItem(config.LOCAL_STORAGE_KEY, JSON.stringify(stateToSave)); } else { localStorage.removeItem(config.LOCAL_STORAGE_KEY); } } catch (e) {} }

    function loadStateFromLocalStorage() {
        try {
            const savedState = localStorage.getItem(config.LOCAL_STORAGE_KEY);
            if (savedState) {
                const parsedState = JSON.parse(savedState);
                currentState.sortColumn = typeof parsedState.sortColumn === 'string' ? parsedState.sortColumn : 'lastUpdated';
                currentState.sortDirection = (typeof parsedState.sortDirection === 'string' && ['asc', 'desc'].includes(parsedState.sortDirection)) ? parsedState.sortDirection : 'desc';
                currentState.qualityFilter = typeof parsedState.qualityFilter === 'string' ? parsedState.qualityFilter : '';
                currentState.searchTerm = typeof parsedState.searchTerm === 'string' ? parsedState.searchTerm : '';
                lastSearchTermForResults = currentState.searchTerm; // Restore this too

                if (parsedState.viewMode === 'search' && currentState.searchTerm) {
                    currentViewMode = 'search';
                    activeResultsTab = typeof parsedState.activeTab === 'string' ? parsedState.activeTab : 'allFiles';
                    currentState.currentPage = typeof parsedState.currentPage === 'number' ? parsedState.currentPage : 1;
                    currentState.typeFilter = tabMappings[activeResultsTab]?.typeFilter || '';
                    if(searchInput) searchInput.value = currentState.searchTerm;
                } else if (parsedState.viewMode === 'groupDetail' && parsedState.currentGroupKey) {
                    // Will be handled by handleUrlChange if URL also reflects this state.
                    // For now, default to homepage and let URL params take precedence.
                    // This prevents always loading into a group detail if user closed tab there.
                    currentViewMode = 'homepage'; // Let URL drive groupDetail loading
                }
                else {
                    currentViewMode = 'homepage';
                    activeResultsTab = 'allFiles';
                    currentState.currentPage = 1;
                    currentState.typeFilter = '';
                    currentState.searchTerm = '';
                }
            } else {
                resetToDefaultState();
            }
        } catch (e) {
            localStorage.removeItem(config.LOCAL_STORAGE_KEY);
            resetToDefaultState();
        }
        currentGroupData = null;
        lastFocusedElement = null;
    }
    function resetToDefaultState() { currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc'; currentState.qualityFilter = ''; currentState.searchTerm = ''; currentState.currentPage = 1; currentState.typeFilter = ''; currentViewMode = 'homepage'; activeResultsTab = 'allFiles'; }


    // --- Initial Data Loading and Setup ---
    async function fetchApiData(params = {}, signal = null) {
        if (!params.id && searchAbortController) { // params.id is for single file fetch (legacy link handling)
            searchAbortController.abort();
        }
        let currentSignal = signal;
        if (!currentSignal && !params.id) {
            searchAbortController = new AbortController();
            currentSignal = searchAbortController.signal;
        } else if (signal) {}
        else { // params.id case, needs its own controller if no signal passed
            const tempController = new AbortController();
            currentSignal = tempController.signal;
        }

        const query = new URLSearchParams();
        if (!params.id) { // Standard list fetch
            query.set('page', params.page || currentState.currentPage);
            query.set('limit', params.limit || currentState.limit); // This limit is for raw items
            query.set('sort', params.sort || currentState.sortColumn);
            query.set('sortDir', params.sortDir || currentState.sortDirection);
            const searchTerm = params.search !== undefined ? params.search : currentState.searchTerm;
            if (searchTerm) query.set('search', searchTerm);
            const qualityFilter = params.quality !== undefined ? params.quality : currentState.qualityFilter;
            // Quality filter is complex with grouping. API fetches all, client filters groups.
            // So, don't pass qualityFilter to API if client-side group filtering is preferred.
            // For now, let's pass it, API will filter raw items.
            if (qualityFilter) query.set('quality', qualityFilter);

            const typeFilter = params.type !== undefined ? params.type : currentState.typeFilter;
            if (typeFilter) query.set('type', typeFilter);
        } else { // Fetching a single file by its original_id
            query.set('id', params.id);
        }

        const url = `${config.MOVIE_DATA_API_URL}?${query.toString()}`;
        try {
            const response = await fetch(url, { signal: currentSignal });
            if (!response.ok) { let errorBody = null; try { errorBody = await response.json(); } catch (_) {} const errorDetails = errorBody?.error || errorBody?.details || `Status: ${response.status}`; throw new Error(`API Error: ${errorDetails}`); }
            const data = await response.json();
            // Pagination data refers to raw items
            if (!params.id && tabMappings[activeResultsTab]) {
                const activePagination = tabMappings[activeResultsTab]?.pagination;
                if (activePagination && data.totalPages !== undefined) {
                    activePagination.dataset.totalPages = data.totalPages;
                }
            }
            return data;
        } catch (error) {
            if (error.name === 'AbortError') { return null; }
            throw error;
        } finally {
            if (currentSignal === searchAbortController?.signal && !signal) {
                searchAbortController = null;
            }
        }
    }

    async function fetchAndRenderResults() { // Fetches raw items, then groups and renders them
        if (currentViewMode !== 'search') return;
        try {
            const apiResponse = await fetchApiData(); // Uses currentState for params
            if (apiResponse === null) return; // Aborted
            renderActiveResultsView(apiResponse); // This function will handle grouping
            saveStateToLocalStorage();
        } catch (error) {
            if (error.name !== 'AbortError') {
                const { gridContainer } = tabMappings[activeResultsTab];
                if (gridContainer) { gridContainer.innerHTML = `<div class="error-message grid-status-message">Error loading results: ${error.message}. Please try again.</div>`; }
                Object.values(tabMappings).forEach(m => { if(m.pagination) m.pagination.style.display = 'none'; });
            }
        }
    }

    function populateQualityFilter(rawItems = []) { // Populates from unique qualities of raw items
        if (!qualityFilterSelect) return;
        const currentSelectedValue = qualityFilterSelect.value;
        // uniqueQualities set is populated by preprocessMovieData
        rawItems.forEach(item => { // Ensure it's populated from the initial large fetch too
             if (item.displayQuality && item.displayQuality !== 'N/A') { uniqueQualities.add(item.displayQuality); }
        });

        const sortedQualities = [...uniqueQualities].sort((a, b) => { const getScore = (q) => { q = String(q || '').toUpperCase().trim(); const resMatch = q.match(/^(\d{3,4})P$/); if (q === '4K' || q === '2160P') return 100; if (resMatch) return parseInt(resMatch[1], 10); if (q === '1080P') return 90; if (q === '720P') return 80; if (q === '480P') return 70; if (['WEBDL', 'BLURAY', 'BDRIP', 'BRRIP'].includes(q)) return 60; if (['WEBIP', 'HDTV', 'HDRIP'].includes(q)) return 50; if (['DVD', 'DVDRIP'].includes(q)) return 40; if (['DVDSCR', 'HC', 'HDCAM', 'TC', 'TS', 'CAM'].includes(q)) return 30; if (['HDR', 'DOLBY VISION', 'DV', 'HEVC', 'X265'].includes(q)) return 20; return 0; }; const scoreA = getScore(a); const scoreB = getScore(b); if (scoreA !== scoreB) return scoreB - scoreA; return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' }); });
        while (qualityFilterSelect.options.length > 1) { qualityFilterSelect.remove(1); }
        sortedQualities.forEach(quality => { if (quality && quality !== 'N/A') { const option = document.createElement('option'); option.value = quality; option.textContent = quality; qualityFilterSelect.appendChild(option); } });
        qualityFilterSelect.value = [...qualityFilterSelect.options].some(opt => opt.value === currentSelectedValue) ? currentSelectedValue : "";
        updateFilterIndicator();
    }

    function displayLoadError(message) { const errorHtml = `<div class="error-container" role="alert">${sanitize(message)}</div>`; if (searchFocusArea) searchFocusArea.innerHTML = ''; searchFocusArea.style.display = 'none'; if (resultsArea) resultsArea.innerHTML = ''; resultsArea.style.display = 'none'; if (updatesPreviewSection) updatesPreviewSection.innerHTML = ''; updatesPreviewSection.style.display = 'none'; if (groupDetailContentEl) groupDetailContentEl.innerHTML = ''; if (groupDetailViewEl) groupDetailViewEl.style.display = 'none'; if (pageFooter) pageFooter.style.display = 'none'; container.classList.remove('results-active', 'item-detail-active'); if (mainErrorArea) { mainErrorArea.innerHTML = errorHtml; } else if (container) { container.insertAdjacentHTML('afterbegin', errorHtml); } if (pageLoader) pageLoader.style.display = 'none'; }

    async function initializeApp() {
        isInitialLoad = true; // Set early
        if (pageLoader) pageLoader.style.display = 'flex';
        loadStateFromLocalStorage(); // Sets currentViewMode, currentState.searchTerm etc.

        if (qualityFilterSelect) {
            qualityFilterSelect.value = currentState.qualityFilter || '';
            updateFilterIndicator();
        }
        
        // Fetch suggestion data (raw filenames) and initial items for updates/qualities
        // This large fetch is for populating suggestions and getting a base for qualities/updates
        try {
            const initialDataLimit = Math.max(500, config.UPDATES_PREVIEW_INITIAL_COUNT * 5); // Fetch a good number of recent items
            const initialApiData = await fetchApiData({ limit: initialDataLimit, sort: 'lastUpdated', sortDir: 'desc' });
            if (initialApiData === null && !searchAbortController?.signal.aborted) { /* Aborted by subsequent action perhaps */ }
            else if (initialApiData && initialApiData.items) {
                const preprocessedInitialItems = initialApiData.items.map(preprocessMovieData);
                localSuggestionData = preprocessedInitialItems; // For search suggestions
                populateQualityFilter(preprocessedInitialItems); // Populate quality filter from these items

                // If on homepage, load updates preview (which will use its own fetch or this data)
                if (currentViewMode === 'homepage' || (isInitialLoad && !currentState.searchTerm && !new URLSearchParams(window.location.search).has('viewGroup'))) {
                     // The loadUpdatesPreview will fetch its own data for groups
                     // or could be optimized to use preprocessedInitialItems if logic allows.
                     // For now, let it fetch fresh as its grouping needs are specific.
                     await loadUpdatesPreview();
                }
            } else {
                // Handle case where initial data fetch fails but not catastrophically for whole app
                if (currentViewMode === 'homepage' && updatesPreviewList && !updatesPreviewList.hasChildNodes()) {
                    updatesPreviewList.innerHTML = '<div class="status-message grid-status-message">Could not load initial data for updates.</div>';
                }
                populateQualityFilter([]); // Populate with empty if fetch failed
            }
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.error("Error during initial data fetch for suggestions/updates:", e);
                if (currentViewMode === 'homepage' && updatesPreviewList && !updatesPreviewList.hasChildNodes()) {
                    updatesPreviewList.innerHTML = `<div class="error-message grid-status-message">Error loading initial data: ${e.message}.</div>`;
                }
                 populateQualityFilter([]);
            }
        }

        // URL change handling should determine final view (homepage, search, or groupDetail)
        // It will also trigger fetches if needed (e.g., for search results or group details)
        handleUrlChange();

        // If, after handleUrlChange, we are in search mode (e.g. from URL param 'q'),
        // and results haven't been fetched yet by handleUrlChange itself.
        if (currentViewMode === 'search' && currentState.searchTerm && allFilesGridContainer.querySelector('.loading-message')) {
             if(searchInput) searchInput.value = currentState.searchTerm;
             showLoadingStateInGrids(`Loading search results for "${sanitize(currentState.searchTerm)}"...`);
             fetchAndRenderResults();
        }

        // isInitialLoad = false; // Moved to end of handleUrlChange to ensure it's false after first full render cycle
        if (currentViewMode !== 'groupDetail' && !pageLoader.hidden) { // Check if loader is not already hidden
             if (pageLoader && pageLoader.style.display !== 'none') pageLoader.style.display = 'none';
        }
    }


    // --- Event Handling Setup ---
    function handleContentClick(event) {
         const target = event.target;
         // Grid item click (navigates to Group Detail)
         const groupGridItemTrigger = target.closest('.grid-item, .update-item');
         if (groupGridItemTrigger) {
             event.preventDefault();
             const groupKey = groupGridItemTrigger.dataset.groupKey;
             if (groupKey) {
                 navigateToGroupView(groupKey);
             } else {
                 console.error("Could not find groupKey for grid item navigation.");
             }
             return;
         }

         // Actions within Group Detail View (for specific files)
         if (target.closest('#item-detail-content')) { // item-detail-content is now groupDetailContentEl
             handleGroupDetailActionClick(event);
             return;
         }

         if (target.matches('.close-btn') && target.closest('#videoContainer')) {
              event.preventDefault(); lastFocusedElement = target; closePlayer(lastFocusedElement); return;
          }

         if (target.closest('th.sortable')) { // For sorting raw items before grouping
             handleSort(event);
             return;
         }
    }

    function handleGroupDetailActionClick(event) {
        const button = event.target.closest('.button');
        if (!button || !currentGroupData) return; // Action must be on a button within a group context

        const action = button.dataset.action;
        const fileId = button.dataset.fileId; // original_id of the file
        
        // Find the specific file object
        currentFileForAction = fileId ? currentGroupData.files.find(f => String(f.id) === String(fileId)) : null;
        if (action && action.endsWith('-file') && !currentFileForAction) {
            console.warn(`Action ${action} requires a file context, but file ${fileId} not found in current group.`);
            return;
        }
        
        lastFocusedElement = button; // Store focused element

        switch (action) {
            case 'play-file':
                if (currentFileForAction && currentFileForAction.url) {
                    event.preventDefault();
                    streamVideo(button.dataset.title, currentFileForAction.url, button.dataset.filename);
                }
                break;
            case 'copy-vlc-file':
                if (currentFileForAction && currentFileForAction.url) {
                    event.preventDefault();
                    copyVLCLink(button, currentFileForAction.url);
                }
                break;
            case 'open-intent-file':
                if (currentFileForAction && currentFileForAction.url) {
                    event.preventDefault();
                    openWithIntent(currentFileForAction.url, button.dataset.title);
                }
                break;
            case 'share-file':
                event.preventDefault();
                handleShareClick(button); // Passes the button element which has all needed data attributes
                break;
            case 'bypass-hubcloud-file':
                if (currentFileForAction && currentFileForAction.hubcloud_link) {
                    event.preventDefault();
                    triggerHubCloudBypassForFile(button, currentFileForAction);
                }
                break;
            case 'bypass-gdflix-file':
                if (currentFileForAction && currentFileForAction.gdflix_link) {
                    event.preventDefault();
                    triggerGDFLIXBypassForFile(button, currentFileForAction);
                }
                break;
            case 'toggle-custom-url-player': // Button in group detail to open player's custom URL input
                 event.preventDefault();
                 toggleCustomUrlInputInPlayer(button);
                 break;
            default:
                // Allow default browser action for actual <a> links if not handled above (e.g., download, external site)
                if (button.tagName === 'A' && button.href && button.target === '_blank') {
                    // Do nothing, let browser handle
                } else if (button.tagName === 'BUTTON') {
                    // event.preventDefault(); // Prevent if it's a button with no specific JS action yet
                }
                break;
        }
    }

    function handleGlobalCustomUrlClick(event) { event.preventDefault(); lastFocusedElement = event.target; if (!container || !videoContainer || !playerCustomUrlSection || !playerCustomUrlInput) return; closePlayerIfNeeded(null); if (videoContainer.parentElement !== container) { if (videoContainer.parentElement) { videoContainer.parentElement.removeChild(videoContainer); } container.appendChild(videoContainer); } else { if (!container.contains(videoContainer)) { container.appendChild(videoContainer); } } if(resultsArea) resultsArea.style.display = 'none'; if(groupDetailViewEl) groupDetailViewEl.style.display = 'none'; if(searchFocusArea) searchFocusArea.style.display = 'none'; if(pageFooter) pageFooter.style.display = 'none'; isGlobalCustomUrlMode = true; videoContainer.classList.add('global-custom-url-mode'); if (videoElement) videoElement.style.display = 'none'; if (customControlsContainer) customControlsContainer.style.display = 'none'; if (videoTitle) videoTitle.innerText = 'Play Custom URL'; if (vlcBox) vlcBox.style.display = 'none'; if (audioWarningDiv) audioWarningDiv.style.display = 'none'; playerCustomUrlSection.style.display = 'flex'; if (playerCustomUrlInput) playerCustomUrlInput.value = ''; if (playerCustomUrlFeedback) playerCustomUrlFeedback.textContent = ''; videoContainer.style.display = 'flex'; if (playerCustomUrlInput) { setTimeout(() => playerCustomUrlInput.focus(), 50); } }
    function handleGlobalPlayCustomUrl(event) { event.preventDefault(); if (!playerCustomUrlInput || !playerCustomUrlFeedback) return; const customUrlRaw = playerCustomUrlInput.value.trim(); playerCustomUrlFeedback.textContent = ''; if (!customUrlRaw) { playerCustomUrlFeedback.textContent = 'Please enter a URL.'; playerCustomUrlInput.focus(); return; } let customUrlEncoded = customUrlRaw; try { new URL(customUrlRaw); customUrlEncoded = customUrlRaw.replace(/ /g, '%20'); } catch (e) { playerCustomUrlFeedback.textContent = 'Invalid URL format.'; playerCustomUrlInput.focus(); return; } if(playerCustomUrlSection) playerCustomUrlSection.style.display = 'none'; if(videoElement) videoElement.style.display = 'block'; if(customControlsContainer) customControlsContainer.style.display = 'flex'; streamVideo("Custom URL Video", customUrlEncoded, null, true); }

    // Toggles the custom URL input section *within* the video player itself
    function toggleCustomUrlInputInPlayer(toggleButton, triggeredByError = false) {
        if (!videoContainer || !playerCustomUrlSection || !videoElement || !customControlsContainer) return;

        // Ensure video player is visible (it should be if this button is clicked from within group detail)
        if (videoContainer.style.display === 'none') {
            videoContainer.style.display = 'flex';
             // If player was hidden, and we are opening custom URL, ensure video element is hidden initially
            if (videoElement) videoElement.style.display = 'none';
            if (customControlsContainer) customControlsContainer.style.display = 'none';
        }


        const isHidden = playerCustomUrlSection.style.display === 'none';
        playerCustomUrlSection.style.display = isHidden ? 'flex' : 'none';

        // When custom URL input is shown, hide the main video element and its controls
        if (videoElement) videoElement.style.display = isHidden ? 'none' : 'block';
        if (customControlsContainer) customControlsContainer.style.display = isHidden ? 'none' : 'flex';
        if (vlcBox) vlcBox.style.display = isHidden ? 'none' : (videoElement.src ? 'block' : 'none'); // Show VLC box only if a video is loaded

        // Handle audio warning visibility
        if(audioWarningDiv) {
            if (isHidden && audioWarningDiv.style.display !== 'none' && !audioWarningDiv.innerHTML.includes('Playback Error:')) {
                // If opening custom URL section, and no critical error, hide normal audio warning
                audioWarningDiv.style.display = 'none';
            } else if (!isHidden && audioWarningDiv.style.display === 'none' && videoElement.src) {
                // If closing custom URL section (back to video), re-evaluate audio warning for the current video
                 const currentVidFilename = currentFileForAction ? currentFileForAction.displayFilename : null;
                 if (currentVidFilename) {
                    const ddp51Regex = /\bDDP?([ ._-]?5\.1)?\b/i; const advAudioRegex = /\b(DTS|ATMOS|TrueHD)\b/i; const multiAudioRegex = /\b(Multi|Dual)[ ._-]?Audio\b/i;
                    let warnTxt = ""; const lFn = currentVidFilename.toLowerCase();
                    if (ddp51Regex.test(lFn)) warnTxt = "<strong>Audio Note:</strong> DDP audio might not work.";
                    else if (advAudioRegex.test(lFn)) warnTxt = "<strong>Audio Note:</strong> DTS/Atmos/TrueHD audio likely unsupported.";
                    else if (multiAudioRegex.test(lFn)) warnTxt = "<strong>Audio Note:</strong> May contain multiple audio tracks.";
                    if(warnTxt) { audioWarningDiv.innerHTML = warnTxt; audioWarningDiv.style.display = 'block'; }
                 }
            }
        }

        toggleButton.setAttribute('aria-expanded', String(isHidden));
        toggleButton.innerHTML = isHidden ? '<span aria-hidden="true">🔼</span> Hide Custom URL Input' : '<span aria-hidden="true">🔗</span> Play Custom URL in Player';

        if (isHidden && !triggeredByError) { // If custom URL section is now shown
            if (playerCustomUrlInput) setTimeout(() => playerCustomUrlInput.focus(), 50);
            if (videoTitle && !isGlobalCustomUrlMode) videoTitle.innerText = "Play Custom URL";
        } else if (!isHidden) { // If custom URL section is now hidden (back to video)
            setTimeout(() => toggleButton.focus(), 50);
             if (videoTitle && currentFileForAction && !isGlobalCustomUrlMode) videoTitle.innerText = currentFileForAction.displayFilename; // Restore original title
        }
        
        setTimeout(() => { videoContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150);
    }

    // Plays from the custom URL input *within the player section*
    function playFromCustomUrlInputInPlayer(playButton) {
        const container = playButton.closest('#playerCustomUrlSection');
        if (!container) return;
        const inputField = container.querySelector('#playerCustomUrlInput');
        const feedbackSpan = container.querySelector('.player-custom-url-feedback');

        if (!inputField || !feedbackSpan) return;
        const customUrlRaw = inputField.value.trim();
        feedbackSpan.textContent = '';
        if (!customUrlRaw) { feedbackSpan.textContent = 'Please enter a URL.'; inputField.focus(); return; }

        let customUrlEncoded = customUrlRaw;
        try { new URL(customUrlRaw); customUrlEncoded = customUrlRaw.replace(/ /g, '%20'); }
        catch (e) { feedbackSpan.textContent = 'Invalid URL format.'; inputField.focus(); return; }

        isGlobalCustomUrlMode = false; // This is playing within the group detail context, not global overlay
        // Hide the custom URL input section, show video element and controls
        if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none';
        if (videoElement) videoElement.style.display = 'block';
        if (customControlsContainer) customControlsContainer.style.display = 'flex';
        
        streamVideo("Custom URL Video", customUrlEncoded, null, true); // true for isFromCustom
    }


    // --- HubCloud/GDFLIX Bypass Logic (for specific files within a group) ---
    async function triggerHubCloudBypassForFile(buttonElement, file) {
        const hubcloudUrl = file.hubcloud_link;
        if (!hubcloudUrl) { setBypassButtonState(buttonElement, 'error', 'Missing URL'); return; }
        if (!file || !file.id) { setBypassButtonState(buttonElement, 'error', 'Context Error'); return; }

        setBypassButtonState(buttonElement, 'loading');
        const apiController = new AbortController();
        const timeoutId = setTimeout(() => { apiController.abort(); setBypassButtonState(buttonElement, 'error', 'Timeout'); }, config.BYPASS_TIMEOUT);
        try {
            const response = await fetch(config.BYPASS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hubcloudUrl }), signal: apiController.signal });
            clearTimeout(timeoutId);
            if (!response.ok) { let errorDetails = `HTTP Error: ${response.status}`; try { errorDetails = (await response.json()).details || errorDetails; } catch (_) {} throw new Error(errorDetails); }
            const result = await response.json();
            if (result.success && result.finalUrl) {
                const encodedFinalUrl = result.finalUrl.replace(/ /g, '%20');
                setBypassButtonState(buttonElement, 'success', 'Success!');
                updateFileInGroupAfterBypass(file.id, encodedFinalUrl);
            } else { throw new Error(result.details || result.error || 'Unknown HubCloud bypass failure'); }
        } catch (error) { clearTimeout(timeoutId); if (error.name === 'AbortError' && !apiController.signal.aborted) { setBypassButtonState(buttonElement, 'error', 'Timeout'); } else if (error.name === 'AbortError') { setBypassButtonState(buttonElement, 'idle'); } else { setBypassButtonState(buttonElement, 'error', `Failed: ${error.message.substring(0, 50)}`); } }
    }
    async function triggerGDFLIXBypassForFile(buttonElement, file) {
        const gdflixUrl = file.gdflix_link;
        if (!gdflixUrl) { setBypassButtonState(buttonElement, 'error', 'Missing URL'); return; }
        if (!file || !file.id) { setBypassButtonState(buttonElement, 'error', 'Context Error'); return; }

        setBypassButtonState(buttonElement, 'loading');
        const apiController = new AbortController();
        const timeoutId = setTimeout(() => { apiController.abort(); setBypassButtonState(buttonElement, 'error', 'Timeout'); }, config.BYPASS_TIMEOUT);
        try {
            const response = await fetch(config.GDFLIX_BYPASS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gdflixUrl }), signal: apiController.signal });
            clearTimeout(timeoutId);
            if (!response.ok) { let errorDetails = `HTTP Error: ${response.status}`; try { errorDetails = (await response.json()).error || errorDetails; } catch (_) {} throw new Error(errorDetails); }
            const result = await response.json();
            if (result.success && result.finalUrl) {
                const encodedFinalUrl = result.finalUrl.replace(/ /g, '%20');
                setBypassButtonState(buttonElement, 'success', 'Success!');
                updateFileInGroupAfterBypass(file.id, encodedFinalUrl);
            } else { throw new Error(result.error || 'Unknown GDFLIX bypass failure'); }
        } catch (error) { clearTimeout(timeoutId); if (error.name === 'AbortError' && !apiController.signal.aborted) { setBypassButtonState(buttonElement, 'error', 'Timeout'); } else if (error.name === 'AbortError') { setBypassButtonState(buttonElement, 'idle'); } else { setBypassButtonState(buttonElement, 'error', `Failed: ${error.message.substring(0, 50)}`); } }
    }

    function setBypassButtonState(buttonElement, state, message = null) { if (!buttonElement) return; const feedbackSpan = buttonElement.nextElementSibling; const iconSpan = buttonElement.querySelector('.button-icon'); const spinnerSpan = buttonElement.querySelector('.button-spinner'); const textSpan = buttonElement.querySelector('.button-text'); const isHubCloud = buttonElement.classList.contains('hubcloud-bypass-button'); const defaultText = isHubCloud ? 'Bypass HubCloud' : 'Bypass GDFLIX'; const defaultIconHTML = isHubCloud ? '☁️' : '🎬'; buttonElement.classList.remove('loading', 'error', 'success'); buttonElement.disabled = false; if (feedbackSpan) { feedbackSpan.style.display = 'none'; feedbackSpan.className = 'bypass-feedback'; } if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; clearTimeout(bypassFeedbackTimeout); switch (state) { case 'loading': buttonElement.classList.add('loading'); buttonElement.disabled = true; if (textSpan) textSpan.textContent = 'Bypassing...'; if (spinnerSpan) spinnerSpan.style.display = 'inline-block'; if (iconSpan) iconSpan.style.display = 'none'; if (feedbackSpan) { feedbackSpan.textContent = 'Please wait...'; feedbackSpan.classList.add('loading', 'show'); feedbackSpan.style.display = 'inline-block'; } break; case 'success': buttonElement.classList.add('success'); buttonElement.disabled = true; if (textSpan) textSpan.textContent = 'Success!'; if (iconSpan) iconSpan.innerHTML = '✅'; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.textContent = message || 'Success!'; feedbackSpan.classList.add('success', 'show'); feedbackSpan.style.display = 'inline-block'; } break; case 'error': buttonElement.classList.add('error'); buttonElement.disabled = false; if (textSpan) textSpan.textContent = defaultText; if (iconSpan) iconSpan.innerHTML = defaultIconHTML; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.textContent = message || 'Failed'; feedbackSpan.classList.add('error', 'show'); feedbackSpan.style.display = 'inline-block'; bypassFeedbackTimeout = setTimeout(() => { if (feedbackSpan.classList.contains('show')) { feedbackSpan.classList.remove('show', 'error', 'loading'); feedbackSpan.style.display = 'none'; feedbackSpan.textContent = ''; } }, 4000); } break; case 'idle': default: buttonElement.disabled = false; if (textSpan) textSpan.textContent = defaultText; if (iconSpan) iconSpan.innerHTML = defaultIconHTML; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.classList.remove('show', 'error', 'loading'); feedbackSpan.style.display = 'none'; feedbackSpan.textContent = ''; } break; } }

    // --- Add Event Listeners ---
    document.addEventListener('DOMContentLoaded', async () => {
         await initializeApp(); // This will now also handle initial URL parsing

         if (searchInput) { searchInput.addEventListener('input', handleSearchInput); searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSearchSubmit(); } else if (event.key === 'Escape') { suggestionsContainer.style.display = 'none'; } }); searchInput.addEventListener('search', handleSearchClear); searchInput.addEventListener('blur', () => { setTimeout(() => { const searchButton = document.getElementById('searchSubmitButton'); if (document.activeElement !== searchInput && !suggestionsContainer.contains(document.activeElement) && document.activeElement !== searchButton) { suggestionsContainer.style.display = 'none'; } }, 150); }); }
         if (qualityFilterSelect) { qualityFilterSelect.addEventListener('change', triggerFilterChange); }

         if (container) { container.addEventListener('click', handleContentClick); }

         if (playCustomUrlGlobalButton) { playCustomUrlGlobalButton.addEventListener('click', handleGlobalCustomUrlClick); }
         
         // Listener for "Play from Input" button within the player's custom URL section
         if (playerPlayCustomUrlButton) {
            playerPlayCustomUrlButton.addEventListener('click', (event) => {
                event.preventDefault();
                lastFocusedElement = event.target;
                if (isGlobalCustomUrlMode) {
                    handleGlobalPlayCustomUrl(event);
                } else { // Assumes it's the custom URL input within the regular player (in group detail)
                    playFromCustomUrlInputInPlayer(event.target);
                }
            });
         }


         document.addEventListener('keydown', handlePlayerKeyboardShortcuts);
         document.addEventListener('click', (event) => {
            if (searchInput && suggestionsContainer && suggestionsContainer.style.display === 'block') { const searchWrapper = searchInput.closest('.search-input-wrapper'); if (searchWrapper && !searchWrapper.contains(event.target)) { suggestionsContainer.style.display = 'none'; } }
            // Close player if click is outside, similar logic to before
            if (videoContainer && videoContainer.style.display !== 'none') {
                const clickedInsidePlayer = videoContainer.contains(event.target);
                let clickedOnPotentialTrigger = false;

                if (isGlobalCustomUrlMode) {
                    clickedOnPotentialTrigger = playCustomUrlGlobalButton && playCustomUrlGlobalButton.contains(event.target);
                } else if (currentViewMode === 'groupDetail' && groupDetailContentEl) {
                    // Check if click was on a play button or custom URL toggle within group detail
                     clickedOnPotentialTrigger = groupDetailContentEl.contains(event.target) &&
                        (event.target.closest('.play-button') || event.target.closest('.custom-url-toggle-button'));
                }

                if (!clickedInsidePlayer && !clickedOnPotentialTrigger) {
                    closePlayer(event.target);
                }
            }
         }, false);

         if(videoElement) { videoElement.addEventListener('volumechange', () => { if (volumeSlider && Math.abs(parseFloat(volumeSlider.value) - videoElement.volume) > 0.01) { volumeSlider.value = videoElement.volume; } updateMuteButton(); try { localStorage.setItem(config.PLAYER_VOLUME_KEY, String(videoElement.volume)); } catch (e) {} }); videoElement.addEventListener('ratechange', () => { if(playbackSpeedSelect && playbackSpeedSelect.value !== String(videoElement.playbackRate)) { playbackSpeedSelect.value = String(videoElement.playbackRate); } try { localStorage.setItem(config.PLAYER_SPEED_KEY, String(videoElement.playbackRate)); } catch (e) {} }); videoElement.addEventListener('loadedmetadata', populateAudioTrackSelector); videoElement.removeEventListener('error', handleVideoError); videoElement.addEventListener('error', handleVideoError); }
         document.addEventListener('fullscreenchange', handleFullscreenChange); document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
     });

})();
// --- END OF script.js ---
