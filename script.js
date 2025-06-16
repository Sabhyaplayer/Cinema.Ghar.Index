// --- START OF script.js (MODIFIED FOR GROUPING, GRID VIEW, GROUP DETAIL VIEW + TRAILER EMBED + CLICK-TO-REVEAL ACTIONS + NEW FILTERS) ---
(function() {
    'use strict';

    // ===========================================================
    // JAVASCRIPT SECTION (Restructured for Movie/Series Grouping)
    // ===========================================================
    const config = {
        HDR_LOGO_URL: "https://as1.ftcdn.net/v2/jpg/05/32/83/72/1000_F_532837228_v8CGZRU0jy39uCtqFRnJz6xDntrGuLLx.webp",
        FOURK_LOGO_URL: "https://i.pinimg.com/736x/85/c4/b0/85c4b0a2fb8612825d0cd2f53460925f.jpg",
        ITEMS_PER_PAGE: 50,
        LOCAL_STORAGE_KEY: 'cinemaGharState_v19_filters_ui', // Incremented version
        PLAYER_VOLUME_KEY: 'cinemaGharPlayerVolume',
        PLAYER_SPEED_KEY: 'cinemaGharPlayerSpeed',
        SEARCH_DEBOUNCE_DELAY: 300,
        SUGGESTIONS_DEBOUNCE_DELAY: 250,
        MAX_SUGGESTIONS: 50,
        UPDATES_PREVIEW_INITIAL_COUNT: 12,
        UPDATES_PREVIEW_LOAD_MORE_COUNT: 12,
        MOVIE_DATA_API_URL: '/api/movies', // Replace with your actual API endpoint
        BYPASS_API_URL: 'https://hubcloud-bypass.onrender.com/api/hubcloud', // Replace if needed
        GDFLIX_BYPASS_API_URL: '/api/gdflix',
        BYPASS_TIMEOUT: 60000,
        TMDB_API_PROXY_URL: '/api/tmdb', // Replace with your actual TMDb proxy
        TMDB_FETCH_TIMEOUT: 15000,
        POSTER_PLACEHOLDER_URL: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'%3E%3Crect width='2' height='3' fill='%23e9ecef'/%3E%3C/svg%3E"
    };

    // --- DOM Element References ---
    const container = document.getElementById('cinemaghar-container');
    const pageLoader = document.getElementById('page-loader');
    const searchFocusArea = document.getElementById('search-focus-area');
    const resultsArea = document.getElementById('results-area');
    const groupDetailViewEl = document.getElementById('item-detail-view');
    const groupDetailContentEl = document.getElementById('item-detail-content');
    const searchInput = document.getElementById('mainSearchInput');
    const suggestionsContainer = document.getElementById('searchInputSuggestions');
    const qualityFilterSelect = document.getElementById('globalQualityFilterSelect'); // New global filter
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
    const allFilesGridContainer = document.getElementById('allFilesGridContainer');
    const moviesGridContainer = document.getElementById('moviesGridContainer');
    const seriesGridContainer = document.getElementById('seriesGridContainer');
    const allFilesPaginationControls = document.getElementById('allFilesPaginationControls');
    const moviesPaginationControls = document.getElementById('moviesPaginationControls');
    const seriesPaginationControls = document.getElementById('seriesPaginationControls');
    const backToHomeButtonResults = document.getElementById('backToHomeButtonResults');
    const backToHomeButtonGroupDetail = document.getElementById('backToHomeButtonShared');
    const backToResultsButtonGroupDetail = document.getElementById('backToResultsButton');
    const pageFooter = document.getElementById('page-footer');
    const playerCustomUrlSection = document.getElementById('playerCustomUrlSection');
    const playerCustomUrlInput = document.getElementById('playerCustomUrlInput');
    const playerPlayCustomUrlButton = document.getElementById('playerPlayCustomUrlButton');
    const playerCustomUrlFeedback = playerCustomUrlSection?.querySelector('.player-custom-url-feedback');
    const playCustomUrlGlobalButton = document.getElementById('playCustomUrlGlobalButton');

    // --- State Variables ---
    let localSuggestionData = [];
    let currentFetchedItems = [];
    let currentDisplayedGroups = [];
    let allKnownGroups = new Map();
    let weeklyUpdatesGroups = [];
    let currentGroupData = null;
    let currentFileForAction = null;
    let updatesPreviewShownCount = 0;
    let uniqueQualities = new Set(); // For populating quality filters
    let copyFeedbackTimeout;
    let bypassFeedbackTimeout;
    let suggestionDebounceTimeout;
    let searchAbortController = null;
    let groupDetailAbortController = null;
    let isInitialLoad = true;
    let currentViewMode = 'homepage';
    let activeResultsTab = 'allFiles';
    let lastFocusedElement = null;
    let isGlobalCustomUrlMode = false;
    let lastSearchTermForResults = '';

    let currentState = {
        searchTerm: '',
        qualityFilter: '', // Global quality filter
        typeFilter: '', // 'movies', 'series', or ''
        sortColumn: 'lastUpdated',
        sortDirection: 'desc',
        currentPage: 1,
        limit: config.ITEMS_PER_PAGE,
    };

    const tabMappings = {
        allFiles: { button: document.getElementById('allFilesTabButton'), panel: document.getElementById('allFilesTabPanel'), gridContainer: allFilesGridContainer, pagination: allFilesPaginationControls, typeFilter: '' },
        movies: { button: document.getElementById('moviesTabButton'), panel: document.getElementById('moviesTabPanel'), gridContainer: moviesGridContainer, pagination: moviesPaginationControls, typeFilter: 'movies' },
        series: { button: document.getElementById('seriesTabButton'), panel: document.getElementById('seriesTabPanel'), gridContainer: seriesGridContainer, pagination: seriesPaginationControls, typeFilter: 'series' }
    };

    // --- Utility Functions ---
    const sanitize = (str) => { if (str === null || typeof str === 'undefined') return ""; const temp = document.createElement('div'); temp.textContent = String(str); return temp.innerHTML; };
    const TimeAgo = { MINUTE: 60, HOUR: 3600, DAY: 86400, WEEK: 604800, MONTH: 2592000, YEAR: 31536000, format: (isoString) => { if (!isoString) return 'N/A'; try { const date = new Date(isoString); const seconds = Math.floor((new Date() - date) / 1000); if (isNaN(seconds) || seconds < 0) { return TimeAgo.formatFullDate(date); } if (seconds < 2) return "just now"; if (seconds < TimeAgo.MINUTE) return `${seconds} sec${seconds > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.HOUR) return `${Math.floor(seconds / TimeAgo.MINUTE)} min${Math.floor(seconds / TimeAgo.MINUTE) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY) return `${Math.floor(seconds / TimeAgo.HOUR)} hr${Math.floor(seconds / TimeAgo.HOUR) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY * 2) return "Yesterday"; if (seconds < TimeAgo.WEEK) return `${Math.floor(seconds / TimeAgo.DAY)} days ago`; if (seconds < TimeAgo.MONTH) return `${Math.floor(seconds / TimeAgo.WEEK)} wk${Math.floor(seconds / TimeAgo.WEEK) > 1 ? 's' : ''} ago`; return TimeAgo.formatFullDate(date, true); } catch (e) { return 'Invalid Date'; } }, formatFullDate: (date, short = false) => { if (!(date instanceof Date) || isNaN(date.getTime())) return 'Invalid Date'; const optsDate = short ? { year: '2-digit', month: 'numeric', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }; const optsTime = { hour: 'numeric', minute: '2-digit', hour12: true }; try { return `${date.toLocaleDateString(undefined, optsDate)}${short ? '' : ', ' + date.toLocaleTimeString(undefined, optsTime)}`; } catch (e) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; } } };
    function extractSizeData(inputString) { if (!inputString) return { value: 0, unit: '', display: 'N/A', bytes: 0 }; const r = /(?<size>[\d.]+)\s?(?<unit>GB|MB)/i; const m = String(inputString).match(r); if (m?.groups?.size && m?.groups?.unit) { const value = parseFloat(m.groups.size); const unit = m.groups.unit.toUpperCase(); if (!isNaN(value)) { const bytes = unit === 'GB' ? value * 1024 * 1024 * 1024 : value * 1024 * 1024; return { value: value, unit: unit, display: `${value} ${unit}`, bytes: isNaN(bytes) ? 0 : bytes }; } } return { value: 0, unit: '', display: 'N/A', bytes: 0 }; }
    function getMimeTypeFromUrl(url) { if (!url) return 'video/*'; const m = url.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/); if (!m) return 'video/*'; const ext = m[1].toLowerCase(); const mimeMap = { 'mkv': 'video/x-matroska', 'mp4': 'video/mp4', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo', 'webm': 'video/webm', 'wmv': 'video/x-ms-wmv', 'flv': 'video/x-flv', 'ts': 'video/mp2t', 'm4v': 'video/x-m4v', 'ogv': 'video/ogg' }; return mimeMap[ext] || 'video/*'; }
    function handleVideoError(event) { console.error("HTML5 Video Error:", event, videoElement?.error); let msg = "An unknown error occurred while trying to play the video."; if (videoElement?.error) { switch (videoElement.error.code) { case MediaError.MEDIA_ERR_ABORTED: msg = 'Playback was aborted.'; break; case MediaError.MEDIA_ERR_NETWORK: msg = 'A network error caused the video download to fail.'; break; case MediaError.MEDIA_ERR_DECODE: msg = 'Video decoding error (unsupported codec or corrupt file?).'; break; case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = 'Video format not supported or server/network failed.'; break; default: msg = `An unknown video error occurred (Code: ${videoElement.error.code}).`; break; } } if (audioWarningDiv) { audioWarningDiv.innerHTML = `<strong>Playback Error:</strong> ${sanitize(msg)} <br>Consider using 'Copy URL' with an external player (VLC/MX), 'Play in VLC or MX Player' (Android), or the 'Play Custom URL' option below.`; audioWarningDiv.style.display = 'block'; }
        const customUrlToggleButtonInPlayer = videoContainer.querySelector('.custom-url-toggle-button');
        if (customUrlToggleButtonInPlayer) {
            customUrlToggleButtonInPlayer.style.display = 'inline-flex';
            if (playerCustomUrlSection && playerCustomUrlSection.style.display === 'none') {
                toggleCustomUrlInputInPlayer(customUrlToggleButtonInPlayer, true);
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
        processed.id = movie.original_id;
        
        let rawUrl = (movie.url && typeof movie.url === 'string' && movie.url.toLowerCase() !== 'null' && movie.url.trim() !== '') ? movie.url.trim() : null;
        if (rawUrl) {
            try {
                const urlObject = new URL(rawUrl);
                let href = urlObject.href;
                href = href.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
                href = href.replace(/\+/g, '%2B');
                processed.url = href;
            } catch (e) {
                console.warn("Error constructing URL object or encoding, falling back for:", rawUrl, e);
                let fallbackUrl = rawUrl.replace(/ /g, '%20'); 
                fallbackUrl = encodeURI(fallbackUrl); 
                fallbackUrl = fallbackUrl.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
                fallbackUrl = fallbackUrl.replace(/\+/g, '%2B');
                processed.url = fallbackUrl;
            }
        } else {
            processed.url = null;
        }

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
        processed.tmdbDetails = movie.tmdbDetails || null;

        const filenameForParsing = processed.displayFilename;
        if (filenameForParsing) {
            let cleanedName = filenameForParsing;
            const qualityTagsRegex = /(\b(4k|2160p|1080p|720p|480p|web-?dl|webrip|bluray|bdrip|brrip|hdtv|hdrip|dvdrip|dvdscr|hdcam|hc|tc|ts|cam|hdr|dv|dolby.?vision|hevc|x265)\b)/gi;
            cleanedName = cleanedName.replace(qualityTagsRegex, '');
            
            const seasonMatch = cleanedName.match(/[. (_-](S(\d{1,2}))(?:E\d{1,2}(?![Pp])|[. (_-])/i) || cleanedName.match(/[. (_-](Season[. _]?(\d{1,2}))(?:[. (_]|$)/i);
            
            if (seasonMatch && (seasonMatch[2] || seasonMatch[3])) {
                processed.extractedSeason = parseInt(seasonMatch[2] || seasonMatch[3], 10);
                if (!processed.isSeries) processed.isSeries = true;
                const titleEndIndex = seasonMatch.index;
                let titleFromFileName = cleanedName.substring(0, titleEndIndex).replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();

                const yearAtEndRegex = /(?:^|\s|[._(-])(19\d{2}|20\d{2})$/i; 
                const yearMatchInTitle = titleFromFileName.match(yearAtEndRegex);

                if (yearMatchInTitle && yearMatchInTitle[1]) {
                    const potentialYear = parseInt(yearMatchInTitle[1], 10);
                    if (potentialYear > 1900 && potentialYear < 2050) {
                        processed.extractedYear = potentialYear;
                        let yearPartOriginalString = yearMatchInTitle[0]; 
                        let yearPartStartIndex = titleFromFileName.lastIndexOf(yearPartOriginalString);
                        
                        if (yearPartStartIndex !== -1) {
                             processed.extractedTitle = titleFromFileName.substring(0, yearPartStartIndex).trim();
                        } else { 
                             processed.extractedTitle = titleFromFileName.replace(new RegExp(escapeRegExp(yearMatchInTitle[1]) + "$"), "").trim();
                        }
                    } else { 
                        processed.extractedTitle = titleFromFileName; 
                    }
                } else { 
                    processed.extractedTitle = titleFromFileName; 
                }
                if (processed.extractedTitle) {
                    processed.extractedTitle = processed.extractedTitle.replace(/[._\-( ]+$/, "").trim();
                }

            } else { 
                if (processed.isSeries === true && !seasonMatch) { /* keep isSeries */ }
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
                    const potentialYearFromTitle = parseInt(processed.extractedTitle, 10);
                    if (potentialYearFromTitle > 1900 && potentialYearFromTitle < 2050) {
                        processed.extractedYear = potentialYearFromTitle;
                        let tempTitleCandidate = filenameForParsing.split(new RegExp(escapeRegExp(processed.extractedTitle)))[0];
                        if (tempTitleCandidate && tempTitleCandidate !== filenameForParsing) {
                             processed.extractedTitle = tempTitleCandidate.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[- ]+$/, '').trim();
                        } else {
                            processed.extractedTitle = null; 
                        }
                    }
                 } else if (/^\d{4}$/.test(processed.extractedTitle) && processed.extractedYear && !processed.isSeries) {
                     // It's likely a movie title that is just a year, like "1917". Keep the title.
                 }
            }
        }
        if (!processed.extractedTitle && processed.displayFilename) {
             processed.extractedTitle = processed.displayFilename.split(/[\.\(\[]/)[0].replace(/[_ ]+/g, ' ').trim();
        }
        return processed;
    }

    // --- Item Grouping Logic ---
    function getGroupKey(item) {
        if (!item.extractedTitle) return `__nogroup_${item.id}`;
        let key = item.extractedTitle.toLowerCase().replace(/\s+/g, '_');
        if (item.isSeries) {
            // For series, the group key is generally just the title. Season is handled within the group.
            // If we want season-specific groups shown in search results, this would change.
            // For now, group detail handles season navigation if multiple seasons exist under the same title.
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
                    year: item.extractedYear, // This might be first air year for series
                    isSeries: item.isSeries,
                    // seasons: item.isSeries ? new Set() : null, // If we want to track all seasons for a series group
                    files: [],
                    tmdbDetails: null, // Will be fetched on demand
                    posterPathFetchAttempted: false,
                    posterPathFetchFailed: false,
                    lastUpdatedTimestamp: 0,
                });
            }
            const group = groups.get(groupKey);
            group.files.push(item);
            // If series, we might want to store the season for this specific file's group representation
            // For now, group.season will be set if all files in group are from same season, or for display logic.
            // The main series group might not have a single 'season' if it aggregates all seasons.
            if (item.isSeries && item.extractedSeason && (!group.season || group.season === item.extractedSeason)) {
                group.season = item.extractedSeason; // If a group is season-specific
            }

            if (item.lastUpdatedTimestamp > group.lastUpdatedTimestamp) {
                group.lastUpdatedTimestamp = item.lastUpdatedTimestamp;
            }
        });

        groups.forEach(group => {
            group.files.sort((a, b) => {
                // Sort by season first if it's a series group with multiple seasons' files
                if (group.isSeries && a.extractedSeason && b.extractedSeason && a.extractedSeason !== b.extractedSeason) {
                    return a.extractedSeason - b.extractedSeason;
                }
                const qualityComparison = (b.displayQuality || '').localeCompare(a.displayQuality || '');
                if (qualityComparison !== 0) return qualityComparison;
                return (a.displayFilename || '').localeCompare(b.displayFilename || '');
            });
            group.qualities = [...new Set(group.files.map(f => f.displayQuality).filter(q => q && q !== 'N/A'))];
        });
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
        // For grid view, if it's a series and has a specific season associated (e.g. from "Recently Added"), show it.
        // Otherwise, show the group's primary year (could be first air year for series).
        if (group.isSeries && group.season) {
            yearTextContent = `Season ${group.season}`;
        } else if (group.year) { // This applies to movies and series (as first air year)
            yearTextContent = String(group.year);
        }
        if (yearEl) yearEl.textContent = yearTextContent;
        fallbackContent.style.display = 'flex';
    }

    function createGroupGridItemHTML(group) {
        const card = document.createElement('div');
        card.className = 'grid-item';
        card.dataset.groupKey = sanitize(group.groupKey);
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        // For Aria label, be more specific if it's a series with a season context for this grid item
        let baseTitleForAria = group.displayTitle + (group.year ? ` (${group.year})` : '');
        if (group.isSeries && group.season) { // If this grid item represents a specific season
            baseTitleForAria += ` Season ${group.season}`;
        }
        card.setAttribute('aria-label', `View details for ${sanitize(baseTitleForAria)}`);

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
        
        let displayCardTitle = group.displayTitle;
        let displayCardSubtitle = ''; // For the visual text on the card
        if (group.isSeries && group.season) { // If this grid item contextually represents a season
            displayCardSubtitle = `Season ${group.season}`;
        } else if (group.year) { // General year for movies or series (first air)
            displayCardSubtitle = String(group.year);
        }


        card.innerHTML = `
            <div class="poster-container">
                <img src="${config.POSTER_PLACEHOLDER_URL}" alt="Poster for ${sanitize(group.displayTitle)}" class="poster-image" loading="lazy">
                <div class="poster-fallback-content" style="display: none;">
                    <h3 class="fallback-title">${sanitize(displayCardTitle)}</h3>
                    <p class="fallback-year">${sanitize(displayCardSubtitle)}</p>
                </div>
                <div class="poster-spinner spinner" style="display: ${initialSpinnerDisplay};"></div>
                <div class="quality-badges-overlay">${fileCountBadge}${fourkLogoHtml}${hdrLogoHtml}</div>
            </div>
        `;
        const posterContainer = card.querySelector('.poster-container');
        const imgElement = posterContainer.querySelector('.poster-image');
        const spinnerElement = posterContainer.querySelector('.poster-spinner');
        
        const fallbackTitleEl = posterContainer.querySelector('.poster-fallback-content .fallback-title');
        const fallbackYearEl = posterContainer.querySelector('.poster-fallback-content .fallback-year');
        if(fallbackTitleEl) fallbackTitleEl.textContent = displayCardTitle;
        if(fallbackYearEl) fallbackYearEl.textContent = displayCardSubtitle;

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
        } else {
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
        if (group.posterPathFetchAttempted) {
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
        imgElement.style.display = 'block'; 
        if (fallbackContentElement) fallbackContentElement.style.display = 'none'; 
        group.posterPathFetchAttempted = true;

        try {
            const tmdbQuery = new URLSearchParams();
            tmdbQuery.set('query', group.displayTitle);
            tmdbQuery.set('type', group.isSeries ? 'tv' : 'movie');
            // For series, TMDb search is better with first_air_date_year if available for the series overall.
            // For movies, year is good.
            // If group.season exists, it means this specific grid item might be for a particular season,
            // but the TMDb search for the *series poster* should still use the series' overall first air year if known.
            if (!group.isSeries && group.year) { 
                tmdbQuery.set('year', group.year);
            } else if (group.isSeries && group.year) { // group.year here could be the first_air_year of the series
                 tmdbQuery.set('first_air_date_year', group.year);
            }
            const tmdbUrl = `${config.TMDB_API_PROXY_URL}?${tmdbQuery.toString()}&fetchFullDetails=false`;
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
            if(allKnownGroups.has(group.groupKey)) {
                allKnownGroups.set(group.groupKey, {...allKnownGroups.get(group.groupKey), ...group});
            }
        }
    }

    // --- View Control ---
    async function setViewMode(mode) {
        console.log(`Setting view mode to: ${mode}`);
        const previousMode = currentViewMode;
        currentViewMode = mode;
        if (mode !== previousMode) { closePlayerIfNeeded(null); }
        container.classList.toggle('results-active', mode === 'search');
        container.classList.toggle('item-detail-active', mode === 'groupDetail');
        const showHomepage = mode === 'homepage';
        const showSearch = mode === 'search';
        const showGroupDetail = mode === 'groupDetail';
        if (searchFocusArea) searchFocusArea.style.display = (showHomepage || showSearch) ? 'flex' : 'none';
        if (resultsArea) resultsArea.style.display = showSearch ? 'block' : 'none';
        if (groupDetailViewEl) groupDetailViewEl.style.display = showGroupDetail ? 'block' : 'none';
        if (pageFooter) pageFooter.style.display = (showHomepage || showSearch) ? 'flex' : 'none';
    
        if (showHomepage) {
            if (searchInput) searchInput.value = '';
            currentState.searchTerm = '';
            if (suggestionsContainer) suggestionsContainer.style.display = 'none';
            activeResultsTab = 'allFiles'; currentState.currentPage = 1; currentState.typeFilter = '';
            currentState.qualityFilter = ''; // Reset global quality filter on homepage
            if (qualityFilterSelect) qualityFilterSelect.value = ''; updateFilterIndicator();

            if (updatesPreviewSection) updatesPreviewSection.style.display = 'block';

            if (weeklyUpdatesGroups.length === 0) {
                await loadUpdatesPreview(); 
            } else if (updatesPreviewList && (!updatesPreviewList.querySelector('.grid-item') && !updatesPreviewList.querySelector('.update-item'))) {
                displayInitialUpdates();
            }
            if (showMoreUpdatesButton) {
                 if (weeklyUpdatesGroups.length > 0 && weeklyUpdatesGroups.length > updatesPreviewShownCount && updatesPreviewShownCount > 0) {
                    showMoreUpdatesButton.style.display = 'block';
                 } else {
                    showMoreUpdatesButton.style.display = 'none';
                 }
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
            if (updatesPreviewSection) updatesPreviewSection.style.display = 'none';
            // Ensure quality filter dropdown reflects current state when entering search view
            if (qualityFilterSelect) qualityFilterSelect.value = currentState.qualityFilter;
            updateFilterIndicator();
        }
        if (!isInitialLoad) { saveStateToLocalStorage(); } 
    }
    window.resetToHomepage = async function(event) { 
        if (window.history.pushState) { const cleanUrl = window.location.origin + window.location.pathname; if (window.location.search !== '') { window.history.pushState({ path: cleanUrl }, '', cleanUrl); } }
        currentGroupData = null;
        if (groupDetailAbortController) { groupDetailAbortController.abort(); groupDetailAbortController = null; }
        lastFocusedElement = event?.target;
        await setViewMode('homepage');
        if (searchInput) { setTimeout(() => searchInput.focus(), 100); }
    }
    window.goBackToResults = function() { 
        currentGroupData = null;
        if (groupDetailAbortController) { groupDetailAbortController.abort(); groupDetailAbortController = null; }
        if (currentState.searchTerm || lastSearchTermForResults) {
            const urlParams = new URLSearchParams(window.location.search);
            urlParams.delete('viewGroup');
            urlParams.delete('fileId'); // Also remove fileId if present
            if (lastSearchTermForResults && !urlParams.has('q')) urlParams.set('q', lastSearchTermForResults);
            // Ensure quality filter from state is in URL if it was active
            if (currentState.qualityFilter && !urlParams.has('quality')) urlParams.set('quality', currentState.qualityFilter);
            else if (!currentState.qualityFilter) urlParams.delete('quality');

            const newQuery = urlParams.toString();
            const targetUrl = window.location.pathname + (newQuery ? `?${newQuery}` : '');
            history.pushState({}, '', targetUrl);
            handleUrlChange(true); 
        } else {
            history.back(); 
        }
    }
    window.addEventListener('popstate', (event) => { handleUrlChange(true); }); 

    async function handleUrlChange(isPopState = false) { 
        if (groupDetailAbortController) { groupDetailAbortController.abort(); groupDetailAbortController = null; }
        const urlParams = new URLSearchParams(window.location.search);
        const groupKey = urlParams.get('viewGroup');
        const fileIdToOpen = urlParams.get('fileId');
        const legacyShareId = urlParams.get('shareId');
        const legacyViewId = urlParams.get('viewId');
        const queryParam = urlParams.get('q');
        const qualityParam = urlParams.get('quality'); // Check for quality filter in URL
    
        let viewChanged = false;

        // Update global quality filter state from URL if present
        currentState.qualityFilter = qualityParam || '';
        if (qualityFilterSelect) qualityFilterSelect.value = currentState.qualityFilter;
        updateFilterIndicator();
    
        if (groupKey) {
            await displayGroupDetail(groupKey, fileIdToOpen); 
            viewChanged = true;
        } else if (legacyShareId || legacyViewId) {
            const targetFileId = legacyShareId || legacyViewId;
            await handleLegacyFileLink(targetFileId); 
            urlParams.delete('shareId');
            urlParams.delete('viewId');
            const newQueryString = urlParams.toString();
            history.replaceState(null, '', window.location.pathname + (newQueryString ? `?${newQueryString}` : ''));
            viewChanged = true;
        } else if (queryParam) {
            if (currentViewMode !== 'search' || currentState.searchTerm !== queryParam || currentState.qualityFilter !== (qualityParam || '') || (isInitialLoad && !isPopState)) {
                searchInput.value = queryParam;
                handleSearchSubmit(false); // false to not push history again if already in URL
            } else {
                 await setViewMode('search'); 
            }
            viewChanged = true;
        } else { // No group, no legacy, no query -> homepage
            if (currentViewMode !== 'homepage' || isInitialLoad || isPopState ) {
                await setViewMode('homepage');
            }
            viewChanged = true;
        }
        
        if (!viewChanged && isInitialLoad) { 
            await setViewMode('homepage');
        }

        if (isInitialLoad) {
            isInitialLoad = false; 
        }
    }
    async function handleLegacyFileLink(fileId) { 
        if (pageLoader) pageLoader.style.display = 'flex';
        try {
            const fileDataResponse = await fetchApiData({ id: fileId });
            if (fileDataResponse && fileDataResponse.items && fileDataResponse.items.length > 0) {
                const fileItem = preprocessMovieData(fileDataResponse.items[0]);
                const groupKey = getGroupKey(fileItem);
                const newUrlParams = new URLSearchParams();
                newUrlParams.set('viewGroup', groupKey);
                newUrlParams.set('fileId', fileId);
                history.replaceState({ viewGroup: groupKey, fileId: fileId }, '', `${window.location.pathname}?${newUrlParams.toString()}`);
                await displayGroupDetail(groupKey, fileId); 
            } else {
                console.warn(`Legacy file ID ${fileId} not found. Redirecting to homepage.`);
                await resetToHomepage();
            }
        } catch (error) {
            console.error(`Error handling legacy file link for ID ${fileId}:`, error);
            await resetToHomepage();
        } finally {
            if (pageLoader && pageLoader.style.display !== 'none' && !(currentViewMode === 'groupDetail')) {
                 pageLoader.style.display = 'none';
            }
        }
    }

    // --- Search and Suggestions Logic ---
    function handleSearchInput() { clearTimeout(suggestionDebounceTimeout); const searchTerm = searchInput.value.trim(); if (searchTerm.length < 2) { suggestionsContainer.style.display = 'none'; return; } suggestionDebounceTimeout = setTimeout(() => { fetchAndDisplaySuggestions(searchTerm); }, config.SUGGESTIONS_DEBOUNCE_DELAY); }
    function fetchAndDisplaySuggestions(term) { const normalizedTerm = normalizeTextForSearch(term); if (!normalizedTerm) { suggestionsContainer.style.display = 'none'; return; } const matchingItems = localSuggestionData.filter(movie => movie.searchText.includes(normalizedTerm)).slice(0, config.MAX_SUGGESTIONS); suggestionsContainer.innerHTML = ''; if (matchingItems.length > 0) { const fragment = document.createDocumentFragment(); matchingItems.forEach(item => { const div = document.createElement('div'); let displayText = item.displayFilename; let highlighted = false; if (term.length > 0) { try { const safeTerm = escapeRegExp(term); const regex = new RegExp(`(${safeTerm})`, 'i'); if ((item.displayFilename || '').match(regex)) { div.innerHTML = (item.displayFilename || '').replace(regex, '<strong>$1</strong>'); highlighted = true; } } catch (e) { console.warn("Regex error for highlight:", e); } } if (!highlighted) { div.textContent = item.displayFilename; } div.title = item.displayFilename; div.onclick = () => selectSuggestion(item.displayFilename); fragment.appendChild(div); }); suggestionsContainer.appendChild(fragment); suggestionsContainer.style.display = 'block'; } else { suggestionsContainer.style.display = 'none'; } }
    function selectSuggestion(selectedValue) { searchInput.value = selectedValue; suggestionsContainer.style.display = 'none'; handleSearchSubmit(); }
    window.handleSearchSubmit = async function(pushHistory = true) { 
        if (suggestionsContainer) { suggestionsContainer.style.display = 'none'; }
        const searchTerm = searchInput.value.trim();
        if (searchInput) { searchInput.blur(); }
        if (searchTerm.length === 0 && currentViewMode !== 'homepage') { await resetToHomepage(); return; }
        if (searchTerm.length === 0 && currentViewMode === 'homepage') { return; }
        if (currentViewMode === 'groupDetail') {
            if (groupDetailAbortController) { groupDetailAbortController.abort(); groupDetailAbortController = null; }
            currentGroupData = null;
        }
        lastSearchTermForResults = searchTerm;
        await setViewMode('search'); 
        activeResultsTab = 'allFiles';
        currentState.currentPage = 1;
        currentState.searchTerm = searchTerm;
        currentState.qualityFilter = qualityFilterSelect.value || ''; // Get current global quality filter
        currentState.typeFilter = ''; // Default to all types on new search
        if (pushHistory) {
            const urlParams = new URLSearchParams();
            urlParams.set('q', searchTerm);
            if (currentState.qualityFilter) { // Add quality to URL if set
                urlParams.set('quality', currentState.qualityFilter);
            }
            history.pushState({ q: searchTerm, quality: currentState.qualityFilter }, '', `${window.location.pathname}?${urlParams.toString()}`);
        }
        updateActiveTabAndPanel();
        showLoadingStateInGrids(`Searching for "${sanitize(searchTerm)}"...`);
        fetchAndRenderResults(); 
    }
    function handleSearchClear() { clearTimeout(suggestionDebounceTimeout); suggestionsContainer.style.display = 'none'; setTimeout(async () => { if (searchInput.value.trim() === '') { if (currentViewMode === 'search') { await resetToHomepage(); } else { currentState.searchTerm = ''; saveStateToLocalStorage(); } } }, 100); }
    function showLoadingStateInGrids(message = 'Loading...') {
        const loadingHTML = `<div class="loading-message grid-status-message"><div class="spinner"></div>${sanitize(message)}</div>`;
        Object.values(tabMappings).forEach(mapping => {
            if (mapping?.gridContainer) { mapping.gridContainer.innerHTML = loadingHTML; }
            if (mapping?.pagination) { mapping.pagination.style.display = 'none'; }
        });
    }

    // --- Updates Preview Logic ---
    async function loadUpdatesPreview() {
        if (!updatesPreviewList || !showMoreUpdatesButton) { 
             if (showMoreUpdatesButton) showMoreUpdatesButton.style.display = 'none';
            return;
        }
        updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`;
        showMoreUpdatesButton.style.display = 'none'; 
        updatesPreviewShownCount = 0;
        weeklyUpdatesGroups = []; 
    
        try {
            const rawItemsToFetch = config.UPDATES_PREVIEW_INITIAL_COUNT + (config.UPDATES_PREVIEW_LOAD_MORE_COUNT * 2);
            const params = { sort: 'lastUpdated', sortDir: 'desc', limit: rawItemsToFetch, page: 1 };
            const data = await fetchApiData(params);
    
            if (data && data.items && data.items.length > 0) {
                const preprocessedItems = data.items.map(preprocessMovieData);
                weeklyUpdatesGroups = groupItems(preprocessedItems); 
                weeklyUpdatesGroups.forEach(group => {
                    // Add to allKnownGroups if new or has more files (update)
                    const existingGroup = allKnownGroups.get(group.groupKey);
                    if (!existingGroup || group.files.length > existingGroup.files.length) {
                         allKnownGroups.set(group.groupKey, group);
                    } else if (existingGroup && group.lastUpdatedTimestamp > existingGroup.lastUpdatedTimestamp) {
                        // If existing group has same or more files but this one is newer, update it
                        allKnownGroups.set(group.groupKey, { ...existingGroup, ...group });
                    }
                });
                displayInitialUpdates(); 
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
    function displayInitialUpdates() {
        if (!updatesPreviewList || !showMoreUpdatesButton) return;
        updatesPreviewList.innerHTML = ''; 
        updatesPreviewShownCount = 0;
        if (weeklyUpdatesGroups.length === 0) {
            updatesPreviewList.innerHTML = '<div class="status-message grid-status-message">No recent updates found.</div>';
            showMoreUpdatesButton.style.display = 'none';
            return;
        }
        const initialCount = Math.min(weeklyUpdatesGroups.length, config.UPDATES_PREVIEW_INITIAL_COUNT);
        appendUpdatesToPreview(0, initialCount);
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
    window.appendMoreUpdates = async function() {
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
    function appendUpdatesToPreview(startIndex, endIndex) {
        if (!updatesPreviewList) return;
        const fragment = document.createDocumentFragment();
        const groupsToAppend = weeklyUpdatesGroups.slice(startIndex, endIndex);
        groupsToAppend.forEach((group) => {
            if (!group || !group.groupKey) return;
            const groupGridItemElement = createGroupGridItemHTML(group);
            groupGridItemElement.classList.add('update-item');
            fragment.appendChild(groupGridItemElement);
        });
        const initialLoader = updatesPreviewList.querySelector('.loading-inline-spinner');
        if (initialLoader && startIndex === 0 && updatesPreviewList.innerHTML.includes('loading-inline-spinner')) { 
             initialLoader.remove(); 
        }
        updatesPreviewList.appendChild(fragment);
    }

    // --- Filtering, Sorting ---
    function triggerFilterChange() { // For the global quality filter in results view
        if (!qualityFilterSelect || currentViewMode !== 'search') return;
        const newQualityFilter = qualityFilterSelect.value;
        if (newQualityFilter !== currentState.qualityFilter) {
            currentState.qualityFilter = newQualityFilter;
            currentState.currentPage = 1; 
            closePlayerIfNeeded(null);
            showLoadingStateInGrids(`Applying filter: ${sanitize(newQualityFilter || 'All Qualities')}...`);
            
            // Update URL with new quality filter
            const urlParams = new URLSearchParams(window.location.search);
            if (currentState.qualityFilter) {
                urlParams.set('quality', currentState.qualityFilter);
            } else {
                urlParams.delete('quality');
            }
            history.pushState({ q: currentState.searchTerm, quality: currentState.qualityFilter }, '', `${window.location.pathname}?${urlParams.toString()}`);

            fetchAndRenderResults(); 
            updateFilterIndicator();
        }
    }

    // --- Rendering Logic ---
    function renderActiveResultsView(apiResponse) {
         if (currentViewMode !== 'search' || !tabMappings[activeResultsTab]) {
             if (currentViewMode === 'search') { showLoadingStateInGrids('Enter search term above.'); }
             return;
         }
         const { gridContainer, pagination } = tabMappings[activeResultsTab];
         if (!gridContainer || !pagination) { console.error("Missing grid container or pagination for tab:", activeResultsTab); return; }
         
         const rawItems = apiResponse.items || [];
         currentFetchedItems = rawItems.map(preprocessMovieData);
         
         let groupsToDisplay = groupItems(currentFetchedItems);
         
         // Apply global quality filter if set (this is re-filtering items from the API response)
         // Note: The API itself should also handle the quality filter for pagination accuracy.
         // This client-side filter is a secondary check or for when API doesn't filter perfectly.
         if (currentState.qualityFilter) {
             groupsToDisplay = groupsToDisplay.filter(group =>
                 group.files.some(file => file.displayQuality === currentState.qualityFilter)
             );
         }
         currentDisplayedGroups = groupsToDisplay;
         
         currentDisplayedGroups.forEach(group => {
             const existingGroup = allKnownGroups.get(group.groupKey);
             if (!existingGroup || group.files.length > existingGroup.files.length || group.lastUpdatedTimestamp > existingGroup.lastUpdatedTimestamp) {
                  allKnownGroups.set(group.groupKey, group);
             }
         });
         
         gridContainer.innerHTML = '';
         const fragment = document.createDocumentFragment();
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
         renderPaginationControls(pagination, apiResponse.totalItems, apiResponse.page, apiResponse.totalPages);
         updateActiveTabAndPanel();
         updateFilterIndicator();
     }
    function renderPaginationControls(targetContainer, totalRawItems, currentRawPage, totalRawPages) {
        if (!targetContainer) return;
        if (totalRawItems === 0 || totalRawPages <= 1) {
            targetContainer.innerHTML = '';
            targetContainer.style.display = 'none';
            return;
        }
        targetContainer.dataset.totalPages = totalRawPages;
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
        if (startPage > 1) { // Show first page link if not in the main sequence
            paginationHTML += `<button onclick="changePage(1)" title="Page 1">1</button>`;
            if (startPage > 2) { paginationHTML += `<span class="page-info" title="Skipped pages">...</span>`; }
        } else if (startPage === 1 && totalRawPages > 1) { // Ensure page 1 is always clickable if it's the start
             // Do nothing, it will be rendered in the loop
        }


        for (let i = startPage; i <= endPage; i++) {
            if (i === 0) continue; // Skip page 0 if it somehow gets here
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
    function updateFilterIndicator() { // For the global quality filter
        if(qualityFilterSelect) { 
            qualityFilterSelect.classList.toggle('filter-active', !!currentState.qualityFilter); 
        } 
    }
    function updateActiveTabAndPanel() { Object.keys(tabMappings).forEach(tabId => { const mapping = tabMappings[tabId]; const isActive = tabId === activeResultsTab; if (mapping?.button) mapping.button.classList.toggle('active', isActive); if (mapping?.panel) mapping.panel.classList.toggle('active', isActive); }); }

    // --- Pagination and Tab Switching ---
    window.changePage = function(newPage) {
        if (currentViewMode !== 'search' || newPage < 1 || newPage === currentState.currentPage) { return; }
        const currentPagination = tabMappings[activeResultsTab]?.pagination;
        if(currentPagination && currentPagination.dataset.totalPages) {
            const totalP = parseInt(currentPagination.dataset.totalPages, 10);
            if(newPage > totalP && totalP > 0) { return; } // Check totalP > 0 to allow page 1 if totalPages is 0 initially
        }
        currentState.currentPage = newPage;
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
            const controlsAreaElem = resultsArea.querySelector('.results-controls-area');
            const tabNavElem = resultsArea.querySelector('.tab-navigation');
            stickyHeaderHeight = (searchBarArea?.offsetHeight || 0) +
                                 (backButtonElem?.offsetHeight || 0) +
                                 (backButtonElem ? parseFloat(getComputedStyle(backButtonElem).marginBottom) : 0) +
                                 (controlsAreaElem?.offsetHeight || 0) +
                                 (tabNavElem?.offsetHeight || 0);
        }
        const elementTop = gridContainerElement.getBoundingClientRect().top + window.pageYOffset;
        const scrollPosition = elementTop - stickyHeaderHeight - 20; // 20px buffer
        window.scrollTo({ top: scrollPosition, behavior: 'smooth' });
    }
    window.switchTab = async function(tabId) { 
        if (currentViewMode !== 'search' || tabId === activeResultsTab || !tabMappings[tabId]) { return; }
        activeResultsTab = tabId;
        currentState.currentPage = 1;
        currentState.typeFilter = tabMappings[tabId].typeFilter;
        closePlayerIfNeeded(null);
        updateActiveTabAndPanel();
        showLoadingStateInGrids(`Loading ${tabMappings[tabId].typeFilter || 'all content'}...`);
        await fetchAndRenderResults(); 
        saveStateToLocalStorage();
    }

    // --- Navigation to Group Detail View ---
    async function navigateToGroupView(groupKey) { 
        if (!groupKey) return;
        lastFocusedElement = document.activeElement;
        if (groupDetailAbortController) { groupDetailAbortController.abort(); groupDetailAbortController = null; }
        const newUrlParams = new URLSearchParams(window.location.search);
        // Preserve search query 'q' and 'quality' if navigating from search results
        const currentQ = newUrlParams.get('q');
        const currentQuality = newUrlParams.get('quality');
        
        newUrlParams.forEach((_, key) => newUrlParams.delete(key)); // Clear params

        if (currentQ) newUrlParams.set('q', currentQ); // Restore q if it was there
        if (currentQuality) newUrlParams.set('quality', currentQuality); // Restore quality

        newUrlParams.set('viewGroup', groupKey);
        newUrlParams.delete('fileId'); // Clear any specific file ID
        
        const newUrl = `${window.location.pathname}?${newUrlParams.toString()}`;
        try { history.pushState({ viewGroup: groupKey }, '', newUrl); }
        catch (e) { console.error("History pushState failed:", e); }
        await displayGroupDetail(groupKey); 
    }
    window.navigateToGroupView = navigateToGroupView; // Make it globally accessible

    // --- Share Logic ---
    async function handleShareClick(buttonElement) {
        const fileId = buttonElement.dataset.fileId;
        const groupKey = buttonElement.dataset.groupKey;
        const itemTitle = buttonElement.dataset.title || "Cinema Ghar Item";
        const itemFilename = buttonElement.dataset.filename || "";
        if (!groupKey || !fileId) { alert("Cannot share: Item or Group ID missing."); return; }
        const shareUrlParams = new URLSearchParams();
        shareUrlParams.set('viewGroup', groupKey);
        shareUrlParams.set('fileId', fileId);
        const shareUrl = `${window.location.origin}${window.location.pathname}?${shareUrlParams.toString()}`;
        const shareText = `Check out: ${itemTitle}\n${itemFilename ? `(${itemFilename})\n` : ''}`;
        const feedbackSpan = buttonElement.closest('.file-actions').querySelector('.copy-feedback.share-fallback');
        if (navigator.share) {
            try { await navigator.share({ title: itemTitle, text: shareText, url: shareUrl }); }
            catch (error) { if (error.name !== 'AbortError') { if (feedbackSpan) showCopyFeedback(feedbackSpan, 'Share failed!', true); else alert(`Share failed: ${error.message}`); } }
        } else { await copyToClipboard(shareUrl, feedbackSpan); }
    }

    // --- Group Detail Display Logic ---
    async function displayGroupDetail(groupKey, fileIdToHighlight = null) { 
        if (!groupKey || !groupDetailViewEl || !groupDetailContentEl) return;
        if (groupDetailAbortController) { groupDetailAbortController.abort(); groupDetailAbortController = null; }
        groupDetailAbortController = new AbortController();
        const signal = groupDetailAbortController.signal;
        
        if (pageLoader && pageLoader.style.display === 'none') pageLoader.style.display = 'flex'; 

        await setViewMode('groupDetail'); 
        groupDetailContentEl.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading group details (ID: ${sanitize(groupKey)})...</span></div>`;
        currentGroupData = null;
        if (backToHomeButtonGroupDetail) backToHomeButtonGroupDetail.style.display = 'inline-flex';
        if (backToResultsButtonGroupDetail) {
            backToResultsButtonGroupDetail.style.display = (lastSearchTermForResults || currentState.searchTerm || new URLSearchParams(window.location.search).has('q')) ? 'inline-flex' : 'none';
        }
        try {
            let groupData = allKnownGroups.get(groupKey);
            // If groupData exists but has no files, or if TMDb details imply it's a series and we haven't fetched *all* its seasons' files,
            // we might need to re-fetch to ensure we have all files for that series title.
            let needsRefetch = !groupData || groupData.files.length === 0;
            if (groupData && groupData.isSeries && (!groupData.tmdbDetails || !groupData.tmdbDetails.seasonsInfoAttempted)) {
                 // Example: If we haven't tried to get all season data for this series title yet
                 // needsRefetch = true; // This logic would need more refinement based on how `allKnownGroups` is populated
            }

            if (needsRefetch) {
                const inferredSearchTerm = groupData ? groupData.displayTitle : groupKey.split(/_y|_s/)[0].replace(/_/g, ' ');
                console.log(`Group ${groupKey} not fully cached or needs more files. Fetching for title: "${inferredSearchTerm}"`);
                const params = { search: inferredSearchTerm, limit: 500 }; // Fetch a large number to get all related files
                // If we know it's a series, we can specify the type.
                // However, getGroupKey for series is just based on title, so `groupData` might not know `isSeries` yet if it's a fresh load.
                // This part of the logic might need adjustment based on how `allKnownGroups` is populated for series.
                // For now, if groupData exists and isSeries, use that.
                if (groupData && groupData.isSeries) params.type = 'series'; 
                else if (groupData && !groupData.isSeries) params.type = 'movies';

                const apiResponse = await fetchApiData(params, signal);
                if (signal.aborted) return;
                if (apiResponse && apiResponse.items && apiResponse.items.length > 0) {
                    const preprocessedItems = apiResponse.items.map(preprocessMovieData);
                    // Re-group based on the fetched items to consolidate everything under this title.
                    const tempGrouped = groupItems(preprocessedItems); 
                    const foundGroup = tempGrouped.find(g => g.groupKey === groupKey); // Find the primary group
                    
                    if (foundGroup) {
                        groupData = foundGroup;
                        // Update allKnownGroups with potentially more complete data
                        allKnownGroups.set(groupKey, groupData);

                        // Also update other season groups if they were fetched
                        tempGrouped.forEach(g => {
                            if (g.isSeries && g.displayTitle === groupData.displayTitle) {
                                if (!allKnownGroups.has(g.groupKey) || allKnownGroups.get(g.groupKey).files.length < g.files.length) {
                                    allKnownGroups.set(g.groupKey, g);
                                }
                            }
                        });

                    } else {
                        if (!groupData) throw new Error(`Group ${groupKey} could not be found or constructed from search: ${inferredSearchTerm}.`);
                    }
                } else if (!groupData) { 
                     throw new Error(`No files found for group ${groupKey} (title: ${inferredSearchTerm}).`);
                }
            }
            if (signal.aborted) return;
            currentGroupData = groupData;
            if (!currentGroupData) throw new Error(`Failed to load data for group ${groupKey}.`); 

            document.title = `${currentGroupData.displayTitle || 'Group Detail'} - Cinema Ghar`;
            // Fetch full TMDb details if not already present or if missing crucial parts like trailer
            if (!currentGroupData.tmdbDetails || !currentGroupData.tmdbDetails.genres || !currentGroupData.tmdbDetails.hasOwnProperty('trailerKey') || (currentGroupData.isSeries && !currentGroupData.tmdbDetails.seasons)) { 
                const tmdbQuery = new URLSearchParams();
                tmdbQuery.set('query', currentGroupData.displayTitle);
                tmdbQuery.set('type', currentGroupData.isSeries ? 'tv' : 'movie');
                if (!currentGroupData.isSeries && currentGroupData.year) tmdbQuery.set('year', currentGroupData.year);
                else if (currentGroupData.isSeries && currentGroupData.year) tmdbQuery.set('first_air_date_year', currentGroupData.year); // Use first air year for series
                tmdbQuery.set('fetchFullDetails', 'true');
                const tmdbUrl = `${config.TMDB_API_PROXY_URL}?${tmdbQuery.toString()}`;
                const tmdbController = new AbortController();
                const tmdbTimeoutId = setTimeout(() => tmdbController.abort(), config.TMDB_FETCH_TIMEOUT);
                try {
                    const tmdbResponse = await fetch(tmdbUrl, { signal: tmdbController.signal });
                    clearTimeout(tmdbTimeoutId);
                    if (tmdbResponse.ok) {
                        const fullTmdbData = await tmdbResponse.json();
                        currentGroupData.tmdbDetails = { ...(currentGroupData.tmdbDetails || {}), ...fullTmdbData };
                        allKnownGroups.set(groupKey, currentGroupData); 
                    }
                } catch (tmdbError) {
                    clearTimeout(tmdbTimeoutId);
                    if (tmdbError.name !== 'AbortError') console.error("Error fetching full TMDb details for group detail view:", tmdbError);
                }
            }
            if (signal.aborted) return;
            renderGroupDetailContent(currentGroupData, fileIdToHighlight);
            if (videoContainer) videoContainer.style.display = 'none';
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
    
    function generateFilesListHTML(filesToRender, groupDataForFileItem) {
        let listContent = '';
        if (filesToRender && filesToRender.length > 0) {
            filesToRender.forEach(file => {
                listContent += createGroupDetailFileListItemHTML(file, groupDataForFileItem);
            });
        } else {
            listContent = '<li>No files match the current filter.</li>';
        }
        return listContent;
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
            let trailerContentHTML = '';
            if (tmdb.trailerKey) {
                trailerContentHTML = `
                    <div class="trailer-embed-container">
                        <iframe
                            src="https://www.youtube.com/embed/${sanitize(tmdb.trailerKey)}"
                            title="YouTube video player for ${sanitize(tmdb.title || groupData.displayTitle)}"
                            frameborder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowfullscreen>
                        </iframe>
                    </div>`;
            } else {
                let ytSearchTerms = [groupData.displayTitle];
                if (groupData.isSeries && groupData.season) ytSearchTerms.push(`Season ${groupData.season}`);
                else if (!groupData.isSeries && groupData.year) ytSearchTerms.push(String(groupData.year));
                ytSearchTerms.push("Official Trailer");
                const youtubeSearchQuery = encodeURIComponent(ytSearchTerms.join(' '));
                const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${youtubeSearchQuery}`;
                const youtubeIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M21.582,6.186c-0.23-0.86-0.908-1.538-1.768-1.768C18.267,4,12,4,12,4S5.733,4,4.186,4.418 c-0.86,0.23-1.538,0.908-1.768,1.768C2,7.734,2,12,2,12s0,4.266,0.418,5.814c0.23,0.86,0.908,1.538,1.768,1.768 C5.733,20,12,20,12,20s6.267,0,7.814-0.418c0.861-0.23,1.538-0.908,1.768-1.768C22,16.266,22,12,22,12S22,7.734,21.582,6.186z M10,15.464V8.536L16,12L10,15.464z"></path></svg>`;
                trailerContentHTML = `<a href="${youtubeSearchUrl}" target="_blank" rel="noopener noreferrer" class="button youtube-button">${youtubeIconSVG} Watch Trailer on YouTube</a>`;
            }
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
                        ${trailerContentHTML}
                        <div class="action-buttons-container group-meta-actions">${tmdbLinkButtonHTML}</div>
                        ${actorsHTML}
                    </div>
                </div>`;
        } else if (groupData.displayTitle && !groupData.tmdbDetails) {
             tmdbSectionHTML = `<div class="tmdb-fetch-failed">Could not fetch additional details from TMDb for ${sanitize(groupData.displayTitle)}.</div>`;
        }

        // Season Navigation
        let seasonNavHTML = '';
        if (groupData.isSeries) {
            const seriesTitle = groupData.displayTitle;
            // Use the current group's season (derived from its files) as the active one
            const currentSeasonNumber = groupData.season; 
            const availableSeasons = [];

            // Find all groups that represent seasons of this series
            allKnownGroups.forEach(g => {
                if (g.isSeries && g.displayTitle === seriesTitle && typeof g.season === 'number') {
                    availableSeasons.push({ season: g.season, groupKey: g.groupKey });
                }
            });
            // If the current group itself doesn't have a season number but is a series, add its files' seasons
            if (typeof currentSeasonNumber === 'undefined' && groupData.files.length > 0) {
                groupData.files.forEach(f => {
                    if (f.isSeries && f.extractedSeason && f.extractedTitle === seriesTitle) {
                        availableSeasons.push({ season: f.extractedSeason, groupKey: getGroupKey(f) }); // Use getGroupKey for consistent season group key
                    }
                });
            }


            const uniqueSeasons = [...new Map(availableSeasons.map(item => [item.season, item])).values()]
                                  .sort((a, b) => a.season - b.season);

            if (uniqueSeasons.length > 1) { // Only show if more than one season is known
                seasonNavHTML = '<div class="season-navigation"><strong>Seasons:</strong>';
                uniqueSeasons.forEach(s => {
                    const seasonLabel = `S${s.season}`;
                    const isActive = s.season === currentSeasonNumber || (currentGroupData.groupKey === s.groupKey);
                    seasonNavHTML += `<button class="button season-button ${isActive ? 'active' : ''}" 
                                              onclick="window.navigateToGroupView('${sanitize(s.groupKey)}')" 
                                              title="Go to Season ${s.season}"
                                              ${isActive ? 'aria-current="page"' : ''}>
                                        ${seasonLabel}
                                      </button>`;
                });
                seasonNavHTML += '</div>';
            }
        }
        
        // Local Quality Filter for files
        let localQualityFilterHTML = '';
        const filesForFilter = groupData.files || [];
        const uniqueFileQualities = [...new Set(filesForFilter.map(f => f.displayQuality).filter(q => q && q !== 'N/A'))].sort((a,b) => a.localeCompare(b));

        if (uniqueFileQualities.length > 1) { // Only show filter if multiple qualities exist
            localQualityFilterHTML = `
                <div class="local-filter-group">
                    <label for="groupDetailQualityFilter">Filter files by quality:</label>
                    <select id="groupDetailQualityFilter">
                        <option value="">All Qualities</option>
                        ${uniqueFileQualities.map(q => `<option value="${sanitize(q)}">${sanitize(q)}</option>`).join('')}
                    </select>
                </div>`;
        }
        
        const filesListRenderAreaId = `files-list-render-area-${groupData.groupKey.replace(/[^a-zA-Z0-9-_]/g, '')}`;
        let filesListHTML = `<div class="files-list-container">
                                <h4>Available Files (${filesForFilter.length}):</h4>
                                ${localQualityFilterHTML}
                                <ul id="${filesListRenderAreaId}">`;
        filesListHTML += generateFilesListHTML(filesForFilter, groupData); // Render all files initially
        filesListHTML += '</ul></div>';

        const playerCustomUrlTriggerHTML = `<button class="button custom-url-toggle-button" data-action="toggle-custom-url-player" aria-expanded="false" style="display: inline-flex; margin-top: 15px;"><span aria-hidden="true">🔗</span> Play Custom URL in Player</button>`;
        
        groupDetailContentEl.innerHTML = `${tmdbSectionHTML}${seasonNavHTML}<hr class="detail-separator">${filesListHTML}${playerCustomUrlTriggerHTML}`;

        if (videoContainer && videoContainer.parentElement !== groupDetailContentEl) {
            groupDetailContentEl.appendChild(videoContainer);
        }

        // Attach event listener for local quality filter
        const localQualitySelect = document.getElementById('groupDetailQualityFilter');
        if (localQualitySelect) {
           localQualitySelect.addEventListener('change', function() {
               const selectedQuality = this.value;
               const filteredFiles = selectedQuality ? groupData.files.filter(f => f.displayQuality === selectedQuality) : groupData.files;
               const filesListUl = document.getElementById(filesListRenderAreaId);
               if (filesListUl) {
                   filesListUl.innerHTML = generateFilesListHTML(filteredFiles, groupData);
               }
               const filesListContainer = this.closest('.files-list-container');
               if (filesListContainer) {
                   const h4 = filesListContainer.querySelector('h4');
                   if (h4) h4.textContent = `Available Files (${filteredFiles.length}):`;
               }
           });
        }

        if (fileIdToHighlight) {
            const fileElement = groupDetailContentEl.querySelector(`.file-item[data-file-id="${sanitize(fileIdToHighlight)}"]`);
            if (fileElement) {
                setTimeout(() => {
                    fileElement.scrollIntoView({ behavior: 'auto', block: 'center' });
                    fileElement.classList.add('highlighted-file');
                    // Ensure actions are expanded for the highlighted file if desired
                    const fileInfo = fileElement.querySelector('.file-info-clickable');
                    if (fileInfo) fileInfo.click(); // Simulate click to expand
                    setTimeout(() => fileElement.classList.remove('highlighted-file'), 2500);
                }, 200);
            }
        }
    }

    function createGroupDetailFileListItemHTML(file, groupData) {
        const displayFilename = file.displayFilename;
        const displaySize = file.sizeData.display;
        const displayQuality = file.displayQuality;
        const streamTitleBase = file.extractedTitle || displayFilename.split(/[\.\(\[]/)[0].replace(/[_ ]+/g, ' ').trim();
        const streamTitle = streamTitleBase + (displayQuality !== 'N/A' ? ` (${displayQuality})` : '');
        const timestampString = file.last_updated_ts;
        const formattedDateRelative = TimeAgo.format(timestampString);
        let hdrLogoHtml = ''; let fourkLogoHtml = '';
        const lowerFilename = (displayFilename || '').toLowerCase();
        if (displayQuality === '4K' || lowerFilename.includes('2160p') || lowerFilename.includes('.4k.')) { fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo fourk-logo" title="4K Ultra HD" />`; }
        if ((displayQuality || '').includes('HDR') || (displayQuality || '').includes('DOLBY VISION') || displayQuality === 'DV' || lowerFilename.includes('hdr') || lowerFilename.includes('dolby.vision') || lowerFilename.includes('.dv.')) { hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo hdr-logo" title="HDR / Dolby Vision Content" />`; }
        
        const fileUrlForAttributes = file.url || ''; 
        
        const escapedStreamTitle = streamTitle.replace(/'/g, "\\'");
        const escapedFilename = displayFilename.replace(/'/g, "\\'");
        const escapedFileId = file.id ? String(file.id).replace(/[^a-zA-Z0-9-_]/g, '') : '';
        const escapedGroupKey = groupData.groupKey.replace(/'/g, "\\'");
        const escapedHubcloudUrl = file.hubcloud_link ? file.hubcloud_link.replace(/'/g, "\\'") : '';
        const escapedGdflixUrl = file.gdflix_link ? file.gdflix_link.replace(/'/g, "\\'") : '';

        // The 'actions-expanded' class will be toggled by JS. file-actions are hidden by default by CSS.
        // Add an ID to file-actions for aria-controls
        const actionsId = `file-actions-${escapedFileId}`;
        let fileActionButtonsHTML = `<div class="file-actions" id="${actionsId}">`; 
        if (file.url) {
            fileActionButtonsHTML += `<button class="button play-button" data-action="play-file" data-file-id="${escapedFileId}" data-title="${escapedStreamTitle}" data-url="${fileUrlForAttributes.replace(/'/g, "\\'")}" data-filename="${escapedFilename}"><span aria-hidden="true">▶️</span> Play</button>`;
            fileActionButtonsHTML += `<a class="button download-button" href="${fileUrlForAttributes}" download="${displayFilename}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">💾</span> Download</a>`;
            fileActionButtonsHTML += `<button class="button vlc-button" data-action="copy-vlc-file" data-file-id="${escapedFileId}" data-url="${fileUrlForAttributes.replace(/'/g, "\\'")}"><span aria-hidden="true">📋</span> Copy URL</button><span class="copy-feedback" role="status" aria-live="polite"></span>`;
            if (navigator.userAgent.toLowerCase().includes("android")) {
                fileActionButtonsHTML += `<button class="button intent-button" data-action="open-intent-file" data-file-id="${escapedFileId}" data-url="${fileUrlForAttributes.replace(/'/g, "\\'")}" data-title="${escapedStreamTitle}"><span aria-hidden="true">📱</span> Play External</button>`;
            }
        }

        if (file.hubcloud_link) {
            fileActionButtonsHTML += `<button class="button hubcloud-bypass-button" data-action="bypass-hubcloud-file" data-file-id="${escapedFileId}" data-hubcloud-url="${escapedHubcloudUrl}"><span aria-hidden="true" class="button-icon">☁️</span><span class="button-spinner spinner"></span><span class="button-text">Bypass HubCloud</span></button><span class="bypass-feedback" role="status" aria-live="polite"></span>`;
        }
        if (file.gdflix_link) {
            fileActionButtonsHTML += `<button class="button gdflix-bypass-button" data-action="bypass-gdflix-file" data-file-id="${escapedFileId}" data-gdflix-url="${escapedGdflixUrl}"><span aria-hidden="true" class="button-icon">🎬</span><span class="button-spinner spinner"></span><span class="button-text">Bypass GDFLIX</span></button><span class="bypass-feedback" role="status" aria-live="polite"></span>`;
        }
        
        if (file.hubcloud_link) {
            fileActionButtonsHTML += `<a class="button hubcloud-button" href="${sanitize(file.hubcloud_link)}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">☁️</span> HubCloud Link</a>`;
        }
        if (file.gdflix_link) {
            fileActionButtonsHTML += `<a class="button gdflix-button" href="${sanitize(file.gdflix_link)}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">🎬</span> GDFLIX Link</a>`;
        }

        fileActionButtonsHTML += `<button class="button share-button" data-action="share-file" data-file-id="${escapedFileId}" data-group-key="${escapedGroupKey}" data-title="${escapedStreamTitle}" data-filename="${escapedFilename}"><span aria-hidden="true">🔗</span> Share File</button><span class="copy-feedback share-fallback" role="status" aria-live="polite">Link copied!</span>`;
        
        if (file.telegram_link) { fileActionButtonsHTML += `<a class="button telegram-button" href="${sanitize(file.telegram_link)}" target="_blank" rel="noopener noreferrer">Telegram File</a>`; }
        if (file.filepress_link) fileActionButtonsHTML += `<a class="button filepress-button" href="${sanitize(file.filepress_link)}" target="_blank" rel="noopener noreferrer">Filepress</a>`;
        if (file.gdtot_link)    fileActionButtonsHTML += `<a class="button gdtot-button" href="${sanitize(file.gdtot_link)}" target="_blank" rel="noopener noreferrer">GDToT</a>`;

        fileActionButtonsHTML += '</div>'; 

        return `
            <li class="file-item" data-file-id="${escapedFileId}">
                <div class="file-info file-info-clickable" role="button" tabindex="0" aria-expanded="false" aria-controls="${actionsId}">
                    <span class="file-name" title="${displayFilename}">${displayFilename}</span>
                    <span class="file-meta">
                        Quality: ${displayQuality} ${fourkLogoHtml}${hdrLogoHtml} | Size: ${displaySize} | Lang: ${sanitize(file.languages || 'N/A')} | Updated: ${formattedDateRelative}
                    </span>
                </div>
                ${fileActionButtonsHTML}
            </li>`;
    }
    function updateFileInGroupAfterBypass(fileId, newUrl) { 
        if (!currentGroupData || !groupDetailContentEl) return;
        const fileIndex = currentGroupData.files.findIndex(f => String(f.id) === String(fileId));
        if (fileIndex === -1) return;
        currentGroupData.files[fileIndex].url = newUrl; 
        currentGroupData.files[fileIndex].hubcloud_link = null; // Mark as bypassed
        currentGroupData.files[fileIndex].gdflix_link = null;   // Mark as bypassed
        
        // Re-render the specific file list item, or the whole list if simpler
        // For simplicity, re-rendering the specific item:
        const fileListItem = groupDetailContentEl.querySelector(`.file-item[data-file-id="${sanitize(fileId)}"]`);
        if (fileListItem) {
            const newListItemHTML = createGroupDetailFileListItemHTML(currentGroupData.files[fileIndex], currentGroupData);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = newListItemHTML;
            const newFileItem = tempDiv.firstElementChild;
            
            // Preserve expanded state if it was expanded
            const oldActions = fileListItem.querySelector('.file-actions');
            if (oldActions && oldActions.classList.contains('actions-expanded')) {
                newFileItem.querySelector('.file-actions')?.classList.add('actions-expanded');
                newFileItem.querySelector('.file-info-clickable')?.classList.add('info-active');
                newFileItem.querySelector('.file-info-clickable')?.setAttribute('aria-expanded', 'true');
            }
            
            fileListItem.replaceWith(newFileItem);
            
            // Focus the new play button
            const newPlayButton = newFileItem.querySelector('.play-button');
            if(newPlayButton) setTimeout(() => newPlayButton.focus(), 50);
        }
    }

    // --- Player Logic ---
    function streamVideo(title, url, filenameForAudioCheck, isFromCustom = false) {
        if (!videoContainer || !videoElement || !groupDetailContentEl || !groupDetailContentEl.contains(videoContainer)) {
            console.error("Video player or its container not correctly set up in Group Detail View.");
            if (videoContainer && groupDetailContentEl && !groupDetailContentEl.contains(videoContainer)) {
                groupDetailContentEl.appendChild(videoContainer);
            } else if (!videoContainer || !videoElement) {
                return;
            }
        }
        if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none';
        if (videoElement) videoElement.style.display = 'block';
        if (customControlsContainer) customControlsContainer.style.display = 'flex';
        if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; }
        if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; }
        clearCopyFeedback();
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
        if (wasGlobalMode) {
            resetToHomepage(); 
            lastFocusedElement = null;
            return;
        }
        // Attempt to focus the element that was clicked to close, or a sensible fallback
        let finalFocusTarget = elementToFocusAfter || lastFocusedElement;
        
        if (!wasGlobalMode && currentViewMode === 'groupDetail' && groupDetailContentEl) {
            if (currentFileForAction && currentFileForAction.id) {
                const playedFileButton = groupDetailContentEl.querySelector(`.file-item[data-file-id="${currentFileForAction.id}"] .play-button`);
                 if (playedFileButton) finalFocusTarget = playedFileButton;
                 else { // If play button not found (e.g., after bypass), focus the file info
                    const fileInfoElement = groupDetailContentEl.querySelector(`.file-item[data-file-id="${currentFileForAction.id}"] .file-info-clickable`);
                    if (fileInfoElement) finalFocusTarget = fileInfoElement;
                 }
            }
            if (!finalFocusTarget) { // General fallback if no specific file action was related
                 const customUrlToggle = groupDetailContentEl.querySelector('.custom-url-toggle-button');
                 if (customUrlToggle) finalFocusTarget = customUrlToggle;
                 else finalFocusTarget = groupDetailContentEl; // Broadest fallback
            }
        }
        if (finalFocusTarget && typeof finalFocusTarget.focus === 'function') {
            setTimeout(() => { try { finalFocusTarget.focus({preventScroll: true}); } catch(e) {} }, 50);
        }
        lastFocusedElement = null;
        currentFileForAction = null;
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
                lastSearchTermForResults = currentState.searchTerm; 
                
                if (parsedState.viewMode === 'search' && currentState.searchTerm) {
                    currentViewMode = 'search'; 
                    activeResultsTab = typeof parsedState.activeTab === 'string' ? parsedState.activeTab : 'allFiles';
                    currentState.currentPage = typeof parsedState.currentPage === 'number' ? parsedState.currentPage : 1;
                    currentState.typeFilter = tabMappings[activeResultsTab]?.typeFilter || '';
                    if(searchInput) searchInput.value = currentState.searchTerm;
                } else if (parsedState.viewMode === 'groupDetail' && parsedState.currentGroupKey) {
                    // If loading into group detail, still start at homepage, URL handler will take over
                    currentViewMode = 'homepage'; 
                } else {
                    currentViewMode = 'homepage'; 
                    activeResultsTab = 'allFiles';
                    currentState.currentPage = 1;
                    currentState.typeFilter = '';
                    currentState.searchTerm = '';
                }
            } else { resetToDefaultState(); }
        } catch (e) { localStorage.removeItem(config.LOCAL_STORAGE_KEY); resetToDefaultState(); }
        currentGroupData = null; lastFocusedElement = null;
    }
    function resetToDefaultState() { currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc'; currentState.qualityFilter = ''; currentState.searchTerm = ''; currentState.currentPage = 1; currentState.typeFilter = ''; currentViewMode = 'homepage'; activeResultsTab = 'allFiles'; }

    // --- Initial Data Loading and Setup ---
    async function fetchApiData(params = {}, signal = null) {
        if (!params.id && searchAbortController) { searchAbortController.abort(); }
        let currentSignal = signal;
        if (!currentSignal && !params.id) { searchAbortController = new AbortController(); currentSignal = searchAbortController.signal; }
        else if (signal) {} else { const tempController = new AbortController(); currentSignal = tempController.signal; }
        const query = new URLSearchParams();
        if (!params.id) { // For search/list views
            query.set('page', params.page || currentState.currentPage);
            query.set('limit', params.limit || currentState.limit);
            query.set('sort', params.sort || currentState.sortColumn);
            query.set('sortDir', params.sortDir || currentState.sortDirection);
            const searchTerm = params.search !== undefined ? params.search : currentState.searchTerm;
            if (searchTerm) query.set('search', searchTerm);
            // Use the quality filter from params if provided (e.g., initial load), otherwise from current state
            const qualityFilter = params.quality !== undefined ? params.quality : currentState.qualityFilter;
            if (qualityFilter) query.set('quality', qualityFilter);
            const typeFilter = params.type !== undefined ? params.type : currentState.typeFilter;
            if (typeFilter) query.set('type', typeFilter);
        } else { // For fetching a specific item by ID (legacy link handling)
            query.set('id', params.id); 
        }
        const url = `${config.MOVIE_DATA_API_URL}?${query.toString()}`;
        try {
            const response = await fetch(url, { signal: currentSignal });
            if (!response.ok) { let errorBody = null; try { errorBody = await response.json(); } catch (_) {} const errorDetails = errorBody?.error || errorBody?.details || `Status: ${response.status}`; throw new Error(`API Error: ${errorDetails}`); }
            const data = await response.json();
            if (!params.id && activeResultsTab && tabMappings[activeResultsTab]) { 
                const activePagination = tabMappings[activeResultsTab]?.pagination;
                if (activePagination && data.totalPages !== undefined) {
                    activePagination.dataset.totalPages = data.totalPages;
                }
            }
            return data;
        } catch (error) { if (error.name === 'AbortError') { return null; } throw error; }
        finally { if (currentSignal === searchAbortController?.signal && !signal) { searchAbortController = null; } }
    }
    async function fetchAndRenderResults() {
        if (currentViewMode !== 'search') return;
        try {
            // API call will use currentState.qualityFilter
            const apiResponse = await fetchApiData(); 
            if (apiResponse === null) return; 
            renderActiveResultsView(apiResponse);
            saveStateToLocalStorage();
        } catch (error) {
            if (error.name !== 'AbortError' && activeResultsTab && tabMappings[activeResultsTab]) { 
                const { gridContainer } = tabMappings[activeResultsTab];
                if (gridContainer) { gridContainer.innerHTML = `<div class="error-message grid-status-message">Error loading results: ${error.message}. Please try again.</div>`; }
                Object.values(tabMappings).forEach(m => { if(m.pagination) m.pagination.style.display = 'none'; });
            }
        }
    }
    function populateQualityFilter(rawItems = []) { // Populates the GLOBAL quality filter
        if (!qualityFilterSelect) return;
        const currentSelectedValue = qualityFilterSelect.value || currentState.qualityFilter; // Use state if no value yet
        
        rawItems.forEach(item => { if (item.displayQuality && item.displayQuality !== 'N/A') { uniqueQualities.add(item.displayQuality); } });
        const sortedQualities = [...uniqueQualities].sort((a, b) => { const getScore = (q) => { q = String(q || '').toUpperCase().trim(); const resMatch = q.match(/^(\d{3,4})P$/); if (q === '4K' || q === '2160P') return 100; if (resMatch) return parseInt(resMatch[1], 10); if (q === '1080P') return 90; if (q === '720P') return 80; if (q === '480P') return 70; if (['WEBDL', 'BLURAY', 'BDRIP', 'BRRIP'].includes(q)) return 60; if (['WEBIP', 'HDTV', 'HDRIP'].includes(q)) return 50; if (['DVD', 'DVDRIP'].includes(q)) return 40; if (['DVDSCR', 'HC', 'HDCAM', 'TC', 'TS', 'CAM'].includes(q)) return 30; if (['HDR', 'DOLBY VISION', 'DV', 'HEVC', 'X25'].includes(q)) return 20; return 0; }; const scoreA = getScore(a); const scoreB = getScore(b); if (scoreA !== scoreB) return scoreB - scoreA; return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' }); });
        
        while (qualityFilterSelect.options.length > 1) { qualityFilterSelect.remove(1); }
        
        sortedQualities.forEach(quality => { if (quality && quality !== 'N/A') { const option = document.createElement('option'); option.value = quality; option.textContent = quality; qualityFilterSelect.appendChild(option); } });
        
        qualityFilterSelect.value = [...qualityFilterSelect.options].some(opt => opt.value === currentSelectedValue) ? currentSelectedValue : "";
        currentState.qualityFilter = qualityFilterSelect.value; // Sync state with the dropdown value
        updateFilterIndicator();
    }
    function displayLoadError(message) { const errorHtml = `<div class="error-container" role="alert">${sanitize(message)}</div>`; if (searchFocusArea) searchFocusArea.innerHTML = ''; searchFocusArea.style.display = 'none'; if (resultsArea) resultsArea.innerHTML = ''; resultsArea.style.display = 'none'; if (updatesPreviewSection) updatesPreviewSection.innerHTML = ''; updatesPreviewSection.style.display = 'none'; if (groupDetailContentEl) groupDetailContentEl.innerHTML = ''; if (groupDetailViewEl) groupDetailViewEl.style.display = 'none'; if (pageFooter) pageFooter.style.display = 'none'; container.classList.remove('results-active', 'item-detail-active'); if (mainErrorArea) { mainErrorArea.innerHTML = errorHtml; } else if (container) { container.insertAdjacentHTML('afterbegin', errorHtml); } if (pageLoader) pageLoader.style.display = 'none'; }
    
    async function initializeApp() { 
        isInitialLoad = true; 
        if (pageLoader) pageLoader.style.display = 'flex';
    
        loadStateFromLocalStorage(); 
        // Initial population of global quality filter based on stored state
        if (qualityFilterSelect) { 
            qualityFilterSelect.value = currentState.qualityFilter || ''; 
            updateFilterIndicator(); 
        }
    
        try {
            // Fetch a broader set of initial data to populate uniqueQualities for the filter
            const initialDataLimit = Math.max(500, config.UPDATES_PREVIEW_INITIAL_COUNT * 5);
            const initialApiData = await fetchApiData({ limit: initialDataLimit, sort: 'lastUpdated', sortDir: 'desc' });
            if (initialApiData && initialApiData.items && initialApiData.items.length > 0) {
                const preprocessedInitialItems = initialApiData.items.map(preprocessMovieData);
                localSuggestionData = preprocessedInitialItems; // For search suggestions
                populateQualityFilter(preprocessedInitialItems); // Populate global quality filter options
            } else {
                localSuggestionData = [];
                populateQualityFilter([]); // Still call to set up the dropdown, even if empty
            }
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.error("Error during initial suggestion/quality data fetch:", e);
                localSuggestionData = [];
                populateQualityFilter([]);
            }
        }
    
        await handleUrlChange(); // This will set view mode and trigger search/group detail if needed
    
        // If after URL handling, we are in search mode, and results haven't loaded (e.g. initial load with search query)
        if (currentViewMode === 'search' && currentState.searchTerm) {
            const activeGrid = tabMappings[activeResultsTab]?.gridContainer;
            if (activeGrid && (activeGrid.querySelector('.loading-message') || activeGrid.innerHTML.trim() === '')) { 
                 if(searchInput) searchInput.value = currentState.searchTerm; // Ensure input matches state
                 // No need to explicitly call fetchAndRenderResults if handleUrlChange->handleSearchSubmit already did
            }
        }
    
        const urlParams = new URLSearchParams(window.location.search);
        if (pageLoader && pageLoader.style.display !== 'none' &&
            !(currentViewMode === 'groupDetail' || urlParams.get('shareId') || urlParams.get('viewId')) ) {
             pageLoader.style.display = 'none';
        }
    }

    // --- Event Handling Setup ---
    function handleContentClick(event) {
         const target = event.target;
         lastFocusedElement = target;

         const fileInfoTrigger = target.closest('.file-info-clickable');
         if (fileInfoTrigger && target.closest('#item-detail-content')) {
             event.preventDefault(); 
             const fileItem = fileInfoTrigger.closest('.file-item');
             if (fileItem) {
                 const fileActions = fileItem.querySelector('.file-actions');
                 if (fileActions) {
                     const isCurrentlyExpanded = fileActions.classList.contains('actions-expanded');
                     const allFileItems = fileItem.parentElement.querySelectorAll('.file-item');
                     allFileItems.forEach(item => {
                         const otherActions = item.querySelector('.file-actions');
                         const otherInfo = item.querySelector('.file-info-clickable');
                         if (otherActions && otherActions !== fileActions && otherActions.classList.contains('actions-expanded')) {
                             otherActions.classList.remove('actions-expanded');
                             if (otherInfo) otherInfo.classList.remove('info-active');
                             if (otherInfo) otherInfo.setAttribute('aria-expanded', 'false');
                         }
                     });
                     if (isCurrentlyExpanded) {
                         fileActions.classList.remove('actions-expanded');
                         fileInfoTrigger.classList.remove('info-active');
                         fileInfoTrigger.setAttribute('aria-expanded', 'false');
                     } else {
                         fileActions.classList.add('actions-expanded');
                         fileInfoTrigger.classList.add('info-active');
                         fileInfoTrigger.setAttribute('aria-expanded', 'true');
                     }
                 }
             }
             return; 
         }

         const actionButtonInFileItem = target.closest('.file-actions .button');
         if (actionButtonInFileItem && target.closest('#item-detail-content')) {
             handleGroupDetailActionClick(event, actionButtonInFileItem);
             return;
         }
        
         const customUrlToggleBtn = target.closest('.custom-url-toggle-button[data-action="toggle-custom-url-player"]');
         if (customUrlToggleBtn && target.closest('#item-detail-content')) {
             event.preventDefault();
             toggleCustomUrlInputInPlayer(customUrlToggleBtn);
             return;
         }

         const groupGridItemTrigger = target.closest('.grid-item, .update-item');
         if (groupGridItemTrigger) {
             event.preventDefault();
             const groupKey = groupGridItemTrigger.dataset.groupKey;
             if (groupKey) { 
                 if (currentViewMode === 'search' && currentState.searchTerm) {
                     lastSearchTermForResults = currentState.searchTerm;
                 }
                 navigateToGroupView(groupKey); 
             } else { 
                 console.error("Could not find groupKey for grid item navigation."); 
             }
             return;
         }
         
         if (target.matches('.close-btn') && target.closest('#videoContainer')) {
              event.preventDefault(); 
              closePlayer(target);
              return;
          }
    }
    function handleGroupDetailActionClick(event, button) {
        if (!button || !currentGroupData) return; 
        const action = button.dataset.action;
        const fileId = button.dataset.fileId; 
        currentFileForAction = null; 
        if (fileId && currentGroupData.files) {
             currentFileForAction = currentGroupData.files.find(f => String(f.id) === String(fileId));
        }
        if (action && action.endsWith('-file') && !action.startsWith('bypass-') && !currentFileForAction) {
            console.warn(`Action ${action} requires a file context, but file ${fileId} not found in current group.`);
            return;
        }
        if (action && (action.startsWith('bypass-')) && !button.dataset.hubcloudUrl && !button.dataset.gdflixUrl) {
             console.warn(`Bypass action ${action} missing source URL on button.`);
             if (!currentFileForAction && fileId) { 
                currentFileForAction = currentGroupData.files.find(f => String(f.id) === String(fileId));
             }
             if (!currentFileForAction) {
                console.warn(`Bypass action ${action} could not find file item for ID ${fileId} to update later.`);
                return;
             }
        }
        switch (action) {
            case 'play-file': if (currentFileForAction && currentFileForAction.url) { event.preventDefault(); streamVideo(button.dataset.title, currentFileForAction.url, button.dataset.filename); } break;
            case 'copy-vlc-file': if (currentFileForAction && currentFileForAction.url) { event.preventDefault(); copyVLCLink(button, currentFileForAction.url); } break;
            case 'open-intent-file': if (currentFileForAction && currentFileForAction.url) { event.preventDefault(); openWithIntent(currentFileForAction.url, button.dataset.title); } break;
            case 'share-file': event.preventDefault(); handleShareClick(button); break;
            case 'bypass-hubcloud-file': {
                const hubUrl = button.dataset.hubcloudUrl;
                if (hubUrl && currentFileForAction) { event.preventDefault(); triggerHubCloudBypassForFile(button, currentFileForAction); } 
                else { console.warn("HubCloud bypass: Missing URL or file context for update.", hubUrl, currentFileForAction); }
                break;
            }
            case 'bypass-gdflix-file': {
                const gdflixUrl = button.dataset.gdflixUrl;
                if (gdflixUrl && currentFileForAction) { event.preventDefault(); triggerGDFLIXBypassForFile(button, currentFileForAction); } 
                else { console.warn("GDFLIX bypass: Missing URL or file context for update.", gdflixUrl, currentFileForAction); }
                break;
            }
            default: if (button.tagName === 'A' && button.href && button.target === '_blank') {} break;
        }
    }
    function handleGlobalCustomUrlClick(event) { event.preventDefault(); lastFocusedElement = event.target; if (!container || !videoContainer || !playerCustomUrlSection || !playerCustomUrlInput) return; closePlayerIfNeeded(null); if (videoContainer.parentElement !== container) { if (videoContainer.parentElement) { videoContainer.parentElement.removeChild(videoContainer); } container.appendChild(videoContainer); } else { if (!container.contains(videoContainer)) { container.appendChild(videoContainer); } } if(resultsArea) resultsArea.style.display = 'none'; if(groupDetailViewEl) groupDetailViewEl.style.display = 'none'; if(searchFocusArea) searchFocusArea.style.display = 'none'; if(pageFooter) pageFooter.style.display = 'none'; isGlobalCustomUrlMode = true; videoContainer.classList.add('global-custom-url-mode'); if (videoElement) videoElement.style.display = 'none'; if (customControlsContainer) customControlsContainer.style.display = 'none'; if (videoTitle) videoTitle.innerText = 'Play Custom URL'; if (vlcBox) vlcBox.style.display = 'none'; if (audioWarningDiv) audioWarningDiv.style.display = 'none'; playerCustomUrlSection.style.display = 'flex'; if (playerCustomUrlInput) playerCustomUrlInput.value = ''; if (playerCustomUrlFeedback) playerCustomUrlFeedback.textContent = ''; videoContainer.style.display = 'flex'; if (playerCustomUrlInput) { setTimeout(() => playerCustomUrlInput.focus(), 50); } }
    function handleGlobalPlayCustomUrl(event) {
        event.preventDefault();
        if (!playerCustomUrlInput || !playerCustomUrlFeedback) return;
        const customUrlRaw = playerCustomUrlInput.value.trim();
        playerCustomUrlFeedback.textContent = '';
        if (!customUrlRaw) {
            playerCustomUrlFeedback.textContent = 'Please enter a URL.';
            playerCustomUrlInput.focus();
            return;
        }
        let customUrlEncoded;
        try {
            const urlObject = new URL(customUrlRaw);
            customUrlEncoded = urlObject.href;
            customUrlEncoded = customUrlEncoded.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
            customUrlEncoded = customUrlEncoded.replace(/\+/g, '%2B');
        } catch (e) {
            playerCustomUrlFeedback.textContent = 'Invalid URL format.';
            playerCustomUrlInput.focus();
            return;
        }
        if(playerCustomUrlSection) playerCustomUrlSection.style.display = 'none';
        if(videoElement) videoElement.style.display = 'block';
        if(customControlsContainer) customControlsContainer.style.display = 'flex';
        streamVideo("Custom URL Video", customUrlEncoded, null, true);
    }
    function toggleCustomUrlInputInPlayer(toggleButton, triggeredByError = false) {
        if (!videoContainer || !playerCustomUrlSection || !videoElement || !customControlsContainer) return;
        if (videoContainer.style.display === 'none') {
            videoContainer.style.display = 'flex';
            if (videoElement) videoElement.style.display = 'none';
            if (customControlsContainer) customControlsContainer.style.display = 'none';
        }
        const isHidden = playerCustomUrlSection.style.display === 'none';
        playerCustomUrlSection.style.display = isHidden ? 'flex' : 'none';
        if (videoElement) videoElement.style.display = isHidden ? 'none' : 'block';
        if (customControlsContainer) customControlsContainer.style.display = isHidden ? 'none' : 'flex';
        if (vlcBox) vlcBox.style.display = isHidden ? 'none' : (videoElement.src ? 'block' : 'none');
        if(audioWarningDiv) {
            if (isHidden && audioWarningDiv.style.display !== 'none' && !audioWarningDiv.innerHTML.includes('Playback Error:')) {
                audioWarningDiv.style.display = 'none';
            } else if (!isHidden && audioWarningDiv.style.display === 'none' && videoElement.src) {
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
        if (isHidden && !triggeredByError) {
            if (playerCustomUrlInput) setTimeout(() => playerCustomUrlInput.focus(), 50);
            if (videoTitle && !isGlobalCustomUrlMode) videoTitle.innerText = "Play Custom URL";
        } else if (!isHidden) {
            setTimeout(() => toggleButton.focus(), 50);
             if (videoTitle && currentFileForAction && !isGlobalCustomUrlMode) videoTitle.innerText = currentFileForAction.displayFilename;
        }
        setTimeout(() => { videoContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150);
    }
    function playFromCustomUrlInputInPlayer(playButton) {
        const container = playButton.closest('#playerCustomUrlSection');
        if (!container) return;
        const inputField = container.querySelector('#playerCustomUrlInput');
        const feedbackSpan = container.querySelector('.player-custom-url-feedback');
        if (!inputField || !feedbackSpan) return;
        const customUrlRaw = inputField.value.trim();
        feedbackSpan.textContent = '';
        if (!customUrlRaw) {
            feedbackSpan.textContent = 'Please enter a URL.';
            inputField.focus();
            return;
        }
        let customUrlEncoded;
        try {
            const urlObject = new URL(customUrlRaw);
            customUrlEncoded = urlObject.href;
            customUrlEncoded = customUrlEncoded.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
            customUrlEncoded = customUrlEncoded.replace(/\+/g, '%2B');
        }
        catch (e) {
            feedbackSpan.textContent = 'Invalid URL format.';
            inputField.focus();
            return;
        }
        isGlobalCustomUrlMode = false; // Ensure not in global mode if playing from detail view player
        if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none';
        if (videoElement) videoElement.style.display = 'block';
        if (customControlsContainer) customControlsContainer.style.display = 'flex';
        streamVideo("Custom URL Video", customUrlEncoded, null, true);
    }

    // --- HubCloud/GDFLIX Bypass Logic ---
    function _encodeBypassResultUrl(rawUrl) {
        try {
            const urlObject = new URL(rawUrl);
            let href = urlObject.href;
            href = href.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
            href = href.replace(/\+/g, '%2B');
            return href;
        } catch (e) {
            console.error("Error encoding bypassed URL during _encodeBypassResultUrl, using basic encoding:", rawUrl, e);
            let fallbackEncodedUrl = rawUrl.replace(/ /g, '%20');
            fallbackEncodedUrl = encodeURI(fallbackEncodedUrl);
            fallbackEncodedUrl = fallbackEncodedUrl.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
            fallbackEncodedUrl = fallbackEncodedUrl.replace(/\+/g, '%2B');
            return fallbackEncodedUrl;
        }
    }
    async function triggerHubCloudBypassForFile(buttonElement, fileToUpdate) { 
        const hubcloudUrl = buttonElement.dataset.hubcloudUrl || fileToUpdate.hubcloud_link; 
        if (!hubcloudUrl) { setBypassButtonState(buttonElement, 'error', 'Missing URL'); return; }
        if (!fileToUpdate || !fileToUpdate.id) { setBypassButtonState(buttonElement, 'error', 'Context Error'); return; }
        setBypassButtonState(buttonElement, 'loading');
        const apiController = new AbortController();
        const timeoutId = setTimeout(() => { apiController.abort(); setBypassButtonState(buttonElement, 'error', 'Timeout'); }, config.BYPASS_TIMEOUT);
        try {
            const response = await fetch(config.BYPASS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hubcloudUrl }), signal: apiController.signal });
            clearTimeout(timeoutId);
            if (!response.ok) { let errorDetails = `HTTP Error: ${response.status}`; try { errorDetails = (await response.json()).details || errorDetails; } catch (_) {} throw new Error(errorDetails); }
            const result = await response.json();
            if (result.success && result.finalUrl) {
                const encodedFinalUrl = _encodeBypassResultUrl(result.finalUrl);
                setBypassButtonState(buttonElement, 'success', 'Success!');
                updateFileInGroupAfterBypass(fileToUpdate.id, encodedFinalUrl);
            } else { throw new Error(result.details || result.error || 'Unknown HubCloud bypass failure'); }
        } catch (error) { clearTimeout(timeoutId); if (error.name === 'AbortError' && !apiController.signal.aborted) { setBypassButtonState(buttonElement, 'error', 'Timeout'); } else if (error.name === 'AbortError') { setBypassButtonState(buttonElement, 'idle'); } else { setBypassButtonState(buttonElement, 'error', `Failed: ${error.message.substring(0, 50)}`); } }
    }
    async function triggerGDFLIXBypassForFile(buttonElement, fileToUpdate) { 
        const gdflixUrl = buttonElement.dataset.gdflixUrl || fileToUpdate.gdflix_link; 
        if (!gdflixUrl) { setBypassButtonState(buttonElement, 'error', 'Missing URL'); return; }
        if (!fileToUpdate || !fileToUpdate.id) { setBypassButtonState(buttonElement, 'error', 'Context Error'); return; }
        setBypassButtonState(buttonElement, 'loading');
        const apiController = new AbortController();
        const timeoutId = setTimeout(() => { apiController.abort(); setBypassButtonState(buttonElement, 'error', 'Timeout'); }, config.BYPASS_TIMEOUT);
        try {
            const response = await fetch(config.GDFLIX_BYPASS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gdflixUrl }), signal: apiController.signal });
            clearTimeout(timeoutId);
            if (!response.ok) { let errorDetails = `HTTP Error: ${response.status}`; try { errorDetails = (await response.json()).error || errorDetails; } catch (_) {} throw new Error(errorDetails); }
            const result = await response.json();
            if (result.success && result.finalUrl) {
                const encodedFinalUrl = _encodeBypassResultUrl(result.finalUrl);
                setBypassButtonState(buttonElement, 'success', 'Success!');
                updateFileInGroupAfterBypass(fileToUpdate.id, encodedFinalUrl);
            } else { throw new Error(result.error || 'Unknown GDFLIX bypass failure'); }
        } catch (error) { clearTimeout(timeoutId); if (error.name === 'AbortError' && !apiController.signal.aborted) { setBypassButtonState(buttonElement, 'error', 'Timeout'); } else if (error.name === 'AbortError') { setBypassButtonState(buttonElement, 'idle'); } else { setBypassButtonState(buttonElement, 'error', `Failed: ${error.message.substring(0, 50)}`); } }
    }
    function setBypassButtonState(buttonElement, state, message = null) { if (!buttonElement) return; const feedbackSpan = buttonElement.nextElementSibling; const iconSpan = buttonElement.querySelector('.button-icon'); const spinnerSpan = buttonElement.querySelector('.button-spinner'); const textSpan = buttonElement.querySelector('.button-text'); const isHubCloud = buttonElement.classList.contains('hubcloud-bypass-button'); const defaultText = isHubCloud ? 'Bypass HubCloud' : 'Bypass GDFLIX'; const defaultIconHTML = isHubCloud ? '☁️' : '🎬'; buttonElement.classList.remove('loading', 'error', 'success'); buttonElement.disabled = false; if (feedbackSpan) { feedbackSpan.style.display = 'none'; feedbackSpan.className = 'bypass-feedback'; } if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; clearTimeout(bypassFeedbackTimeout); switch (state) { case 'loading': buttonElement.classList.add('loading'); buttonElement.disabled = true; if (textSpan) textSpan.textContent = 'Bypassing...'; if (spinnerSpan) spinnerSpan.style.display = 'inline-block'; if (iconSpan) iconSpan.style.display = 'none'; if (feedbackSpan) { feedbackSpan.textContent = 'Please wait...'; feedbackSpan.classList.add('loading', 'show'); feedbackSpan.style.display = 'inline-block'; } break; case 'success': buttonElement.classList.add('success'); buttonElement.disabled = true; if (textSpan) textSpan.textContent = 'Success!'; if (iconSpan) iconSpan.innerHTML = '✅'; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.textContent = message || 'Success!'; feedbackSpan.classList.add('success', 'show'); feedbackSpan.style.display = 'inline-block'; } break; case 'error': buttonElement.classList.add('error'); buttonElement.disabled = false; if (textSpan) textSpan.textContent = defaultText; if (iconSpan) iconSpan.innerHTML = defaultIconHTML; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.textContent = message || 'Failed'; feedbackSpan.classList.add('error', 'show'); feedbackSpan.style.display = 'inline-block'; bypassFeedbackTimeout = setTimeout(() => { if (feedbackSpan.classList.contains('show')) { feedbackSpan.classList.remove('show', 'error', 'loading'); feedbackSpan.style.display = 'none'; feedbackSpan.textContent = ''; } }, 4000); } break; case 'idle': default: buttonElement.disabled = false; if (textSpan) textSpan.textContent = defaultText; if (iconSpan) iconSpan.innerHTML = defaultIconHTML; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.classList.remove('show', 'error', 'loading'); feedbackSpan.style.display = 'none'; feedbackSpan.textContent = ''; } break; } }

    // --- Add Event Listeners ---
    document.addEventListener('DOMContentLoaded', async () => {
         await initializeApp(); 
         if (searchInput) { searchInput.addEventListener('input', handleSearchInput); searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSearchSubmit(); } else if (event.key === 'Escape') { suggestionsContainer.style.display = 'none'; } }); searchInput.addEventListener('search', handleSearchClear); searchInput.addEventListener('blur', () => { setTimeout(() => { const searchButton = document.getElementById('searchSubmitButton'); if (document.activeElement !== searchInput && !suggestionsContainer.contains(document.activeElement) && document.activeElement !== searchButton) { suggestionsContainer.style.display = 'none'; } }, 150); }); }
         
         if (qualityFilterSelect) { // Global quality filter listener
             qualityFilterSelect.addEventListener('change', triggerFilterChange); 
         }
         
         if (container) { 
             container.addEventListener('click', handleContentClick); 
             container.addEventListener('keydown', (event) => {
                 const fileInfoTrigger = event.target.closest('.file-info-clickable');
                 if (fileInfoTrigger && (event.key === 'Enter' || event.key === ' ')) {
                     event.preventDefault();
                     handleContentClick({ target: fileInfoTrigger }); // Simulate a click event on the trigger
                 }
             });
         }

         if (playCustomUrlGlobalButton) { playCustomUrlGlobalButton.addEventListener('click', handleGlobalCustomUrlClick); }
         if (playerPlayCustomUrlButton) {
            playerPlayCustomUrlButton.addEventListener('click', (event) => {
                event.preventDefault();
                lastFocusedElement = event.target;
                if (isGlobalCustomUrlMode) {
                    handleGlobalPlayCustomUrl(event);
                } else {
                    playFromCustomUrlInputInPlayer(event.target);
                }
            });
         }
         document.addEventListener('keydown', handlePlayerKeyboardShortcuts);
         document.addEventListener('click', (event) => {
            if (searchInput && suggestionsContainer && suggestionsContainer.style.display === 'block') { const searchWrapper = searchInput.closest('.search-input-wrapper'); if (searchWrapper && !searchWrapper.contains(event.target)) { suggestionsContainer.style.display = 'none'; } }
            if (videoContainer && videoContainer.style.display !== 'none') {
                const clickedInsidePlayer = videoContainer.contains(event.target);
                let clickedOnPotentialTrigger = false;
                if (isGlobalCustomUrlMode) {
                    clickedOnPotentialTrigger = playCustomUrlGlobalButton && playCustomUrlGlobalButton.contains(event.target);
                } else if (currentViewMode === 'groupDetail' && groupDetailContentEl) {
                     clickedOnPotentialTrigger = groupDetailContentEl.contains(event.target) &&
                        (event.target.closest('.play-button') || event.target.closest('.custom-url-toggle-button') || event.target.closest('.file-info-clickable'));
                }
                if (!clickedInsidePlayer && !clickedOnPotentialTrigger) { 
                    const isPlayerButton = event.target.closest('#videoContainer .button') || event.target.closest('#videoContainer select') || event.target.closest('#videoContainer input[type="range"]');
                    if(!isPlayerButton) closePlayer(event.target); 
                }
            }
         }, false);
         if(videoElement) { videoElement.addEventListener('volumechange', () => { if (volumeSlider && Math.abs(parseFloat(volumeSlider.value) - videoElement.volume) > 0.01) { volumeSlider.value = videoElement.volume; } updateMuteButton(); try { localStorage.setItem(config.PLAYER_VOLUME_KEY, String(videoElement.volume)); } catch (e) {} }); videoElement.addEventListener('ratechange', () => { if(playbackSpeedSelect && playbackSpeedSelect.value !== String(videoElement.playbackRate)) { playbackSpeedSelect.value = String(videoElement.playbackRate); } try { localStorage.setItem(config.PLAYER_SPEED_KEY, String(videoElement.playbackRate)); } catch (e) {} }); videoElement.addEventListener('loadedmetadata', populateAudioTrackSelector); videoElement.removeEventListener('error', handleVideoError); videoElement.addEventListener('error', handleVideoError); }
         document.addEventListener('fullscreenchange', handleFullscreenChange); document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
     });
})();
// --- END OF script.js ---
