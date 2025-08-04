console.log('🚀 Enhanced Universal Price Comparator v3.3 - Performance Optimized:', window.location.href);

// ===== PERFORMANCE CONFIGURATION =====
const PERF_CONFIG = {
    DEBUG_LOGGING: true,           // Set true for debugging (reduces 1078+ logs to <10)
    MAX_ANIMATION_DELAY: 200,       // Animation cap in ms (was 50+ seconds)
    VENDOR_CHUNK_SIZE: 25,          // Vendors per chunk (was processing all 1078 at once)
    ENABLE_VIRTUAL_SCROLL: true,    // Lazy loading for search results
    MAX_SEARCH_RESULTS: 200,        // Limit search results to prevent UI lag
    MAX_VISIBLE_RESULTS: 50,        // Initially show only 50 results
    RATING_THRESHOLD: 4.2,          // Changed from 4.5 to 4.2 as requested
    CACHE_SIZE_RATINGS: 500,        // Rating cache size
    CACHE_SIZE_SEARCH: 200          // Search cache size
};

// ===== PERFORMANCE CACHE CLASS =====
class PerformanceCache {
    constructor(maxSize = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.hitCount = 0;
        this.missCount = 0;
    }

    get(key) {
        if (this.cache.has(key)) {
            this.hitCount++;
            const item = this.cache.get(key);
            // Move to end (LRU)
            this.cache.delete(key);
            this.cache.set(key, item);
            return item;
        }
        this.missCount++;
        return null;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Remove oldest entry
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    clear() {
        this.cache.clear();
        this.hitCount = 0;
        this.missCount = 0;
    }

    getStats() {
        const total = this.hitCount + this.missCount;
        const hitRate = total > 0 ? (this.hitCount / total * 100).toFixed(1) : 0;
        return {
            size: this.cache.size,
            hitRate: `${hitRate}%`,
            hits: this.hitCount,
            misses: this.missCount
        };
    }
}

// ===== OPTIMIZED LOGGING SYSTEM =====
const Logger = {
    debug: PERF_CONFIG.DEBUG_LOGGING ? console.log : () => {},
    info: PERF_CONFIG.DEBUG_LOGGING ? console.info : () => {},
    warn: console.warn, // Always show warnings
    error: console.error, // Always show errors
    performance: PERF_CONFIG.DEBUG_LOGGING ? console.log : () => {}
};

const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

const throttle = (func, limit) => {
    let lastFunc;
    let lastRan;
    return function(...args) {
        if (!lastRan) {
            func.apply(this, args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(() => {
                if ((Date.now() - lastRan) >= limit) {
                    func.apply(this, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
};

class DOMCache {
    constructor() {
        this.cache = new Map();
    }

    get(selector) {
        if (!this.cache.has(selector)) {
            this.cache.set(selector, document.querySelectorAll(selector));
        }
        return this.cache.get(selector);
    }

    clear() {
        this.cache.clear();
    }

    invalidate(selector) {
        this.cache.delete(selector);
    }
}

class ExtensionState {
    constructor() {
        this.currentPageType = null;
        this.lastUrl = window.location.href;
        this.isInitialized = false;
        this.urlChangeCount = 0;
        this.navigationInterval = null;
        this.comparisonData = {};
        this.vendorInfo = {};
        this.pairedVendors = new Set();
        this.processedVendors = new Set();
        this.allProductElements = new WeakSet();
        this.activeObservers = [];
        this.vendorList = [];
        this.performanceMetrics = {
            initTime: 0,
            processTime: 0,
            apiCalls: 0,
            vendorsProcessed: 0,
            ratingsExtracted: 0
        };
        this.domCache = new DOMCache();
        
        // ===== PERFORMANCE CACHES =====
        this.ratingCache = new PerformanceCache(PERF_CONFIG.CACHE_SIZE_RATINGS);
        this.searchCache = new PerformanceCache(PERF_CONFIG.CACHE_SIZE_SEARCH);
        this.processedElements = new WeakSet(); // Track processed elements
    }

    reset() {
        this.comparisonData = {};
        this.vendorInfo = {};
        this.pairedVendors = new Set();
        this.processedVendors = new Set();
        this.allProductElements = new WeakSet();
        this.vendorList = [];
        this.domCache.clear();
        this.ratingCache.clear();
        this.searchCache.clear();
        this.processedElements = new WeakSet();
    }

    cleanup() {
        this.activeObservers.forEach(observer => observer.disconnect());
        this.activeObservers = [];
        this.domCache.clear();
        this.vendorList = [];
        this.ratingCache.clear();
        this.searchCache.clear();
        if (this.navigationInterval) {
            clearInterval(this.navigationInterval);
        }
    }

    // ===== PERFORMANCE REPORTING =====
    getPerformanceReport() {
        return {
            ...this.performanceMetrics,
            ratingCacheStats: this.ratingCache.getStats(),
            searchCacheStats: this.searchCache.getStats(),
            processedElementsCount: this.processedElements ? 'WeakSet' : 0
        };
    }
}

const state = new ExtensionState();

class SearchManager {
    constructor() {
        this.history = this.loadFromStorage('spVsTpSearchHistory');
        this.favorites = this.loadFromStorage('spVsTpFavorites');
        this.searchStats = this.loadFromStorage('spVsTpSearchStats');
        this.currentCategory = 'all';
        this.maxPrice = null;
        this.isSearching = false;
        this.searchTimeout = null;
        this.searchResults = [];
        this.filteredResults = [];
        this.currentSort = 'relevance';
        this.searchStartTime = null;
        
        // ===== VIRTUAL SCROLLING STATE =====
        this.visibleResults = PERF_CONFIG.MAX_VISIBLE_RESULTS;
        this.isVirtualScrollEnabled = PERF_CONFIG.ENABLE_VIRTUAL_SCROLL;

        if (!this.searchStats || typeof this.searchStats !== 'object') {
            this.searchStats = {
                totalSearches: 0,
                averageResultCount: 0,
                popularQueries: {},
                lastSearchTime: null
            };
            this.saveToStorage('spVsTpSearchStats', this.searchStats);
        }

        if (!this.searchStats.popularQueries || typeof this.searchStats.popularQueries !== 'object') {
            this.searchStats.popularQueries = {};
            this.saveToStorage('spVsTpSearchStats', this.searchStats);
        }
    }

    loadFromStorage(key) {
        try {
            const data = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(data) ? data : (data || []);
        } catch (e) {
            Logger.warn(`Failed to load ${key}:`, e);
            return [];
        }
    }

    saveToStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            Logger.warn('Failed to save to storage:', e);
        }
    }

    addToHistory(query) {
        if (!query || query.length < 2) return;

        const normalizedQuery = query.trim().toLowerCase();
        const idx = this.history.findIndex(item =>
            (typeof item === 'string' ? item : item.query).toLowerCase() === normalizedQuery
        );

        const searchItem = {
            query: query.trim(),
            timestamp: Date.now(),
            resultCount: this.searchResults.length
        };

        if (idx !== -1) {
            this.history.splice(idx, 1);
        }

        this.history.unshift(searchItem);
        if (this.history.length > 20) this.history.pop();

        this.saveToStorage('spVsTpSearchHistory', this.history);
        this.updateSearchStats(query);
    }

    updateSearchStats(query) {
        this.searchStats.totalSearches++;
        this.searchStats.lastSearchTime = Date.now();

        const currentAvg = this.searchStats.averageResultCount || 0;
        this.searchStats.averageResultCount = Math.round(
            (currentAvg + this.searchResults.length) / 2
        );

        this.saveToStorage('spVsTpSearchStats', this.searchStats);
        this.updateStatsDisplay();
    }

    updateStatsDisplay() {
        const statsElement = document.querySelector('.search-stats');
        if (statsElement) {
            statsElement.innerHTML = `
                <span class="stats-item">کل جستجوها: ${this.formatNumber(this.searchStats.totalSearches)}</span>
                <span class="stats-separator">•</span>
                <span class="stats-item">علاقه‌مندی‌ها: ${this.formatNumber(this.favorites.length)}</span>
            `;
        }
    }

    formatNumber(num) {
        return new Intl.NumberFormat('fa-IR').format(num || 0);
    }

    toggleFavorite(name) {
        const idx = this.favorites.findIndex(fav =>
            (typeof fav === 'string' ? fav : fav.name) === name
        );

        if (idx !== -1) {
            this.favorites.splice(idx, 1);
        } else {
            this.favorites.push({
                name: name,
                timestamp: Date.now(),
                source: state.currentPageType
            });
        }

        if (this.favorites.length > 50) this.favorites.pop();
        this.saveToStorage('spVsTpFavorites', this.favorites);
        this.updateStatsDisplay();
    }

    isFavorite(name) {
        return this.favorites.some(fav =>
            (typeof fav === 'string' ? fav : fav.name) === name
        );
    }

    clearHistory() {
        this.history = [];
        this.saveToStorage('spVsTpSearchHistory', this.history);
    }

    resetStats() {
        this.searchStats = {
            totalSearches: 0,
            averageResultCount: 0,
            popularQueries: {},
            lastSearchTime: null
        };
        this.saveToStorage('spVsTpSearchStats', this.searchStats);
        this.updateStatsDisplay();
    }

    // ===== VIRTUAL SCROLLING METHODS =====
    loadMoreResults() {
        if (!this.isVirtualScrollEnabled) return false;
        
        const currentVisible = this.visibleResults;
        const totalResults = this.filteredResults.length;
        
        if (currentVisible >= totalResults) return false;
        
        this.visibleResults = Math.min(currentVisible + 25, totalResults);
        return true;
    }

    resetVirtualScroll() {
        this.visibleResults = PERF_CONFIG.MAX_VISIBLE_RESULTS;
    }
}

const searchManager = new SearchManager();

const PAGE_PATTERNS = {
    'snappfood-menu': [
        /snappfood\.ir\/restaurant\/menu\/-r-[a-zA-Z0-9]+/,
        /snappfood\.ir\/restaurant\/menu\/[a-zA-Z0-9]+\/?$/
    ],
    'tapsifood-menu': /tapsi\.food\/vendor\//,
    'snappfood-service': /snappfood\.ir\/service\/.+\/city\//,
    'snappfood-homepage': /^https?:\/\/(www\.)?snappfood\.ir\/?(\?.*)?$/
};

function detectPageType(url = window.location.href) {
    for (const [type, patterns] of Object.entries(PAGE_PATTERNS)) {
        if (Array.isArray(patterns)) {
            if (patterns.some(pattern => pattern.test(url))) {
                return type;
            }
        } else {
            if (patterns.test(url)) {
                return type;
            }
        }
    }
    return 'unknown';
}

function cleanupAll() {
    Logger.debug('🧹 Optimized cleanup starting...');
    const startTime = performance.now();

    const elementsToRemove = [
        '.sp-vs-tp-comparison-text',
        '#sp-vs-tp-widget-container',
        '#sp-vs-tp-widget-icon',
        '.sp-vs-tp-paired-vendor-textbox',
        '.sp-vs-tp-paired-vendor-badge',
        '.sp-vs-tp-high-rating-textbox',
        '.sp-vs-tp-recommendation-textbox',
        '.sp-vs-tp-recommendation-badge',
        '.sp-vs-tp-star-badge'
    ];

    const selector = elementsToRemove.join(', ');
    document.querySelectorAll(selector).forEach(el => el.remove());

    const classesToRemove = [
        'sp-vs-tp-cheaper', 'sp-vs-tp-expensive', 'sp-vs-tp-same-price',
        'sp-vs-tp-same-price-gray', 'sp-vs-tp-unpaired',
        'sp-vs-tp-vendor-paired', 'sp-vs-tp-vendor-high-rating', 'sp-vs-tp-vendor-hot-recommendation',
        'sp-vs-tp-vendor-premium' // New class for paired + high rating
    ];

    const classSelector = classesToRemove.map(cls => `.${cls}`).join(', ');
    document.querySelectorAll(classSelector).forEach(el => {
        el.classList.remove(...classesToRemove);
    });

    state.reset();

    const cleanupTime = performance.now() - startTime;
    Logger.performance(`✅ Optimized cleanup completed in ${cleanupTime.toFixed(2)}ms`);
}

const VENDOR_CODE_PATTERNS = {
    snappfood: [
        /-r-([a-zA-Z0-9]+)\/?/,
        /\/restaurant\/menu\/([a-zA-Z0-9]+)\/?$/
    ],
    tapsifood: /tapsi\.food\/vendor\/([a-zA-Z0-9]+)/
};

function extractVendorCodeFromUrl(url, platform) {
    const patterns = VENDOR_CODE_PATTERNS[platform];

    if (platform === 'snappfood') {
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    } else {
        const match = url.match(patterns);
        return match ? match[1] : null;
    }
}

// ===== OPTIMIZED RATING EXTRACTION SYSTEM =====
const PERSIAN_TO_WESTERN_MAP = {
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
};

const persianToWesternCache = new Map();

function persianToWestern(str) {
    if (!str) return str;
    
    if (persianToWesternCache.has(str)) {
        return persianToWesternCache.get(str);
    }
    
    let result = str.toString();
    for (const [persian, western] of Object.entries(PERSIAN_TO_WESTERN_MAP)) {
        result = result.replace(new RegExp(persian, 'g'), western);
    }
    
    persianToWesternCache.set(str, result);
    return result;
}

// ===== OPTIMIZED RATING EXTRACTION WITH CONTEXT AWARENESS =====
function extractRatingFromElement(element, context = 'restaurant') {
    if (!element) return null;
    
    // ===== PERFORMANCE OPTIMIZATION: Skip rating extraction for search results =====
    if (context === 'search' || element.classList?.contains('result-item')) {
        Logger.debug('🔍 Skipping rating extraction for search context');
        return null;
    }
    
    // ===== CHECK CACHE FIRST =====
    const cacheKey = element.outerHTML?.substring(0, 100) || element.textContent?.substring(0, 50);
    if (cacheKey) {
        const cached = state.ratingCache.get(cacheKey);
        if (cached !== null) {
            Logger.debug('🎯 Using cached rating:', cached);
            return cached;
        }
    }
    
    Logger.debug('🔍 Extracting rating from element (context: ' + context + ')');
    
    // Strategy 1: Direct CSS selector for SnappFood's rating element
    const ratingElement = element.querySelector('.sc-hKgILt.jsaCNc');
    if (ratingElement) {
        const ratingText = ratingElement.textContent.trim();
        Logger.debug('🎯 Found rating element:', ratingText);
        
        const westernText = persianToWestern(ratingText);
        const rating = parseFloat(westernText);
        
        if (!isNaN(rating) && rating >= 0 && rating <= 10) {
            Logger.debug('✅ Successfully extracted rating:', rating);
            // ===== CACHE THE RESULT =====
            if (cacheKey) state.ratingCache.set(cacheKey, rating);
            state.performanceMetrics.ratingsExtracted++;
            return rating;
        }
    }
    
    // Strategy 2: Look for RateCommentBadge container
    const rateContainer = element.querySelector('.RateCommentBadge__RateBox-sc-olkjn5-0');
    if (rateContainer) {
        const ratingSpan = rateContainer.querySelector('span.sc-hKgILt.jsaCNc');
        if (ratingSpan) {
            const ratingText = ratingSpan.textContent.trim();
            Logger.debug('🎯 Found rating in container:', ratingText);
            
            const westernText = persianToWestern(ratingText);
            const rating = parseFloat(westernText);
            
            if (!isNaN(rating) && rating >= 0 && rating <= 10) {
                Logger.debug('✅ Successfully extracted rating from container:', rating);
                if (cacheKey) state.ratingCache.set(cacheKey, rating);
                state.performanceMetrics.ratingsExtracted++;
                return rating;
            }
        }
    }
    
    // Strategy 3: Text-based search with Persian support (only if not search context)
    if (context !== 'search') {
        const elementText = element.textContent || '';
        const westernText = persianToWestern(elementText);
        
        const ratingPatterns = [
            /(\d+\.?\d*)\s*امتیاز/,
            /(\d+\.?\d*)\s*\(/,
            /(\d+\.?\d*)\s*⭐/,
            /(\d+\.?\d*)\s*★/,
        ];
        
        for (const pattern of ratingPatterns) {
            const match = westernText.match(pattern);
            if (match) {
                const rating = parseFloat(match[1]);
                if (!isNaN(rating) && rating >= 0 && rating <= 10) {
                    Logger.debug('✅ Successfully extracted rating via pattern:', rating, 'from:', match[0]);
                    if (cacheKey) state.ratingCache.set(cacheKey, rating);
                    state.performanceMetrics.ratingsExtracted++;
                    return rating;
                }
            }
        }
        
        // Strategy 4: Look for decimal numbers that could be ratings
        const decimalMatches = westernText.match(/\d+\.\d+/g);
        if (decimalMatches) {
            for (const match of decimalMatches) {
                const rating = parseFloat(match);
                if (rating >= 3.0 && rating <= 5.0) {
                    Logger.debug('✅ Found likely rating via decimal search:', rating);
                    if (cacheKey) state.ratingCache.set(cacheKey, rating);
                    state.performanceMetrics.ratingsExtracted++;
                    return rating;
                }
            }
        }
    }
    
    Logger.debug('❌ No rating found in element');
    // ===== CACHE NULL RESULT =====
    if (cacheKey) state.ratingCache.set(cacheKey, null);
    return null;
}

function normalizeVendorData(vendor) {
    if (vendor.sf_code && vendor.tf_code) {
        return {
            vendor_mapping: {
                id: vendor.id,
                sf_code: vendor.sf_code,
                sf_name: vendor.sf_name,
                tf_code: vendor.tf_code,
                tf_name: vendor.tf_name,
                business_line: vendor.business_line,
                created_at: vendor.created_at
            },
            item_count: 0
        };
    }

    if (vendor.vendor_mapping) {
        return vendor;
    }

    Logger.warn('Unexpected vendor data structure:', vendor);
    return vendor;
}

function getVendorMapping(vendor) {
    const normalized = normalizeVendorData(vendor);
    return normalized.vendor_mapping || normalized;
}

function getItemCount(vendor) {
    const normalized = normalizeVendorData(vendor);
    return normalized.item_count || 0;
}

// ===== UPDATED BADGE TEMPLATES WITH NEW COLOR SCHEME =====
const TEXT_BOX_TEMPLATES = {
    paired: {
        className: 'sp-vs-tp-paired-vendor-badge',
        text: 'ارسال رایگان از تپسی‌فود',
        backgroundColor: '#28a745', // Green
        icon: `<svg width="16" height="16" viewBox="0 0 20 20" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M14.5832 9.58325C14.1229 9.58325 13.7498 9.95635 13.7498 10.4166C13.7498 10.8768 14.1229 11.2499 14.5832 11.2499C15.0434 11.2499 15.4165 10.8768 15.4165 10.4166C15.4165 9.95635 15.0434 9.58325 14.5832 9.58325Z"></path>
            <path fill-rule="evenodd" clip-rule="evenodd" d="M7.55167 17.6256C5.58545 18.4597 3.42815 17.2569 2.99477 15.2849L2.80188 15.3599C2.54548 15.4596 2.25639 15.4264 2.02933 15.2711C1.80228 15.1157 1.6665 14.8584 1.6665 14.5833L1.6665 9.16659C1.6665 6.62223 2.7184 4.66703 4.31719 3.36431C5.89569 2.07812 7.96582 1.45825 9.99984 1.45825C12.0339 1.45825 14.104 2.07812 15.6825 3.36431C17.2813 4.66703 18.3332 6.62223 18.3332 9.16659V12.4999C18.3332 12.8344 18.1332 13.1364 17.8253 13.2671L7.55167 17.6256Z"></path>
        </svg>`
    },
    highRating: {
        className: 'sp-vs-tp-high-rating-badge',
        text: 'امتیاز بالا',
        backgroundColor: '#ffc107', // Yellow
        color: '#212529',
        icon: '⭐'
    },
    premium: {
        className: 'sp-vs-tp-premium-badge',
        text: 'پیشنهاد برتر',
        backgroundColor: '#6f42c1', // Purple
        color: 'white',
        icon: '👑' // Crown instead of star
    }
};

function createProfessionalBadge(type) {
    const template = TEXT_BOX_TEMPLATES[type];
    if (!template) return null;
    
    const badge = document.createElement('div');
    badge.className = template.className;

    if (type === 'paired') {
        badge.innerHTML = `
            <span class="sp-vs-tp-badge-icon">
                ${template.icon}
            </span>
            <span class="sp-vs-tp-badge-text">${template.text}</span>
        `;
    } else {
        badge.innerHTML = `${template.icon} ${template.text}`;
    }

    // Common styles
    Object.assign(badge.style, {
        display: 'flex !important',
        alignItems: 'center !important',
        gap: '6px !important',
        backgroundColor: template.backgroundColor + ' !important',
        color: (template.color || 'white') + ' !important',
        padding: type === 'paired' ? '8px 12px !important' : '4px 8px !important',
        borderRadius: type === 'paired' ? '8px !important' : '12px !important',
        fontSize: type === 'paired' ? '12px !important' : '10px !important',
        fontWeight: type === 'paired' ? '500 !important' : 'bold !important',
        fontFamily: "'IRANSansMobile', 'Vazirmatn', sans-serif !important",
        direction: 'rtl !important',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1) !important',
        border: '1px solid rgba(255,255,255,0.2) !important',
        lineHeight: '1.3 !important',
        textAlign: 'center !important',
        whiteSpace: 'nowrap !important',
        zIndex: '10 !important'
    });

    if (type === 'paired') {
        Object.assign(badge.style, {
            position: 'absolute !important',
            bottom: '70px !important',
            left: '8px !important',
            right: '8px !important',
            zIndex: '5 !important',
            marginTop: '8px !important'
        });
    } else {
        Object.assign(badge.style, {
            position: 'absolute !important',
            top: '8px !important',
            left: '8px !important'
        });
    }

    return badge;
}

function createTextBox(type, rating = null) {
    return createProfessionalBadge(type);
}

function createStarBadge() {
    return createProfessionalBadge('highRating');
}

function createPremiumBadge() {
    return createProfessionalBadge('premium');
}

function openCounterpartVendor() {
    if (state.currentPageType.startsWith('snappfood') && state.vendorInfo.tf_code) {
        window.open(`https://tapsi.food/vendor/${state.vendorInfo.tf_code}`, '_blank');
    } else if (state.currentPageType.startsWith('tapsifood') && state.vendorInfo.sf_code) {
        window.open(`https://snappfood.ir/restaurant/menu/${state.vendorInfo.sf_code}`, '_blank');
    }
}

function formatPrice(price) {
    return new Intl.NumberFormat('fa-IR').format(price);
}

function formatPercentage(percent) {
    return new Intl.NumberFormat('fa-IR').format(percent);
}

function formatNumber(num) {
    return new Intl.NumberFormat('fa-IR').format(num);
}

function trackSearchAnalytics(query, resultCount, searchTime) {
    const analytics = {
        query: query,
        resultCount: resultCount,
        searchTime: searchTime,
        timestamp: Date.now(),
        pageType: state.currentPageType,
        hasProductData: Object.keys(state.comparisonData).length > 0
    };

    Logger.debug('📊 Search analytics:', analytics);
}

// ===== OPTIMIZED SEARCH WITH CACHING =====
function performAdvancedSearch(query, list, input) {
    if (searchManager.searchTimeout) {
        clearTimeout(searchManager.searchTimeout);
    }

    searchManager.isSearching = true;
    updateSearchStatus('در حال جستجو...', true);

    searchManager.searchTimeout = setTimeout(() => {
        const startTime = performance.now();
        searchManager.searchStartTime = startTime;

        const category = searchManager.currentCategory;
        const hasProductData = Object.keys(state.comparisonData).length > 0;
        
        // ===== CHECK SEARCH CACHE =====
        const cacheKey = `${query}-${category}-${hasProductData}`;
        let results = state.searchCache.get(cacheKey);
        
        if (!results) {
            results = hasProductData ? Object.values(state.comparisonData) : state.vendorList;

            Logger.debug(`🔍 Starting search: "${query}", category: ${category}, hasProductData: ${hasProductData}, total items: ${results.length}`);

            if (query && query.length >= 1) {
                results = performSmartSearch(query, results, hasProductData);
            }

            results = applyCategoryFilters(results, category, hasProductData);
            results = applySorting(results, searchManager.currentSort, hasProductData);

            // ===== LIMIT RESULTS TO PREVENT UI LAG =====
            if (results.length > PERF_CONFIG.MAX_SEARCH_RESULTS) {
                Logger.performance(`⚠️ Limiting results from ${results.length} to ${PERF_CONFIG.MAX_SEARCH_RESULTS}`);
                results = results.slice(0, PERF_CONFIG.MAX_SEARCH_RESULTS);
            }
            
            // ===== CACHE THE RESULTS =====
            state.searchCache.set(cacheKey, results);
        } else {
            Logger.performance('🎯 Using cached search results');
        }

        searchManager.searchResults = results;
        searchManager.filteredResults = results;
        
        // ===== RESET VIRTUAL SCROLL =====
        searchManager.resetVirtualScroll();

        const searchTime = performance.now() - startTime;
        Logger.performance(`🔍 Search completed: ${results.length} results in ${searchTime.toFixed(2)}ms`);

        if (hasProductData) {
            renderEnhancedResults(results, list);
        } else {
            renderEnhancedVendorResults(results, list);
        }

        updateSearchStatus(`${formatNumber(results.length)} نتیجه در ${searchTime.toFixed(0)} میلی‌ثانیه`, false);

        if (query) {
            searchManager.addToHistory(query);
            trackSearchAnalytics(query, results.length, searchTime);
        }

        searchManager.isSearching = false;

    }, query ? 150 : 0);
}

function performSmartSearch(query, data, hasProductData) {
    const lowerQuery = query.toLowerCase().trim();
    const queryWords = lowerQuery.split(/\s+/).filter(word => word.length > 0);

    if (queryWords.length === 0) return data;

    Logger.debug(`🔍 Searching for: "${query}" in ${data.length} items (hasProductData: ${hasProductData})`);

    const results = data.map((item, index) => {
        let score = 0;
        let searchableText = '';

        if (hasProductData) {
            searchableText = `${item.baseProduct.name} ${item.counterpartProduct.name}`.toLowerCase();
        } else {
            const vendorMapping = getVendorMapping(item);
            if (vendorMapping) {
                searchableText = `${vendorMapping.sf_name || ''} ${vendorMapping.tf_name || ''}`.toLowerCase();
                searchableText += ` ${vendorMapping.sf_code || ''} ${vendorMapping.tf_code || ''}`.toLowerCase();
            }
        }

        if (index < 3) {
            Logger.debug(`🔍 Item ${index + 1}: "${searchableText}"`);
        }

        if (searchableText.includes(lowerQuery)) {
            score += 1000;
        }

        queryWords.forEach(word => {
            if (searchableText.includes(word)) {
                score += 100;

                if (searchableText.includes(' ' + word) || searchableText.startsWith(word)) {
                    score += 50;
                }
            } else {
                const similarity = calculateSimpleSimilarity(word, searchableText);
                score += similarity;
            }
        });

        if (searchableText.length < 50) {
            score += 10;
        }

        return { ...item,
            searchScore: score,
            searchableText
        };
    });

    const filteredResults = results
        .filter(item => item.searchScore > 5)
        .sort((a, b) => b.searchScore - a.searchScore);

    Logger.debug(`🔍 Search results: ${filteredResults.length} items found`);
    if (filteredResults.length > 0) {
        Logger.debug(`🔍 Top result: "${filteredResults[0].searchableText}" (score: ${filteredResults[0].searchScore})`);
    }

    return filteredResults;
}

function calculateSimpleSimilarity(query, text) {
    let score = 0;
    let queryIndex = 0;

    const normalizeText = (str) => {
        return str
            .replace(/[یي]/g, 'ی')
            .replace(/[کك]/g, 'ک')
            .replace(/[هة]/g, 'ه')
            .toLowerCase()
            .trim();
    };

    const normalizedQuery = normalizeText(query);
    const normalizedText = normalizeText(text);

    for (let i = 0; i < normalizedText.length && queryIndex < normalizedQuery.length; i++) {
        if (normalizedText[i] === normalizedQuery[queryIndex]) {
            score += 10;
            queryIndex++;
        }
    }

    if (queryIndex === normalizedQuery.length) {
        score += 30;
    }

    const queryWords = normalizedQuery.split(/\s+/);
    queryWords.forEach(word => {
        if (word.length > 1 && normalizedText.includes(word)) {
            score += 20;
        }
    });

    return score;
}

function applyCategoryFilters(results, category, hasProductData) {
    if (!hasProductData) return results;

    switch (category) {
        case 'tf-cheaper':
            return results.filter(r => r.priceDiff > 0);
        case 'sf-cheaper':
            return results.filter(r => r.priceDiff < 0);
        case 'same-price':
            return results.filter(r => r.priceDiff === 0);
        case 'high-savings':
            let filtered = results.filter(r => Math.abs(r.priceDiff) > 5000);
            if (searchManager.maxPrice) {
                filtered = filtered.filter(r => r.baseProduct.price <= searchManager.maxPrice);
            }
            return filtered;
        case 'favorites':
            return results.filter(r => searchManager.isFavorite(r.baseProduct.name));
        default:
            return results;
    }
}

function applySorting(results, sortType, hasProductData) {
    if (!hasProductData) {
        switch (sortType) {
            case 'name-asc':
                return results.sort((a, b) => {
                    const aMapping = getVendorMapping(a);
                    const bMapping = getVendorMapping(b);
                    return (aMapping.sf_name || '').localeCompare(bMapping.sf_name || '', 'fa');
                });
            case 'name-desc':
                return results.sort((a, b) => {
                    const aMapping = getVendorMapping(a);
                    const bMapping = getVendorMapping(b);
                    return (bMapping.sf_name || '').localeCompare(aMapping.sf_name || '', 'fa');
                });
            default:
                return results;
        }
    }

    switch (sortType) {
        case 'price-asc':
            return results.sort((a, b) => a.baseProduct.price - b.baseProduct.price);
        case 'price-desc':
            return results.sort((a, b) => b.baseProduct.price - a.baseProduct.price);
        case 'savings-desc':
            return results.sort((a, b) => Math.abs(b.priceDiff) - Math.abs(a.priceDiff));
        case 'percent-desc':
            return results.sort((a, b) => b.percentDiff - a.percentDiff);
        case 'name-asc':
            return results.sort((a, b) =>
                a.baseProduct.name.localeCompare(b.baseProduct.name, 'fa'));
        case 'name-desc':
            return results.sort((a, b) =>
                b.baseProduct.name.localeCompare(a.baseProduct.name, 'fa'));
        case 'relevance':
        default:
            return results;
    }
}

// ===== VIRTUAL SCROLLING RESULTS RENDERING =====
function renderEnhancedResults(results, list) {
    list.innerHTML = '';

    if (results.length === 0) {
        const noResults = document.createElement('li');
        noResults.className = 'no-results';
        noResults.innerHTML = `
            <div class="no-results-content">
                <span class="no-results-icon">🔍</span>
                <p>نتیجه‌ای یافت نشد</p>
                <small>کلمات کلیدی مختلفی امتحان کنید</small>
            </div>
        `;
        list.appendChild(noResults);
        return;
    }

    // ===== VIRTUAL SCROLLING: Only render visible results =====
    const visibleResults = searchManager.isVirtualScrollEnabled ? 
        results.slice(0, searchManager.visibleResults) : results;

    Logger.performance(`📊 Rendering ${visibleResults.length} of ${results.length} results`);

    visibleResults.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'result-item enhanced';

        const baseIsSf = state.currentPageType.startsWith('snappfood');
        const baseLabel = baseIsSf ? 'اسنپ‌فود' : 'تپسی‌فود';
        const counterLabel = baseIsSf ? 'تپسی‌فود' : 'اسنپ‌فود';
        const baseClass = baseIsSf ? 'sf' : 'tf';
        const counterClass = baseIsSf ? 'tf' : 'sf';

        const priceDiffText = item.priceDiff === 0 ? 'قیمت برابر' :
            item.priceDiff > 0 ? `${formatPrice(Math.abs(item.priceDiff))} تومان ارزان‌تر` :
            `${formatPrice(Math.abs(item.priceDiff))} تومان گران‌تر`;

        const percentageText = item.percentDiff > 0 ? ` (${formatPercentage(item.percentDiff)}%)` : '';

        const savingsClass = item.priceDiff > 0 ? 'savings' :
            item.priceDiff < 0 ? 'expensive' : 'equal';

        li.innerHTML = `
            <div class="result-header">
                <div class="result-title">
                    <h4>${item.baseProduct.name}</h4>
                    <div class="result-actions">
                        <span class="favorite-icon ${searchManager.isFavorite(item.baseProduct.name) ? 'active' : ''}" 
                              title="افزودن به علاقه‌مندی‌ها">
                            ${searchManager.isFavorite(item.baseProduct.name) ? '★' : '☆'}
                        </span>
                        <span class="result-index">#${index + 1}</span>
                    </div>
                </div>
                <div class="price-comparison ${savingsClass}">
                    <span class="comparison-badge">${priceDiffText}${percentageText}</span>
                </div>
            </div>
            <div class="result-body">
                <div class="price-row">
                    <span class="platform-label ${baseClass}">${baseLabel}</span>
                    <span class="price-value">${formatPrice(item.baseProduct.price)} تومان</span>
                </div>
                <div class="price-row">
                    <span class="platform-label ${counterClass}">${counterLabel}</span>
                    <span class="price-value">${formatPrice(item.counterpartProduct.price)} تومان</span>
                </div>
            </div>
        `;

        const favoriteIcon = li.querySelector('.favorite-icon');
        favoriteIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            searchManager.toggleFavorite(item.baseProduct.name);
            favoriteIcon.textContent = searchManager.isFavorite(item.baseProduct.name) ? '★' : '☆';
            favoriteIcon.classList.toggle('active');

            showToast(searchManager.isFavorite(item.baseProduct.name) ?
                'به علاقه‌مندی‌ها اضافه شد' : 'از علاقه‌مندی‌ها حذف شد');
        });

        li.addEventListener('click', (e) => {
            if (!e.target.closest('.favorite-icon')) {
                openCounterpartVendor();
                trackAction('result_click', {
                    product: item.baseProduct.name
                });
            }
        });

        // ===== OPTIMIZED ANIMATION DELAY CAPPING =====
        const animationDelay = Math.min(index * 50, PERF_CONFIG.MAX_ANIMATION_DELAY);
        li.style.animationDelay = `${animationDelay}ms`;

        list.appendChild(li);
    });

    // ===== ADD LOAD MORE BUTTON IF MORE RESULTS AVAILABLE =====
    if (searchManager.isVirtualScrollEnabled && visibleResults.length < results.length) {
        const loadMoreBtn = document.createElement('li');
        loadMoreBtn.className = 'load-more-btn';
        loadMoreBtn.innerHTML = `
            <button class="load-more-button">
                نمایش ${Math.min(25, results.length - visibleResults.length)} نتیجه بیشتر
                (${results.length - visibleResults.length} باقی‌مانده)
            </button>
        `;
        
        loadMoreBtn.querySelector('.load-more-button').addEventListener('click', () => {
            if (searchManager.loadMoreResults()) {
                renderEnhancedResults(results, list);
            }
        });
        
        list.appendChild(loadMoreBtn);
    }
}

function renderEnhancedVendorResults(results, list) {
    list.innerHTML = '';

    if (results.length === 0) {
        const noResults = document.createElement('li');
        noResults.className = 'no-results';
        noResults.innerHTML = `
            <div class="no-results-content">
                <span class="no-results-icon">🏪</span>
                <p>رستورانی یافت نشد</p>
                <small>نام رستوران را بررسی کنید</small>
            </div>
        `;
        list.appendChild(noResults);
        return;
    }

    // ===== VIRTUAL SCROLLING FOR VENDOR RESULTS =====
    const visibleResults = searchManager.isVirtualScrollEnabled ? 
        results.slice(0, searchManager.visibleResults) : results;

    Logger.performance(`📊 Rendering ${visibleResults.length} of ${results.length} vendor results`);

    visibleResults.forEach((vendor, index) => {
        const li = document.createElement('li');
        li.className = 'result-item vendor-item enhanced';

        const vendorMapping = getVendorMapping(vendor);

        if (!vendorMapping) {
            Logger.warn('Invalid vendor mapping:', vendor);
            return;
        }

        const sfCode = vendorMapping.sf_code || '';
        const tfCode = vendorMapping.tf_code || '';
        const sfName = vendorMapping.sf_name || 'نامشخص';
        const tfName = vendorMapping.tf_name || 'نامشخص';

        li.innerHTML = `
            <div class="vendor-header">
                <div class="vendor-info">
                    <h4>${sfName}</h4>
                    <div class="vendor-stats">
                        <span class="vendor-codes">SF: ${sfCode} | TF: ${tfCode}</span>
                        <span class="vendor-index">#${index + 1}</span>
                    </div>
                </div>
            </div>
            <div class="vendor-platforms">
                <a class="platform-link sf" href="https://snappfood.ir/restaurant/menu/${sfCode}" target="_blank">
                    <span class="platform-name">اسنپ‌فود</span>
                    <span class="vendor-name">${sfName}</span>
                </a>
                <a class="platform-link tf" href="https://tapsi.food/vendor/${tfCode}" target="_blank">
                    <span class="platform-name">تپسی‌فود</span>
                    <span class="vendor-name">${tfName}</span>
                </a>
            </div>
        `;

        // ===== OPTIMIZED ANIMATION DELAY CAPPING =====
        const animationDelay = Math.min(index * 50, PERF_CONFIG.MAX_ANIMATION_DELAY);
        li.style.animationDelay = `${animationDelay}ms`;

        list.appendChild(li);
    });

    // ===== ADD LOAD MORE BUTTON FOR VENDORS =====
    if (searchManager.isVirtualScrollEnabled && visibleResults.length < results.length) {
        const loadMoreBtn = document.createElement('li');
        loadMoreBtn.className = 'load-more-btn';
        loadMoreBtn.innerHTML = `
            <button class="load-more-button">
                نمایش ${Math.min(25, results.length - visibleResults.length)} رستوران بیشتر
                (${results.length - visibleResults.length} باقی‌مانده)
            </button>
        `;
        
        loadMoreBtn.querySelector('.load-more-button').addEventListener('click', () => {
            if (searchManager.loadMoreResults()) {
                renderEnhancedVendorResults(results, list);
            }
        });
        
        list.appendChild(loadMoreBtn);
    }
}

function updateSearchStatus(message, isLoading = false) {
    const statusElement = document.querySelector('.search-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `search-status ${isLoading ? 'loading' : ''}`;
    }
}

function showToast(message, duration = 2000) {
    const existingToast = document.querySelector('.search-toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'search-toast';
    toast.textContent = message;

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function debugSearch(testQuery = 'برگر') {
    console.group('🔍 Search Debug');
    console.log('Test Query:', testQuery);
    console.log('Vendor List Length:', state.vendorList.length);
    console.log('Comparison Data Length:', Object.keys(state.comparisonData).length);

    const sampleVendors = state.vendorList.slice(0, 5);
    console.log('Sample Vendors:', sampleVendors.map(v => {
        const mapping = getVendorMapping(v);
        return {
            sf_name: mapping?.sf_name,
            tf_name: mapping?.tf_name,
            sf_code: mapping?.sf_code,
            tf_code: mapping?.tf_code
        };
    }));

    const results = performSmartSearch(testQuery, state.vendorList, false);
    console.log('Search Results:', results.length);
    console.log('Top 3 Results:', results.slice(0, 3).map(r => ({
        sf_name: getVendorMapping(r)?.sf_name,
        tf_name: getVendorMapping(r)?.tf_name,
        score: r.searchScore,
        searchableText: r.searchableText
    })));

    console.log('Performance Report:', state.getPerformanceReport());
    console.groupEnd();
    return results;
}

window.debugFoodSearch = debugSearch;

function trackAction(action, data = {}) {
    const actionData = {
        action,
        timestamp: Date.now(),
        pageType: state.currentPageType,
        ...data
    };

    Logger.debug('📊 Action tracked:', actionData);
}

function toggleWidget() {
    const container = document.getElementById('sp-vs-tp-widget-container');
    if (container) {
        const isVisible = container.classList.contains('show');
        container.classList.toggle('show');

        trackAction(isVisible ? 'widget_close' : 'widget_open');

        if (!isVisible) {
            setTimeout(() => {
                const searchInput = container.querySelector('#sp-vs-tp-search-input');
                if (searchInput) {
                    searchInput.focus();
                }
            }, 100);
        }
    }
}

function createSearchWidget() {
    if (document.getElementById('sp-vs-tp-widget-icon')) return;

    if (!document.getElementById('vendor-codes-style')) {
        const style = document.createElement('style');
        style.id = 'vendor-codes-style';
        style.textContent = `
            .vendor-codes {
                font-size: 9px;
                color: #6c757d;
                background: rgba(108, 117, 125, 0.1);
                padding: 2px 6px;
                border-radius: 4px;
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                letter-spacing: 0.5px;
                direction: ltr;
                text-align: left;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 150px;
            }
            .load-more-btn {
                text-align: center;
                padding: 16px;
                margin: 12px 0;
            }
            .load-more-button {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
                font-family: 'IRANSansMobile', 'Vazirmatn', sans-serif !important;
                direction: rtl;
            }
            .load-more-button:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
            }
        `;
        document.head.appendChild(style);
    }

    const icon = document.createElement('div');
    icon.id = 'sp-vs-tp-widget-icon';
    icon.innerHTML = `
        <div class="widget-icon-content">
            <span class="widget-icon-symbol">🔍</span>
            <div class="widget-icon-badge" id="widget-result-count" style="display: none;">0</div>
        </div>
    `;
    icon.addEventListener('click', toggleWidget);
    document.body.appendChild(icon);

    const container = document.createElement('div');
    container.id = 'sp-vs-tp-widget-container';
    container.innerHTML = `
        <div id="sp-vs-tp-widget-header">
            <div class="header-content">
                <span class="header-title">جستجوی هوشمند محصولات</span>
                <div class="header-actions">
                    <button class="header-action" id="widget-minimize" title="کوچک کردن">−</button>
                    <button class="header-action" id="widget-close" title="بستن">×</button>
                </div>
            </div>
            <div class="search-status">آماده جستجو</div>
        </div>
        <div id="sp-vs-tp-widget-body">
            <div class="search-controls">
                <div class="search-input-container">
                    <input id="sp-vs-tp-search-input" placeholder="نام محصول یا رستوران را وارد کنید..." />
                    <button class="search-clear" id="search-clear-btn" title="پاک کردن">×</button>
                </div>
                <div class="search-filters">
                    <div id="sp-vs-tp-category-buttons">
                        <button class="sp-vs-tp-category-btn active" data-category="all">همه</button>
                        <button class="sp-vs-tp-category-btn" data-category="tf-cheaper">ارزان‌تر در تپسی‌فود</button>
                        <button class="sp-vs-tp-category-btn" data-category="sf-cheaper">ارزان‌تر در اسنپ‌فود</button>
                        <button class="sp-vs-tp-category-btn" data-category="same-price">قیمت برابر</button>
                        <button class="sp-vs-tp-category-btn" data-category="high-savings" id="high-savings-btn">صرفه‌جویی بالا</button>
                        <button class="sp-vs-tp-category-btn" data-category="favorites">علاقه‌مندی‌ها</button>
                    </div>
                    <div class="price-filter" id="price-filter" style="display: none;">
                        <label for="max-price">حداکثر قیمت (تومان):</label>
                        <input type="number" id="max-price" placeholder="مثال: 50000" />
                    </div>
                    <div class="sort-controls">
                        <label for="sort-select">مرتب‌سازی:</label>
                        <select id="sort-select">
                            <option value="relevance">مرتبط‌ترین</option>
                            <option value="savings-desc">بیشترین صرفه‌جویی</option>
                            <option value="percent-desc">بیشترین درصد تخفیف</option>
                            <option value="price-asc">ارزان‌ترین</option>
                            <option value="price-desc">گران‌ترین</option>
                            <option value="name-asc">الفبایی (الف-ی)</option>
                            <option value="name-desc">الفبایی (ی-الف)</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="results-container">
                <ul id="sp-vs-tp-search-results"></ul>
            </div>
            <div class="widget-footer">
                <div class="search-stats" id="search-stats">
                    <span class="stats-item">کل جستجوها: ${formatNumber(searchManager.searchStats.totalSearches)}</span>
                    <span class="stats-separator">•</span>
                    <span class="stats-item">علاقه‌مندی‌ها: ${formatNumber(searchManager.favorites.length)}</span>
                </div>
                <div class="quick-actions">
                    <button class="quick-action" id="widget-settings" title="تنظیمات">⚙️</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(container);

    setupWidgetInteractions(container);
}

function setupWidgetInteractions(container) {
    const input = container.querySelector('#sp-vs-tp-search-input');
    const list = container.querySelector('#sp-vs-tp-search-results');
    const buttons = container.querySelectorAll('.sp-vs-tp-category-btn');
    const sortSelect = container.querySelector('#sort-select');
    const clearBtn = container.querySelector('#search-clear-btn');
    const closeBtn = container.querySelector('#widget-close');
    const minimizeBtn = container.querySelector('#widget-minimize');
    const settingsBtn = container.querySelector('#widget-settings');
    const priceFilter = container.querySelector('#price-filter');
    const maxPriceInput = container.querySelector('#max-price');

    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearBtn.style.display = query ? 'block' : 'none';
        updateResultCountBadge(0);
        performAdvancedSearch(query, list, input);
    });

    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        updateResultCountBadge(0);
        performAdvancedSearch('', list, input);
        input.focus();
    });

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            searchManager.currentCategory = btn.dataset.category;

            if (btn.dataset.category === 'high-savings') {
                priceFilter.style.display = 'block';
            } else {
                priceFilter.style.display = 'none';
                searchManager.maxPrice = null;
                maxPriceInput.value = '';
            }

            trackAction('category_change', {
                category: searchManager.currentCategory
            });
            performAdvancedSearch(input.value.trim(), list, input);
        });
    });

    maxPriceInput.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        searchManager.maxPrice = isNaN(value) ? null : value;
        if (searchManager.currentCategory === 'high-savings') {
            performAdvancedSearch(input.value.trim(), list, input);
        }
    });

    sortSelect.addEventListener('change', (e) => {
        searchManager.currentSort = e.target.value;
        trackAction('sort_change', {
            sort: searchManager.currentSort
        });
        performAdvancedSearch(input.value.trim(), list, input);
    });

    closeBtn.addEventListener('click', () => {
        container.classList.remove('show');
        trackAction('widget_close');
    });

    minimizeBtn.addEventListener('click', () => {
        container.classList.toggle('minimized');
        minimizeBtn.textContent = container.classList.contains('minimized') ? '+' : '−';
        trackAction('widget_minimize');
    });

    settingsBtn.addEventListener('click', () => {
        showSettingsModal();
        trackAction('settings_open');
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const firstResult = list.querySelector('.result-item');
            if (firstResult && !firstResult.classList.contains('load-more-btn')) {
                firstResult.click();
            }
        } else if (e.key === 'Escape') {
            container.classList.remove('show');
        }
    });

    performAdvancedSearch('', list, input);
}

function updateResultCountBadge(count) {
    const badge = document.getElementById('widget-result-count');
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
}

function showSettingsModal() {
    const existingModal = document.querySelector('.settings-modal');
    if (existingModal) {
        existingModal.remove();
    }

    const perfReport = state.getPerformanceReport();

    const modal = document.createElement('div');
    modal.className = 'settings-modal';
    modal.innerHTML = `
        <div class="settings-content">
            <div class="settings-header">
                <h3>تنظیمات جستجو</h3>
                <button class="settings-close">×</button>
            </div>
            <div class="settings-body">
                <div class="setting-group">
                    <h4>آمار جستجو</h4>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-label">کل جستجوها</span>
                            <span class="stat-value">${formatNumber(searchManager.searchStats.totalSearches)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">علاقه‌مندی‌ها</span>
                            <span class="stat-value">${formatNumber(searchManager.favorites.length)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">تاریخچه</span>
                            <span class="stat-value">${formatNumber(searchManager.history.length)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">متوسط نتایج</span>
                            <span class="stat-value">${Math.round(searchManager.searchStats.averageResultCount || 0)}</span>
                        </div>
                    </div>
                </div>
                <div class="setting-group">
                    <h4>عملکرد سیستم</h4>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-label">کش امتیازات</span>
                            <span class="stat-value">${perfReport.ratingCacheStats.hitRate}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">کش جستجو</span>
                            <span class="stat-value">${perfReport.searchCacheStats.hitRate}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">امتیازات استخراج شده</span>
                            <span class="stat-value">${formatNumber(perfReport.ratingsExtracted)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">تماس‌های API</span>
                            <span class="stat-value">${formatNumber(perfReport.apiCalls)}</span>
                        </div>
                    </div>
                </div>
                <div class="setting-group">
                    <h4>عملیات</h4>
                    <div class="settings-actions">
                        <button class="setting-btn danger" id="clear-favorites">پاک کردن علاقه‌مندی‌ها</button>
                        <button class="setting-btn danger" id="clear-history">پاک کردن تاریخچه</button>
                        <button class="setting-btn danger" id="reset-stats">بازنشانی آمار</button>
                        <button class="setting-btn" id="clear-cache">پاک کردن کش</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.settings-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    modal.querySelector('#clear-favorites').addEventListener('click', () => {
        if (confirm('آیا مطمئن هستید که می‌خواهید تمام علاقه‌مندی‌ها را پاک کنید؟')) {
            searchManager.favorites = [];
            searchManager.saveToStorage('spVsTpFavorites', searchManager.favorites);
            searchManager.updateStatsDisplay();
            showToast('علاقه‌مندی‌ها پاک شدند');
            modal.remove();
        }
    });

    modal.querySelector('#clear-history').addEventListener('click', () => {
        if (confirm('آیا مطمئن هستید که می‌خواهید تمام تاریخچه را پاک کنید؟')) {
            searchManager.clearHistory();
            showToast('تاریخچه پاک شد');
            modal.remove();
        }
    });

    modal.querySelector('#reset-stats').addEventListener('click', () => {
        if (confirm('آیا مطمئن هستید که می‌خواهید آمار را بازنشانی کنید؟')) {
            searchManager.resetStats();
            showToast('آمار بازنشانی شد');
            modal.remove();
        }
    });

    modal.querySelector('#clear-cache').addEventListener('click', () => {
        state.ratingCache.clear();
        state.searchCache.clear();
        showToast('کش سیستم پاک شد');
        modal.remove();
    });

    requestAnimationFrame(() => {
        modal.classList.add('show');
    });
}

const processedProducts = new WeakMap();

function injectSnappFoodComparisons() {
    const productCards = state.domCache.get('section.ProductCard__Box-sc-1wfx2e0-0');
    Logger.debug(`🔄 Processing ${productCards.length} SnappFood products`);

    function processChunk(startIndex) {
        const endIndex = Math.min(startIndex + 10, productCards.length);

        for (let i = startIndex; i < endIndex; i++) {
            const productCard = productCards[i];
            if (!processedProducts.has(productCard)) {
                injectSnappFoodComparison(productCard);
                processedProducts.set(productCard, true);
            }
        }

        if (endIndex < productCards.length) {
            requestIdleCallback(() => processChunk(endIndex));
        }
    }

    requestIdleCallback(() => processChunk(0));
}

function injectSnappFoodComparison(productCard) {
    const titleElement = productCard.querySelector('h2.sc-hKgILt.esHHju');
    if (!titleElement) return;

    const cardTitle = titleElement.textContent.trim();

    const matchedProduct = Object.values(state.comparisonData)
        .find(p => p.baseProduct.name.trim() === cardTitle);

    if (!matchedProduct) {
        productCard.classList.add('sp-vs-tp-unpaired');
        return;
    }

    if (productCard.querySelector('.sp-vs-tp-comparison-text')) return;

    const priceElement = productCard.querySelector('span.sc-hKgILt.hxREoh');
    if (!priceElement) return;

    const {
        text,
        className
    } = getComparisonText(matchedProduct);

    const comparisonDiv = document.createElement('div');
    comparisonDiv.className = `sp-vs-tp-comparison-text ${className}`;
    comparisonDiv.textContent = text;
    comparisonDiv.style.fontFamily = "'IRANSansMobile', 'Vazirmatn', sans-serif";

    comparisonDiv.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state.vendorInfo.tf_code) {
            window.open(`https://tapsi.food/vendor/${state.vendorInfo.tf_code}`, '_blank');
        }
    }, {
        passive: false
    });

    productCard.classList.add(className);
    priceElement.parentElement.insertBefore(comparisonDiv, priceElement);
}

function getComparisonText(data) {
    const absDiff = new Intl.NumberFormat('fa-IR').format(Math.abs(data.priceDiff));

    if (data.priceDiff === 0) {
        return {
            text: 'سفارش از تپسی‌فود (پیک رایگان)',
            className: 'sp-vs-tp-same-price'
        };
    } else if (data.priceDiff > 0) {
        return {
            text: `${data.percentDiff}% ارزان‌تر در تپسی‌فود (${absDiff} تومان کمتر)`,
            className: 'sp-vs-tp-cheaper'
        };
    } else {
        return {
            text: `${data.percentDiff}% گران‌تر در تپسی‌فود (${absDiff} تومان بیشتر)`,
            className: 'sp-vs-tp-expensive'
        };
    }
}

// ===== OPTIMIZED VENDOR PROCESSING WITH CHUNKING =====
function processVendorElements() {
    const startTime = performance.now();
    Logger.debug('🔄 Enhanced vendor processing starting...');
    
    const restaurantLinks = document.querySelectorAll('a[href*="/restaurant/menu/"]');
    Logger.debug(`📍 Found ${restaurantLinks.length} restaurant menu links`);
    
    if (restaurantLinks.length === 0) {
        Logger.debug('❌ No restaurant links found - page might not be loaded yet');
        return;
    }
    
    Logger.debug(`📊 Processing with ${state.pairedVendors.size} paired vendors in database`);
    
    let totalHighlighted = 0;
    let totalWithRatings = 0;
    let totalHighRated = 0;
    let totalPremium = 0; // New category for paired + high rating
    const processedCodes = new Set();
    
    // ===== CHUNKED PROCESSING FOR PERFORMANCE =====
    const processChunk = (links, startIndex, chunkSize = PERF_CONFIG.VENDOR_CHUNK_SIZE) => {
        const endIndex = Math.min(startIndex + chunkSize, links.length);
        
        Logger.debug(`🔄 Processing chunk ${startIndex}-${endIndex} of ${links.length} vendors`);
        
        for (let i = startIndex; i < endIndex; i++) {
            const link = links[i];
            const vendorCode = extractVendorCodeFromUrl(link.href, 'snappfood');
            
            if (vendorCode && !processedCodes.has(vendorCode)) {
                processedCodes.add(vendorCode);
                
                const container = findBestContainer(link);
                if (container && !state.processedElements.has(container)) {
                    state.processedElements.add(container);
                    
                    // ===== SKIP RATING EXTRACTION FOR PERFORMANCE IN LARGE LISTS =====
                    const rating = processedCodes.size <= 100 ? 
                        extractRatingFromElement(container, 'restaurant') : null;
                    
                    if (rating !== null) {
                        totalWithRatings++;
                        if (rating >= PERF_CONFIG.RATING_THRESHOLD) {
                            totalHighRated++;
                        }
                    }
                    
                    const isPaired = state.pairedVendors.has(vendorCode);
                    const isHighRated = rating && rating >= PERF_CONFIG.RATING_THRESHOLD;
                    
                    if (isPaired || isHighRated) {
                        highlightVendor(container, vendorCode, rating, isPaired, isHighRated);
                        totalHighlighted++;
                        
                        if (isPaired && isHighRated) {
                            totalPremium++;
                        }
                    }
                    
                    state.performanceMetrics.vendorsProcessed++;
                }
            }
        }
        
        // ===== CONTINUE PROCESSING WITH BREAK FOR UI RESPONSIVENESS =====
        if (endIndex < links.length) {
            requestIdleCallback(() => processChunk(links, endIndex, chunkSize));
        } else {
            const processTime = performance.now() - startTime;
            Logger.performance(`✅ Enhanced processing complete:`, {
                totalProcessed: processedCodes.size,
                totalHighlighted,
                totalWithRatings,
                totalHighRated,
                totalPremium,
                pairedVendorsInDB: state.pairedVendors.size,
                processTime: `${processTime.toFixed(2)}ms`
            });
        }
    };
    
    // Start processing
    requestIdleCallback(() => processChunk(Array.from(restaurantLinks), 0));
}

const containerCache = new WeakMap();

function findBestContainer(link) {
    if (containerCache.has(link)) {
        return containerCache.get(link);
    }

    const candidates = [
        link.closest('[class*="card"], [class*="Card"]'),
        link.closest('article'),
        link.closest('li'),
        link.closest('[class*="vendor"], [class*="restaurant"]'),
        link.parentElement
    ];

    const container = candidates.find(candidate =>
        candidate && candidate !== document.body && candidate !== document.documentElement
    ) || link.parentElement;

    containerCache.set(link, container);
    return container;
}

// ===== UPDATED VENDOR HIGHLIGHTING WITH NEW COLOR SCHEME =====
function highlightVendor(vendorElement, vendorCode, rating, isPaired, isHighRated) {
    const uniqueId = `${vendorCode}-${rating || 'no-rating'}-${isPaired}-${isHighRated}`;
    
    // Prevent duplicate processing
    if (!vendorElement || state.processedVendors.has(uniqueId)) {
        return;
    }
    
    Logger.debug(`🔍 Processing vendor ${vendorCode}:`, {
        isPaired,
        rating,
        isHighRated,
        ratingThreshold: PERF_CONFIG.RATING_THRESHOLD
    });
    
    // Find the actual card box for border highlighting
    const cardBox = vendorElement.querySelector('.VendorCard__VendorBox-sc-6qaz7-0');
    
    // ===== NEW COLOR SCHEME IMPLEMENTATION =====
    
    // 1. Premium (Paired + High Rating) = Purple border + Crown badge
    if (isPaired && isHighRated) {
        Logger.debug(`👑 Applying premium styling for vendor ${vendorCode} (rating: ${rating})`);
        
        if (vendorElement.style.position !== 'relative' && vendorElement.style.position !== 'absolute') {
            vendorElement.style.position = 'relative';
        }
        
        // Apply purple border to the card box
        if (cardBox) {
            cardBox.classList.add('sp-vs-tp-vendor-premium');
            Logger.debug(`🟣 Added purple border class to vendor ${vendorCode}`);
        }
        
        // Add premium crown badge
        const premiumBadge = createPremiumBadge();
        vendorElement.appendChild(premiumBadge);
        Logger.debug(`👑 Added premium crown badge for vendor ${vendorCode} (${rating})`);
        
        // Also add the paired badge
        addPairedBadge(vendorElement, vendorCode);
    }
    // 2. Just High Rating (>4.2) = Yellow border + Star badge
    else if (isHighRated && !isPaired) {
        Logger.debug(`⭐ Applying high rating styling for vendor ${vendorCode} (rating: ${rating})`);
        
        if (vendorElement.style.position !== 'relative' && vendorElement.style.position !== 'absolute') {
            vendorElement.style.position = 'relative';
        }
        
        // Apply yellow border to the card box
        if (cardBox) {
            cardBox.classList.add('sp-vs-tp-vendor-high-rating');
            Logger.debug(`🟡 Added yellow border class to vendor ${vendorCode}`);
        }
        
        // Add star badge
        const starBadge = createStarBadge();
        vendorElement.appendChild(starBadge);
        Logger.debug(`⭐ Added star badge for high-rated vendor ${vendorCode} (${rating})`);
    }
    // 3. Just Paired (no high rating) = Green border + Green badge
    else if (isPaired && !isHighRated) {
        Logger.debug(`🔗 Applying paired vendor styling for vendor ${vendorCode} (rating: ${rating || 'N/A'})`);
        
        // Apply green border to the card box
        if (cardBox) {
            cardBox.classList.add('sp-vs-tp-vendor-paired');
            Logger.debug(`🟢 Added green border class to vendor ${vendorCode}`);
        }
        
        addPairedBadge(vendorElement, vendorCode);
    }
    else {
        Logger.debug(`⚪ No highlighting for vendor ${vendorCode} - rating: ${rating || 'N/A'}, paired: ${isPaired}`);
    }
    
    state.processedVendors.add(uniqueId);
}

function addPairedBadge(vendorElement, vendorCode) {
    const imageWrapper = vendorElement.querySelector('.VendorCard__ImgWrapper-sc-6qaz7-2');
    if (imageWrapper) {
        const pairedBadge = createProfessionalBadge('paired');
        imageWrapper.style.position = 'relative';
        imageWrapper.appendChild(pairedBadge);
        Logger.debug(`🔗 Added professional paired badge for vendor ${vendorCode}`);
    } else {
        Logger.warn(`❌ No image wrapper found for paired vendor ${vendorCode}`);
    }
}

const debouncedProcessVendors = debounce(processVendorElements, 500);
const debouncedProcessProducts = debounce(injectSnappFoodComparisons, 300);

function setupOptimizedObserver(targetFunction, targetElements) {
    const observer = new MutationObserver((mutations) => {
        const hasRelevantChanges = mutations.some(mutation => {
            return mutation.type === 'childList' &&
                mutation.addedNodes.length > 0 &&
                Array.from(mutation.addedNodes).some(node =>
                    node.nodeType === Node.ELEMENT_NODE &&
                    targetElements.some(selector => node.matches?.(selector) || node.querySelector?.(selector))
                );
        });

        if (hasRelevantChanges) {
            state.domCache.clear();
            targetFunction();
        }
    });

    const targetNode = document.getElementById('__next') || document.body;
    observer.observe(targetNode, {
        childList: true,
        subtree: true,
        attributeFilter: []
    });

    state.activeObservers.push(observer);
    return observer;
}

function initSnappFoodMenu() {
    Logger.info('🍕 Optimized SnappFood Menu initialization');
    const startTime = performance.now();

    const isSnappFood = window.location.href.includes('snappfood.ir');
    const vendorCode = extractVendorCodeFromUrl(
        window.location.href,
        isSnappFood ? 'snappfood' : 'tapsifood'
    );
    if (!vendorCode) return;

    state.performanceMetrics.apiCalls++;
    const msg = {
        action: "fetchPrices",
        sourcePlatform: isSnappFood ? "snappfood" : "tapsifood"
    };
    if (isSnappFood) msg.sfVendorCode = vendorCode;
    else msg.tfVendorCode = vendorCode;

    chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError || !response?.success) return;

        state.comparisonData = response.data;
        state.vendorInfo = response.vendorInfo || {};

        createSearchWidget();

        injectSnappFoodComparisons();
        setupOptimizedObserver(debouncedProcessProducts, ['section[class*="ProductCard"]']);

        const initTime = performance.now() - startTime;
        state.performanceMetrics.initTime = initTime;
        Logger.performance(`✅ SnappFood initialization completed in ${initTime.toFixed(2)}ms`);
    });
}

function initVendorHighlighting() {
    Logger.info('🏠 Optimized vendor highlighting initialization');
    const startTime = performance.now();

    state.performanceMetrics.apiCalls++;
    chrome.runtime.sendMessage({
        action: "getVendorList"
    }, (response) => {
        if (chrome.runtime.lastError || !response?.success) return;

        if (response.vendors?.length) {
            state.vendorList = response.vendors;
            response.vendors.forEach(vendor => {
                const vendorMapping = getVendorMapping(vendor);
                if (vendorMapping && vendorMapping.sf_code) {
                    state.pairedVendors.add(vendorMapping.sf_code);
                }
            });
        }

        Logger.performance(`✅ Loaded ${state.pairedVendors.size} paired vendors`);

        processVendorElements();
        setupOptimizedObserver(debouncedProcessVendors, ['a[href*="/restaurant/menu/"]', '[class*="vendor"]']);

        createSearchWidget();

        const initTime = performance.now() - startTime;
        Logger.performance(`✅ Vendor highlighting completed in ${initTime.toFixed(2)}ms`);
    });
}

const throttledNavigationCheck = throttle(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== state.lastUrl) {
        state.urlChangeCount++;
        Logger.debug(`🔄 URL changed (#${state.urlChangeCount}): ${state.lastUrl} → ${currentUrl}`);
        state.lastUrl = currentUrl;

        clearTimeout(window.universalReinitTimer);
        window.universalReinitTimer = setTimeout(reinitialize, 800);
    }
}, 1000);

function startNavigationMonitoring() {
    Logger.debug('🔍 Starting optimized navigation monitoring');
    state.navigationInterval = setInterval(throttledNavigationCheck, 1000);
}

function reinitialize() {
    const newPageType = detectPageType();
    Logger.debug(`🔄 Optimized reinitializing - Page Type: ${newPageType}`);

    cleanupAll();

    const initFunctions = {
        'snappfood-menu': () => setTimeout(initSnappFoodMenu, 300),
        'tapsifood-menu': () => setTimeout(initSnappFoodMenu, 300),
        'snappfood-homepage': () => setTimeout(initVendorHighlighting, 500),
        'snappfood-service': () => setTimeout(initVendorHighlighting, 500)
    };

    const initFunction = initFunctions[newPageType];
    if (initFunction) {
        initFunction();
    } else {
        Logger.debug('🤷 Unknown page type, skipping initialization');
    }

    state.currentPageType = newPageType;
}

function initialize() {
    if (state.isInitialized) return;

    console.log('🚀 Enhanced Universal Content Script v3.3 - Performance Optimized');
    console.log('📍 URL:', window.location.href);
    console.log('📄 Page Type:', detectPageType());
    console.log('⚙️ Performance Config:', PERF_CONFIG);

    startNavigationMonitoring();
    reinitialize();

    state.isInitialized = true;

    if (window.performance && window.performance.mark) {
        window.performance.mark('extension-initialized');
    }

    // ===== PERFORMANCE REPORT AFTER INITIALIZATION =====
    setTimeout(() => {
        Logger.performance('📊 Performance Report after 5 seconds:', state.getPerformanceReport());
    }, 5000);
}

window.addEventListener('beforeunload', () => {
    state.cleanup();
});

// ===== EXPOSE PERFORMANCE DEBUGGING TOOLS =====
window.getPerformanceReport = () => state.getPerformanceReport();
window.toggleDebugLogging = () => {
    PERF_CONFIG.DEBUG_LOGGING = !PERF_CONFIG.DEBUG_LOGGING;
    console.log('Debug logging:', PERF_CONFIG.DEBUG_LOGGING ? 'ENABLED' : 'DISABLED');
};

requestIdleCallback ? requestIdleCallback(initialize) : setTimeout(initialize, 0);