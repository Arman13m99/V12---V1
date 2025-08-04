// background.js
// API-based Price Comparator Background Script - Performance Optimized v3.3
console.log("Background: Starting Food Price Comparator extension - Performance Optimized");

// ===== PERFORMANCE CONFIGURATION =====
const PERF_CONFIG = {
    DEBUG_LOGGING: false,           // Reduces console spam
    CACHE_DURATION: 5 * 60 * 1000,  // 5 minutes cache
    VENDOR_LIST_CACHE_DURATION: 10 * 60 * 1000, // 10 minutes cache for vendor list
    MAX_CONCURRENT_REQUESTS: 3,     // Limit concurrent API requests
    REQUEST_TIMEOUT: 10000,         // 10 second timeout
    RETRY_ATTEMPTS: 2               // Retry failed requests
};

// ===== OPTIMIZED LOGGING SYSTEM =====
const Logger = {
    debug: PERF_CONFIG.DEBUG_LOGGING ? console.log : () => {},
    info: PERF_CONFIG.DEBUG_LOGGING ? console.info : () => {},
    warn: console.warn, // Always show warnings
    error: console.error, // Always show errors
    performance: PERF_CONFIG.DEBUG_LOGGING ? console.log : () => {}
};

// Configuration
const API_BASE_URL = 'http://127.0.0.1:8000';  // Local FastAPI server

// ===== ENHANCED CACHE SYSTEM =====
class PerformanceCache {
    constructor(maxSize = 100, ttlMs = PERF_CONFIG.CACHE_DURATION) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttl = ttlMs;
        this.hitCount = 0;
        this.missCount = 0;
        this.requestCount = 0;
    }

    get(key) {
        const item = this.cache.get(key);
        if (item && Date.now() < item.expiry) {
            this.hitCount++;
            // Move to end (LRU)
            this.cache.delete(key);
            this.cache.set(key, item);
            Logger.debug(`Cache HIT for ${key}`);
            return item.data;
        }
        
        if (item) {
            this.cache.delete(key); // Remove expired item
            Logger.debug(`Cache EXPIRED for ${key}`);
        }
        
        this.missCount++;
        Logger.debug(`Cache MISS for ${key}`);
        return null;
    }

    set(key, data) {
        // Remove oldest entries if at capacity
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            Logger.debug(`Cache EVICTED ${firstKey}`);
        }

        const item = {
            data: data,
            expiry: Date.now() + this.ttl,
            created: Date.now()
        };

        this.cache.set(key, item);
        Logger.debug(`Cache SET for ${key} (TTL: ${this.ttl}ms)`);
    }

    clear() {
        const size = this.cache.size;
        this.cache.clear();
        this.hitCount = 0;
        this.missCount = 0;
        Logger.performance(`Cache CLEARED (was ${size} items)`);
    }

    getStats() {
        const total = this.hitCount + this.missCount;
        const hitRate = total > 0 ? (this.hitCount / total * 100).toFixed(1) : 0;
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hitRate: `${hitRate}%`,
            hits: this.hitCount,
            misses: this.missCount,
            requests: this.requestCount
        };
    }

    cleanup() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [key, item] of this.cache.entries()) {
            if (now >= item.expiry) {
                this.cache.delete(key);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            Logger.performance(`Cache CLEANUP: removed ${cleanedCount} expired items`);
        }
        
        return cleanedCount;
    }
}

// Global performance caches
const vendorDataCache = new PerformanceCache(200, PERF_CONFIG.CACHE_DURATION);
const vendorListCache = new PerformanceCache(1, PERF_CONFIG.VENDOR_LIST_CACHE_DURATION);
const apiStatsCache = new PerformanceCache(1, 30000); // 30 second cache for stats

// ===== PERFORMANCE METRICS =====
const performanceMetrics = {
    apiCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
    errors: 0,
    averageResponseTime: 0,
    responseTimes: [],
    startTime: Date.now()
};

// ===== OPTIMIZED API HELPER FUNCTIONS =====
async function fetchFromAPI(endpoint, options = {}) {
    const startTime = performance.now();
    const url = `${API_BASE_URL}${endpoint}`;
    
    performanceMetrics.apiCalls++;
    Logger.debug(`API: Fetching from ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PERF_CONFIG.REQUEST_TIMEOUT);
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            signal: controller.signal,
            ...options
        });
        
        clearTimeout(timeoutId);
        
        const responseTime = performance.now() - startTime;
        performanceMetrics.responseTimes.push(responseTime);
        
        // Calculate rolling average
        if (performanceMetrics.responseTimes.length > 10) {
            performanceMetrics.responseTimes.shift();
        }
        
        performanceMetrics.averageResponseTime = 
            performanceMetrics.responseTimes.reduce((a, b) => a + b, 0) / 
            performanceMetrics.responseTimes.length;
        
        Logger.performance(`API: ${endpoint} completed in ${responseTime.toFixed(2)}ms`);
        
        if (!response.ok) {
            if (response.status === 404) {
                return { success: false, error: "Endpoint not found", status: 404 };
            }
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return { success: true, data, responseTime };
        
    } catch (error) {
        clearTimeout(timeoutId);
        performanceMetrics.errors++;
        
        Logger.error(`API: Call failed for ${endpoint}:`, error);
        
        if (error.name === 'AbortError') {
            return { 
                success: false, 
                error: `Request timeout after ${PERF_CONFIG.REQUEST_TIMEOUT}ms`,
                isTimeout: true
            };
        }
        
        if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
            return { 
                success: false, 
                error: "API server not available. Please ensure the FastAPI server is running on port 8000.",
                isConnectionError: true
            };
        }
        
        return { success: false, error: error.message };
    }
}

// ===== OPTIMIZED VENDOR DATA FETCHING =====
async function getVendorData(platform, vendorCode) {
    const cacheKey = `${platform}-${vendorCode}`;
    
    // Check cache first
    const cached = vendorDataCache.get(cacheKey);
    if (cached) {
        performanceMetrics.cacheHits++;
        return { success: true, data: cached };
    }
    
    performanceMetrics.cacheMisses++;
    
    // Fetch from API with retry logic
    let lastError = null;
    for (let attempt = 1; attempt <= PERF_CONFIG.RETRY_ATTEMPTS; attempt++) {
        const endpoint = `/extension/vendor-data/${platform}/${vendorCode}`;
        const result = await fetchFromAPI(endpoint);
        
        if (result.success) {
            // Cache the response
            vendorDataCache.set(cacheKey, result.data);
            Logger.performance(`Vendor data cached for ${cacheKey} (attempt ${attempt})`);
            return result;
        }
        
        lastError = result;
        
        if (!result.isTimeout && !result.isConnectionError) {
            break; // Don't retry on non-network errors
        }
        
        if (attempt < PERF_CONFIG.RETRY_ATTEMPTS) {
            const delay = Math.min(1000 * attempt, 3000); // Progressive delay
            Logger.debug(`API: Retrying ${endpoint} in ${delay}ms (attempt ${attempt + 1})`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    return lastError;
}

async function getAPIStats() {
    const cached = apiStatsCache.get('stats');
    if (cached) {
        return { success: true, data: cached };
    }
    
    try {
        const result = await fetchFromAPI('/stats');
        if (result.success) {
            apiStatsCache.set('stats', result.data);
        }
        return result;
    } catch (error) {
        Logger.error("Failed to get API stats:", error);
        return { success: false, error: error.message };
    }
}

async function getVendorsList() {
    const cached = vendorListCache.get('vendors');
    if (cached) {
        Logger.performance("Using cached vendor list");
        return { success: true, data: cached };
    }
    
    try {
        const result = await fetchFromAPI('/vendors?limit=1000');
        
        if (result.success) {
            vendorListCache.set('vendors', result.data);
            Logger.performance(`Cached vendor list with ${result.data?.length || 0} vendors`);
        } else {
            Logger.warn("Failed to fetch vendor list:", result.error);
        }
        
        return result;
    } catch (error) {
        Logger.error("Exception in getVendorsList:", error);
        return { success: false, error: error.message };
    }
}

// ===== OPTIMIZED COMPARISON FUNCTION =====
function processAndCompare(sfProducts, tfProducts, sourcePlatform, itemMappings) {
    const startTime = performance.now();
    
    Logger.debug(`Comparison: Starting for ${sourcePlatform}`);
    Logger.debug(`Comparison: SF products: ${Object.keys(sfProducts).length}, TF products: ${Object.keys(tfProducts).length}, Mappings: ${Object.keys(itemMappings).length}`);
    
    const comparisonResults = {};
    const baseProducts = sourcePlatform === 'snappfood' ? sfProducts : tfProducts;
    const counterpartProducts = sourcePlatform === 'snappfood' ? tfProducts : sfProducts;
    
    let foundMappings = 0;
    let validComparisons = 0;
    
    // Process in chunks for better performance
    const productIds = Object.keys(baseProducts);
    const chunkSize = 50; // Process 50 products at a time
    
    for (let i = 0; i < productIds.length; i += chunkSize) {
        const chunk = productIds.slice(i, i + chunkSize);
        
        for (const baseId of chunk) {
            const baseIdInt = parseInt(baseId);
            const counterpartId = itemMappings[baseIdInt];
            
            if (counterpartId) {
                foundMappings++;
                
                if (counterpartProducts[counterpartId]) {
                    const baseProduct = baseProducts[baseId];
                    const counterpartProduct = counterpartProducts[counterpartId];
                    
                    if (baseProduct.price > 0) { // Avoid division by zero
                        const priceDiff = baseProduct.price - counterpartProduct.price;
                        const percentDiff = Math.round((Math.abs(priceDiff) / baseProduct.price) * 100);
                        
                        comparisonResults[baseId] = {
                            baseProduct,
                            counterpartProduct,
                            priceDiff,
                            percentDiff,
                            isCheaper: priceDiff > 0,
                            isMoreExpensive: priceDiff < 0,
                            isSamePrice: priceDiff === 0
                        };
                        validComparisons++;
                    }
                }
            }
        }
    }
    
    const processTime = performance.now() - startTime;
    Logger.performance(`Comparison: Processed ${foundMappings} mappings, created ${validComparisons} comparisons in ${processTime.toFixed(2)}ms`);
    
    return comparisonResults;
}

// ===== OPTIMIZED EXTERNAL API FETCHING =====
async function fetchSnappfoodData(vendorCode) {
    const url = `https://snappfood.ir/mobile/v2/restaurant/details/dynamic?lat=35.715&long=51.404&vendorCode=${vendorCode}&optionalClient=WEBSITE&client=WEBSITE&deviceType=WEBSITE&appVersion=8.1.1`;
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PERF_CONFIG.REQUEST_TIMEOUT);
        
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`SnappFood API Error: ${response.status}`);
        
        const json = await response.json();
        
        if (!json || !json.data || !Array.isArray(json.data.menus)) {
            throw new Error("Invalid SnappFood API response: 'data.menus' array not found.");
        }
        
        const products = {};
        let totalProducts = 0;
        
        // Process in chunks for better performance
        for (const menuSection of json.data.menus) {
            if (menuSection && Array.isArray(menuSection.products)) {
                for (const p of menuSection.products) {
                    if (p && p.id && typeof p.title !== 'undefined' && typeof p.price !== 'undefined') {
                        const originalPrice = p.price || 0;
                        const discount = p.discount || 0;
                        const finalPrice = originalPrice - discount;
                        
                        products[p.id] = {
                            id: p.id,
                            name: p.title.trim(),
                            price: finalPrice,
                            originalPrice: originalPrice,
                            discount: discount,
                            discountRatio: p.discountRatio || 0
                        };
                        totalProducts++;
                    }
                }
            }
        }
        
        Logger.performance(`SnappFood: Processed ${totalProducts} products for vendor ${vendorCode}`);
        
        if (totalProducts === 0) {
            Logger.warn("SnappFood: Response parsed, but no products were extracted. API structure may have changed.");
        }
        
        return products;
    } catch (error) {
        if (error.name === 'AbortError') {
            Logger.error(`SnappFood: Request timeout for vendor ${vendorCode}`);
        } else {
            Logger.error("Failed to fetch SnappFood data:", error);
        }
        return null;
    }
}

async function fetchTapsifoodData(vendorCode) {
    const url = `https://api.tapsi.food/v1/api/Vendor/${vendorCode}/vendor?latitude=35.7559&longitude=51.4132`;
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PERF_CONFIG.REQUEST_TIMEOUT);
        
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`TapsiFood API Error: ${response.status}`);
        
        const json = await response.json();
        
        if (!json || !json.data || !Array.isArray(json.data.categories)) {
             throw new Error("Invalid or unexpected TapsiFood API response structure.");
        }
        
        const products = {};
        let totalProducts = 0;
        
        // Process in chunks for better performance
        for (const category of json.data.categories) {
            if(category.products && Array.isArray(category.products)) {
                for (const p of category.products) {
                    if (p && p.productVariations && p.productVariations.length > 0) {
                        const variation = p.productVariations[0];
                        const originalPrice = variation.price || 0;
                        const finalPrice = variation.priceAfterDiscount || originalPrice;
                        const discountRatio = variation.discountRatio || 0;
                        
                        products[p.productId] = {
                            id: p.productId,
                            name: p.productName.trim(),
                            price: finalPrice,
                            originalPrice: originalPrice,
                            discountRatio: discountRatio
                        };
                        totalProducts++;
                    }
                }
            }
        }
        
        Logger.performance(`TapsiFood: Processed ${totalProducts} products for vendor ${vendorCode}`);
        return products;
    } catch (error) {
        if (error.name === 'AbortError') {
            Logger.error(`TapsiFood: Request timeout for vendor ${vendorCode}`);
        } else {
            Logger.error("Failed to fetch TapsiFood data:", error);
        }
        return null;
    }
}

// ===== ENHANCED MESSAGE HANDLER =====
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const startTime = performance.now();
    
    Logger.debug(`Message received: ${request.action}`);
    
    // Handle price fetching requests from menu pages
    if (request.action === "fetchPrices") {
        (async () => {
            try {
                const { sfVendorCode, tfVendorCode, sourcePlatform } = request;
                
                if (!sourcePlatform || (!sfVendorCode && !tfVendorCode)) {
                    sendResponse({ success: false, error: "Invalid request format." });
                    return;
                }
                
                // Get vendor mapping from API
                let apiResult;
                if (sourcePlatform === "snappfood" && sfVendorCode) {
                    apiResult = await getVendorData('snappfood', sfVendorCode);
                } else if (sourcePlatform === "tapsifood" && tfVendorCode) {
                    apiResult = await getVendorData('tapsifood', tfVendorCode);
                } else {
                    sendResponse({ success: false, error: "Invalid platform or vendor code." });
                    return;
                }
                
                if (!apiResult.success) {
                    sendResponse({ 
                        success: false, 
                        error: apiResult.error,
                        isConnectionError: apiResult.isConnectionError 
                    });
                    return;
                }
                
                const { vendor_info, item_mappings } = apiResult.data;
                
                // Fetch product data from both platforms concurrently
                const [sfProducts, tfProducts] = await Promise.all([
                    fetchSnappfoodData(vendor_info.sf_code),
                    fetchTapsifoodData(vendor_info.tf_code)
                ]);
                
                if (sfProducts && tfProducts) {
                    const comparisonData = processAndCompare(sfProducts, tfProducts, sourcePlatform, item_mappings);
                    
                    const processingTime = performance.now() - startTime;
                    Logger.performance(`Price fetching completed in ${processingTime.toFixed(2)}ms`);
                    
                    sendResponse({ 
                        success: true, 
                        data: comparisonData, 
                        vendorInfo: vendor_info,
                        performanceMetrics: {
                            processingTime: processingTime.toFixed(2),
                            sfProductCount: Object.keys(sfProducts).length,
                            tfProductCount: Object.keys(tfProducts).length,
                            comparisonCount: Object.keys(comparisonData).length
                        }
                    });
                } else {
                    let errorMsg = "Failed to fetch product data from one or both platforms.";
                    if (!sfProducts) errorMsg += " (SnappFood failed)";
                    if (!tfProducts) errorMsg += " (TapsiFood failed)";
                    sendResponse({ success: false, error: errorMsg });
                }
            } catch (error) {
                Logger.error("Unexpected error in fetchPrices:", error);
                sendResponse({ success: false, error: `Unexpected error: ${error.message}` });
            }
        })();
        return true; // Indicates that the response is sent asynchronously
    }
    
    // Handle vendor list requests from home/service pages or popup
    if (request.action === "getVendorList") {
        (async () => {
            try {
                const [statsResult, vendorsResult] = await Promise.all([
                    getAPIStats(), 
                    getVendorsList()
                ]);
                
                let vendors = [];
                let stats = { totalVendors: 0, totalItems: 0 };
                let apiErrors = { statsError: null, vendorsError: null };
                
                if (vendorsResult.success && vendorsResult.data) {
                    vendors = vendorsResult.data;
                } else {
                    apiErrors.vendorsError = vendorsResult.error;
                }
                
                if (statsResult.success && statsResult.data) {
                    stats = {
                        totalVendors: statsResult.data.total_vendors || 0,
                        totalItems: statsResult.data.total_items || 0,
                        uniqueSfVendors: statsResult.data.unique_sf_vendors || 0,
                        uniqueTfVendors: statsResult.data.unique_tf_vendors || 0
                    };
                } else {
                    apiErrors.statsError = statsResult.error;
                }
                
                const processingTime = performance.now() - startTime;
                Logger.performance(`Vendor list fetching completed in ${processingTime.toFixed(2)}ms`);
                    
                sendResponse({ 
                    success: true, 
                    vendors: vendors,
                    stats: stats,
                    apiErrors: apiErrors,
                    performanceMetrics: {
                        processingTime: processingTime.toFixed(2),
                        vendorCount: vendors.length,
                        cacheStats: {
                            vendorData: vendorDataCache.getStats(),
                            vendorList: vendorListCache.getStats(),
                            apiStats: apiStatsCache.getStats()
                        }
                    }
                });
            } catch (error) {
                Logger.error("Failed to get vendor list:", error);
                sendResponse({ 
                    success: false, 
                    error: `Failed to connect to API: ${error.message}`,
                    isConnectionError: true
                });
            }
        })();
        return true;
    }
    
    // Handle health check requests
    if (request.action === "healthCheck") {
        (async () => {
            try {
                const result = await fetchFromAPI('/health');
                const processingTime = performance.now() - startTime;
                
                if (result.success) {
                    result.performanceMetrics = {
                        processingTime: processingTime.toFixed(2),
                        systemMetrics: performanceMetrics,
                        cacheStats: {
                            vendorData: vendorDataCache.getStats(),
                            vendorList: vendorListCache.getStats(),
                            apiStats: apiStatsCache.getStats()
                        }
                    };
                }
                
                sendResponse(result);
            } catch (error) {
                sendResponse({ 
                    success: false, 
                    error: error.message,
                    isConnectionError: true
                });
            }
        })();
        return true;
    }
    
    // Handle performance metrics requests
    if (request.action === "getPerformanceMetrics") {
        const processingTime = performance.now() - startTime;
        const uptime = Date.now() - performanceMetrics.startTime;
        
        sendResponse({
            success: true,
            data: {
                ...performanceMetrics,
                uptime: uptime,
                uptimeFormatted: formatUptime(uptime),
                processingTime: processingTime.toFixed(2),
                cacheStats: {
                    vendorData: vendorDataCache.getStats(),
                    vendorList: vendorListCache.getStats(),
                    apiStats: apiStatsCache.getStats()
                }
            }
        });
        return false;
    }
    
    // Handle cache management requests
    if (request.action === "clearCache") {
        vendorDataCache.clear();
        vendorListCache.clear();
        apiStatsCache.clear();
        
        sendResponse({ 
            success: true, 
            message: "All caches cleared successfully",
            clearedAt: new Date().toISOString()
        });
        return false;
    }
    
    // Unknown action
    Logger.warn(`Unknown action received: ${request.action}`);
    sendResponse({ success: false, error: "Unknown action" });
    return false;
});

// ===== UTILITY FUNCTIONS =====
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

// ===== STARTUP AND HEALTH CHECK =====
(async () => {
    try {
        Logger.performance("Background: Starting up...");
        
        const result = await fetchFromAPI('/health');
        if (result.success) {
            Logger.info("Background: ✅ API connection successful!", result.data);
            
            // Pre-warm caches with a small vendor list request
            try {
                await getVendorsList();
                Logger.performance("Background: Cache pre-warming completed");
            } catch (error) {
                Logger.warn("Background: Cache pre-warming failed:", error);
            }
        } else {
            Logger.error("Background: ❌ API connection failed!", result.error);
            if (result.isConnectionError) {
                Logger.info("Background: Please ensure FastAPI server is running on http://127.0.0.1:8000");
            }
        }
    } catch (error) {
        Logger.error("Background: Failed to test API connection on startup:", error);
    }
})();

// ===== PERIODIC MAINTENANCE =====
// Clean expired cache entries every 2 minutes
setInterval(() => {
    const vendorDataCleaned = vendorDataCache.cleanup();
    const vendorListCleaned = vendorListCache.cleanup();
    const apiStatsCleaned = apiStatsCache.cleanup();
    
    const totalCleaned = vendorDataCleaned + vendorListCleaned + apiStatsCleaned;
    
    if (totalCleaned > 0) {
        Logger.performance(`Background: Periodic cleanup removed ${totalCleaned} expired cache entries`);
    }
}, 120000); // 2 minutes

// Log performance metrics every 5 minutes
setInterval(() => {
    if (PERF_CONFIG.DEBUG_LOGGING) {
        const uptime = Date.now() - performanceMetrics.startTime;
        Logger.performance("Background: Performance Report", {
            uptime: formatUptime(uptime),
            apiCalls: performanceMetrics.apiCalls,
            errors: performanceMetrics.errors,
            averageResponseTime: performanceMetrics.averageResponseTime.toFixed(2) + 'ms',
            cacheHitRate: vendorDataCache.getStats().hitRate,
            memoryUsage: 'N/A' // Would need additional API for memory stats
        });
    }
}, 300000); // 5 minutes

// ===== DEBUGGING HELPERS =====
// Expose performance tools for debugging
if (PERF_CONFIG.DEBUG_LOGGING) {
    chrome.runtime.getBackgroundPage = chrome.runtime.getBackgroundPage || (() => ({
        getCacheStats: () => ({
            vendorData: vendorDataCache.getStats(),
            vendorList: vendorListCache.getStats(),
            apiStats: apiStatsCache.getStats()
        }),
        getPerformanceMetrics: () => performanceMetrics,
        clearAllCaches: () => {
            vendorDataCache.clear();
            vendorListCache.clear();
            apiStatsCache.clear();
            Logger.performance("Background: All caches cleared via debug interface");
        }
    }));
}

Logger.performance("Background: Service worker setup complete with performance optimizations");