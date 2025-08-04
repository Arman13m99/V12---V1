// Enhanced popup functionality with performance metrics and improved UX
// Version 3.3 - Performance Optimized
console.log("🚀 مقایسه‌گر قیمت غذا - پاپ‌آپ بهینه‌شده باز شد");

// ===== PERFORMANCE CONFIGURATION =====
const PERF_CONFIG = {
    DEBUG_LOGGING: false,           // Set true for debugging
    AUTO_REFRESH_INTERVAL: 30000,   // 30 seconds
    PERFORMANCE_MONITORING: true,   // Enable performance metrics
    CACHE_ENABLED: true             // Enable client-side caching
};

// ===== OPTIMIZED LOGGING SYSTEM =====
const Logger = {
    debug: PERF_CONFIG.DEBUG_LOGGING ? console.log : () => {},
    info: PERF_CONFIG.DEBUG_LOGGING ? console.info : () => {},
    warn: console.warn, // Always show warnings
    error: console.error, // Always show errors
    performance: PERF_CONFIG.PERFORMANCE_MONITORING ? console.log : () => {}
};

// Global state
let vendorStats = null;
let currentTabInfo = null;
let apiConnectionStatus = 'checking'; // 'checking', 'connected', 'error'
let performanceMetrics = null;
let autoRefreshInterval = null;

// ===== SIMPLE CACHE FOR POPUP =====
const popupCache = {
    data: new Map(),
    ttl: 60000, // 1 minute TTL
    
    get(key) {
        const item = this.data.get(key);
        if (item && Date.now() < item.expiry) {
            return item.value;
        }
        if (item) this.data.delete(key);
        return null;
    },
    
    set(key, value) {
        this.data.set(key, {
            value: value,
            expiry: Date.now() + this.ttl
        });
    },
    
    clear() {
        this.data.clear();
    }
};

document.addEventListener('DOMContentLoaded', function() {
    Logger.debug("📱 Popup DOM loaded, initializing optimized version...");
    
    // Initialize popup components
    initializePopup();
    
    // Add enhanced interactions
    setupFeatureAnimations();
    setupKeyboardNavigation();
    setupPerformanceMonitoring();
});

async function initializePopup() {
    const startTime = performance.now();
    
    try {
        // Show loading state
        showLoadingState();
        
        // Load vendor statistics first (faster response)
        await loadVendorStats();
        
        // Check current tab in parallel
        await checkCurrentTab();
        
        // Load performance metrics if enabled
        if (PERF_CONFIG.PERFORMANCE_MONITORING) {
            await loadPerformanceMetrics();
        }
        
        // Update final UI state
        updateFinalState();
        
        const initTime = performance.now() - startTime;
        Logger.performance(`✅ Popup initialization completed in ${initTime.toFixed(2)}ms`);
        
    } catch (error) {
        Logger.error("❌ Popup initialization failed:", error);
        showErrorState("خطا در راه‌اندازی پاپ‌آپ");
    }
}

function loadVendorStats() {
    return new Promise((resolve) => {
        Logger.debug("📊 Loading vendor statistics...");
        
        // Check cache first
        if (PERF_CONFIG.CACHE_ENABLED) {
            const cached = popupCache.get('vendorStats');
            if (cached) {
                Logger.performance("Using cached vendor stats");
                vendorStats = cached.stats;
                apiConnectionStatus = 'connected';
                updateVendorStats(cached.stats, cached.vendors);
                resolve(true);
                return;
            }
        }
        
        chrome.runtime.sendMessage({ action: "getVendorList" }, (response) => {
            if (chrome.runtime.lastError) {
                Logger.error("🔴 Runtime error:", chrome.runtime.lastError);
                apiConnectionStatus = 'error';
                resolve(false);
                return;
            }
            
            if (response && response.success) {
                Logger.debug("✅ Vendor stats loaded:", response.stats);
                vendorStats = response.stats;
                apiConnectionStatus = 'connected';
                
                // Cache the response
                if (PERF_CONFIG.CACHE_ENABLED) {
                    popupCache.set('vendorStats', {
                        stats: response.stats,
                        vendors: response.vendors
                    });
                }
                
                updateVendorStats(response.stats, response.vendors);
                
                // Handle API warnings
                if (response.apiErrors) {
                    Logger.warn("⚠️ API warnings detected:", response.apiErrors);
                    showApiWarnings(response.apiErrors);
                }
                
                // Store performance metrics
                if (response.performanceMetrics) {
                    performanceMetrics = response.performanceMetrics;
                    Logger.performance("Performance metrics received:", response.performanceMetrics);
                }
                
                resolve(true);
            } else {
                Logger.error("🔴 Failed to load vendor stats:", response?.error);
                apiConnectionStatus = 'error';
                showErrorStatus(response?.error || "خطای نامشخص");
                resolve(false);
            }
        });
    });
}

function loadPerformanceMetrics() {
    return new Promise((resolve) => {
        if (!PERF_CONFIG.PERFORMANCE_MONITORING) {
            resolve(false);
            return;
        }
        
        Logger.debug("📈 Loading performance metrics...");
        
        chrome.runtime.sendMessage({ action: "getPerformanceMetrics" }, (response) => {
            if (chrome.runtime.lastError) {
                Logger.warn("Performance metrics not available:", chrome.runtime.lastError);
                resolve(false);
                return;
            }
            
            if (response && response.success) {
                performanceMetrics = response.data;
                Logger.performance("Performance metrics loaded:", performanceMetrics);
                addPerformanceSection();
            }
            
            resolve(true);
        });
    });
}

function checkCurrentTab() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (chrome.runtime.lastError || !tabs[0]) {
                Logger.warn("⚠️ Could not access current tab");
                resolve(false);
                return;
            }
            
            const currentUrl = tabs[0].url;
            Logger.debug("🔍 Checking current tab:", currentUrl);
            
            currentTabInfo = analyzeCurrentUrl(currentUrl);
            updateCurrentSiteStatus(currentTabInfo);
            resolve(true);
        });
    });
}

function analyzeCurrentUrl(currentUrl) {
    const info = {
        platform: null,
        vendorCode: null,
        pageType: 'unknown',
        isSupported: false
    };
    
    // SnappFood detection
    if (currentUrl.includes('snappfood.ir')) {
        info.platform = 'snappfood';
        
        if (currentUrl.includes('/restaurant/menu/')) {
            const match = currentUrl.match(/-r-([a-zA-Z0-9]+)\/?/);
            if (match) {
                info.vendorCode = match[1];
                info.pageType = 'menu';
            }
        } else if (currentUrl.includes('/service/')) {
            info.pageType = 'service';
        } else if (currentUrl.match(/^https?:\/\/(www\.)?snappfood\.ir\/?(\?.*)?$/)) {
            info.pageType = 'homepage';
        }
    }
    
    // TapsiFood detection
    else if (currentUrl.includes('tapsi.food')) {
        info.platform = 'tapsifood';
        
        if (currentUrl.includes('/vendor/')) {
            const match = currentUrl.match(/tapsi\.food\/vendor\/([a-zA-Z0-9]+)/);
            if (match) {
                info.vendorCode = match[1];
                info.pageType = 'menu';
            }
        }
    }
    
    Logger.debug("🎯 URL Analysis result:", info);
    return info;
}

function updateVendorStats(stats, vendors) {
    const statusItems = document.querySelectorAll('.status-item');
    
    // Update second status item with vendor count
    if (statusItems[1]) {
        const textSpan = statusItems[1].querySelector('span:last-child');
        if (textSpan) {
            textSpan.textContent = `${stats.totalVendors || 0} رستوران پشتیبانی شده`;
        }
        
        // Add success styling
        statusItems[1].classList.add('success');
    }
    
    // Add item count status
    addItemCountStatus(stats.totalItems || 0);
    
    Logger.debug(`📈 Stats updated: ${stats.totalVendors} vendors, ${stats.totalItems} items`);
}

function addItemCountStatus(itemCount) {
    const statusContainer = document.querySelector('.status');
    if (!statusContainer) return;
    
    const itemCountElement = document.createElement('div');
    itemCountElement.className = 'status-item success';
    itemCountElement.innerHTML = `
        <span class="status-indicator active"></span>
        <span>${itemCount.toLocaleString('fa-IR')} محصول قابل مقایسه</span>
    `;
    
    statusContainer.appendChild(itemCountElement);
}

function addPerformanceSection() {
    if (!performanceMetrics || !PERF_CONFIG.PERFORMANCE_MONITORING) return;
    
    const container = document.querySelector('.container');
    if (!container) return;
    
    // Create performance section
    const perfSection = document.createElement('div');
    perfSection.className = 'performance-section';
    perfSection.innerHTML = `
        <div class="section-header">
            <h3>📊 عملکرد سیستم</h3>
            <button class="toggle-btn" id="perf-toggle">نمایش جزئیات</button>
        </div>
        <div class="performance-stats" id="perf-stats" style="display: none;">
            <div class="stat-grid">
                <div class="stat-item">
                    <span class="stat-label">تماس‌های API</span>
                    <span class="stat-value">${performanceMetrics.apiCalls || 0}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">خطاها</span>
                    <span class="stat-value">${performanceMetrics.errors || 0}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">میانگین پاسخ</span>
                    <span class="stat-value">${(performanceMetrics.averageResponseTime || 0).toFixed(0)}ms</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">کش کارایی</span>
                    <span class="stat-value">${performanceMetrics.cacheStats?.vendorData?.hitRate || 'N/A'}</span>
                </div>
            </div>
            <div class="cache-controls">
                <button class="cache-btn" id="clear-cache-btn">پاک کردن کش</button>
                <button class="cache-btn" id="refresh-metrics-btn">به‌روزرسانی آمار</button>
            </div>
        </div>
    `;
    
    // Insert before version section
    const versionSection = container.querySelector('.version');
    if (versionSection) {
        container.insertBefore(perfSection, versionSection);
    } else {
        container.appendChild(perfSection);
    }
    
    // Setup performance section interactions
    setupPerformanceInteractions();
}

function setupPerformanceInteractions() {
    const toggleBtn = document.getElementById('perf-toggle');
    const statsDiv = document.getElementById('perf-stats');
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    const refreshBtn = document.getElementById('refresh-metrics-btn');
    
    if (toggleBtn && statsDiv) {
        toggleBtn.addEventListener('click', () => {
            const isVisible = statsDiv.style.display !== 'none';
            statsDiv.style.display = isVisible ? 'none' : 'block';
            toggleBtn.textContent = isVisible ? 'نمایش جزئیات' : 'مخفی کردن';
        });
    }
    
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', () => {
            if (confirm('آیا مطمئن هستید که می‌خواهید کش سیستم را پاک کنید؟')) {
                clearSystemCache();
            }
        });
    }
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshPerformanceMetrics();
        });
    }
}

function clearSystemCache() {
    chrome.runtime.sendMessage({ action: "clearCache" }, (response) => {
        if (response && response.success) {
            showToast('کش سیستم پاک شد', 'success');
            // Clear local cache too
            if (PERF_CONFIG.CACHE_ENABLED) {
                popupCache.clear();
            }
            // Refresh metrics
            setTimeout(() => refreshPerformanceMetrics(), 500);
        } else {
            showToast('خطا در پاک کردن کش', 'error');
        }
    });
}

function refreshPerformanceMetrics() {
    loadPerformanceMetrics().then(() => {
        updatePerformanceDisplay();
        showToast('آمار به‌روزرسانی شد', 'success');
    });
}

function updatePerformanceDisplay() {
    if (!performanceMetrics) return;
    
    const statValues = document.querySelectorAll('.performance-stats .stat-value');
    if (statValues.length >= 4) {
        statValues[0].textContent = performanceMetrics.apiCalls || 0;
        statValues[1].textContent = performanceMetrics.errors || 0;
        statValues[2].textContent = (performanceMetrics.averageResponseTime || 0).toFixed(0) + 'ms';
        statValues[3].textContent = performanceMetrics.cacheStats?.vendorData?.hitRate || 'N/A';
    }
}

function showToast(message, type = 'info') {
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // Style the toast
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8',
        color: 'white',
        padding: '12px 20px',
        borderRadius: '8px',
        fontSize: '12px',
        fontWeight: '500',
        zIndex: '10000',
        fontFamily: "'Vazirmatn', 'Tahoma', sans-serif",
        direction: 'rtl',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        opacity: '0',
        transform: 'translateY(20px)',
        transition: 'all 0.3s ease'
    });
    
    document.body.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });
    
    // Remove after delay
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function updateCurrentSiteStatus(tabInfo) {
    const statusItems = document.querySelectorAll('.status-item');
    const firstStatusItem = statusItems[0];
    
    if (!firstStatusItem) return;
    
    if (tabInfo.pageType === 'menu' && tabInfo.vendorCode) {
        // Check if this vendor is supported
        checkVendorSupport(tabInfo, firstStatusItem);
    } else if (tabInfo.pageType === 'homepage' || tabInfo.pageType === 'service') {
        updateStatus(firstStatusItem, true, `${tabInfo.platform === 'snappfood' ? 'اسنپ‌فود' : 'تپسی‌فود'} - نشان‌گذاری رستوران‌ها فعال`);
        firstStatusItem.classList.add('success');
        updateInstructionsForHomepage(tabInfo.platform);
    } else if (tabInfo.platform) {
        updateStatus(firstStatusItem, false, `${tabInfo.platform === 'snappfood' ? 'اسنپ‌فود' : 'تپسی‌فود'} شناسایی شد - صفحه پشتیبانی نمی‌شود`);
        firstStatusItem.classList.add('warning');
    } else {
        updateStatus(firstStatusItem, false, 'لطفاً به صفحه اسنپ‌فود یا تپسی‌فود بروید');
        firstStatusItem.classList.add('error');
    }
}

function checkVendorSupport(tabInfo, statusItem) {
    if (apiConnectionStatus === 'error') {
        updateStatus(statusItem, false, 'خطا در اتصال به API - نمی‌توان وضعیت رستوران را بررسی کرد');
        statusItem.classList.add('error');
        return;
    }
    
    // Check cache first
    if (PERF_CONFIG.CACHE_ENABLED) {
        const cached = popupCache.get('vendorStats');
        if (cached && cached.vendors) {
            const supportedVendor = cached.vendors.find(v => 
                tabInfo.platform === 'snappfood' ? 
                v.sf_code === tabInfo.vendorCode : 
                v.tf_code === tabInfo.vendorCode
            );
            
            if (supportedVendor) {
                const restaurantName = tabInfo.platform === 'snappfood' ? 
                    supportedVendor.sf_name : supportedVendor.tf_name;
                const otherPlatform = tabInfo.platform === 'snappfood' ? 'تپسی‌فود' : 'اسنپ‌فود';
                
                updateStatus(statusItem, true, `${restaurantName} - مقایسه با ${otherPlatform} فعال`);
                statusItem.classList.add('success');
                updateInstructionsForRestaurant(restaurantName, tabInfo.platform);
                return;
            }
        }
    }
    
    // Fallback to API call
    chrome.runtime.sendMessage({ action: "getVendorList" }, (response) => {
        if (response && response.success && response.vendors) {
            Logger.debug(`🔍 Checking ${response.vendors.length} vendors for ${tabInfo.vendorCode}`);
            
            const supportedVendor = response.vendors.find(v => 
                tabInfo.platform === 'snappfood' ? 
                v.sf_code === tabInfo.vendorCode : 
                v.tf_code === tabInfo.vendorCode
            );
            
            if (supportedVendor) {
                const restaurantName = tabInfo.platform === 'snappfood' ? 
                    supportedVendor.sf_name : supportedVendor.tf_name;
                const otherPlatform = tabInfo.platform === 'snappfood' ? 'تپسی‌فود' : 'اسنپ‌فود';
                
                updateStatus(statusItem, true, `${restaurantName} - مقایسه با ${otherPlatform} فعال`);
                statusItem.classList.add('success');
                updateInstructionsForRestaurant(restaurantName, tabInfo.platform);
                
                Logger.debug(`✅ Found supported vendor: ${restaurantName}`);
            } else {
                updateStatus(statusItem, false, 'رستوران شناسایی شد اما پشتیبانی نمی‌شود');
                statusItem.classList.add('warning');
                Logger.debug(`⚠️ Vendor ${tabInfo.vendorCode} not supported`);
            }
        } else {
            Logger.warn("⚠️ Could not check vendor support:", response?.error);
            updateStatus(statusItem, false, 'خطا در بررسی پشتیبانی رستوران');
            statusItem.classList.add('error');
        }
    });
}

function updateStatus(statusItem, isActive, text) {
    const indicator = statusItem.querySelector('.status-indicator');
    const textSpan = statusItem.querySelector('span:last-child');
    
    if (indicator) {
        if (isActive) {
            indicator.classList.add('active');
        } else {
            indicator.classList.remove('active');
        }
    }
    
    if (textSpan) {
        textSpan.textContent = text;
    }
}

function updateInstructionsForRestaurant(restaurantName, platform) {
    const instructionsDiv = document.querySelector('.instructions');
    if (!instructionsDiv) return;
    
    const platformName = platform === 'snappfood' ? 'اسنپ‌فود' : 'تپسی‌فود';
    const otherPlatform = platform === 'snappfood' ? 'تپسی‌فود' : 'اسنپ‌فود';
    
    instructionsDiv.innerHTML = `
        <h3>✅ ${restaurantName}</h3>
        <ol>
            <li>شما در حال حاضر در ${platformName} هستید</li>
            <li>قیمت‌های مقایسه شده با ${otherPlatform} نمایش داده می‌شوند</li>
            <li>محصولات ارزان‌تر با حاشیه سبز مشخص شده‌اند</li>
            <li>برای رفتن به ${otherPlatform} روی متن مقایسه کلیک کنید</li>
            <li>برای جستجو روی آیکن 🔍 کلیک کنید</li>
        </ol>
    `;
}

function updateInstructionsForHomepage(platform) {
    const instructionsDiv = document.querySelector('.instructions');
    if (!instructionsDiv) return;
    
    const platformName = platform === 'snappfood' ? 'اسنپ‌فود' : 'تپسی‌فود';
    
    instructionsDiv.innerHTML = `
        <h3>🏠 صفحه اصلی ${platformName}</h3>
        <ol>
            <li>رستوران‌های جفت با حاشیه سبز مشخص شده‌اند</li>
            <li>رستوران‌های امتیاز بالا (4.2+) با حاشیه زرد و ستاره مشخص شده‌اند</li>
            <li>رستوران‌های برتر (جفت + امتیاز بالا) با حاشیه بنفش و تاج مشخص شده‌اند</li>
            <li>نشان "ارسال رایگان از تپسی‌فود" روی رستوران‌ها نمایش داده می‌شود</li>
            <li>به صفحه منوی رستوران‌ها بروید تا قیمت‌ها را مقایسه کنید</li>
        </ol>
    `;
}

function showLoadingState() {
    const statusItems = document.querySelectorAll('.status-item');
    statusItems.forEach(item => {
        item.classList.add('loading');
        const textSpan = item.querySelector('span:last-child');
        if (textSpan) {
            textSpan.textContent = 'در حال بارگذاری...';
        }
    });
}

function showErrorState(message) {
    const statusItems = document.querySelectorAll('.status-item');
    statusItems[0]?.classList.add('error');
    statusItems[1]?.classList.add('error');
    
    const firstTextSpan = statusItems[0]?.querySelector('span:last-child');
    if (firstTextSpan) {
        firstTextSpan.textContent = message;
    }
}

function showApiWarnings(apiErrors) {
    if (!apiErrors.statsError && !apiErrors.vendorsError) return;
    
    const statusContainer = document.querySelector('.status');
    if (!statusContainer) return;
    
    const warningElement = document.createElement('div');
    warningElement.className = 'status-item warning';
    warningElement.innerHTML = `
        <span class="status-indicator" style="background: #ffc107;"></span>
        <span>اتصال API محدود - برخی ویژگی‌ها ممکن است کار نکنند</span>
    `;
    
    statusContainer.appendChild(warningElement);
}

function showErrorStatus(error) {
    const statusItems = document.querySelectorAll('.status-item');
    if (statusItems[1]) {
        const textSpan = statusItems[1].querySelector('span:last-child');
        if (textSpan) {
            textSpan.textContent = 'خطا در دریافت اطلاعات سرور';
        }
        
        statusItems[1].classList.add('error');
    }
}

function updateFinalState() {
    // Remove loading states
    const loadingElements = document.querySelectorAll('.loading');
    loadingElements.forEach(el => el.classList.remove('loading'));
    
    Logger.debug("✅ Popup state update completed");
}

// ===== PERFORMANCE MONITORING SETUP =====
function setupPerformanceMonitoring() {
    if (!PERF_CONFIG.PERFORMANCE_MONITORING) return;
    
    // Monitor popup performance
    const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
            if (entry.entryType === 'measure') {
                Logger.performance(`Performance: ${entry.name} took ${entry.duration.toFixed(2)}ms`);
            }
        });
    });
    
    if (window.PerformanceObserver) {
        observer.observe({ entryTypes: ['measure'] });
    }
    
    // Mark popup load time
    window.addEventListener('load', () => {
        if (window.performance && window.performance.mark) {
            window.performance.mark('popup-load-complete');
            
            const loadTime = performance.now();
            Logger.performance(`Popup loaded in ${loadTime.toFixed(2)}ms`);
        }
    });
}

// Enhanced Feature Animations with Performance Optimization
function setupFeatureAnimations() {
    const features = document.querySelectorAll('.feature');
    
    // Use Intersection Observer for better performance
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                const feature = entry.target;
                
                // Staggered animation
                setTimeout(() => {
                    feature.style.transition = 'all 0.3s ease';
                    feature.style.opacity = '1';
                    feature.style.transform = 'translateY(0)';
                }, 50 * index);
                
                observer.unobserve(feature);
            }
        });
    });
    
    features.forEach((feature, index) => {
        // Initial state
        feature.style.opacity = '0';
        feature.style.transform = 'translateY(10px)';
        
        // Enhanced click animation
        feature.addEventListener('click', function() {
            this.style.transform = 'scale(0.98) translateY(0)';
            setTimeout(() => {
                this.style.transform = 'translateY(-1px)';
            }, 150);
            
            // Add subtle success feedback
            const icon = this.querySelector('.icon');
            if (icon) {
                icon.style.transform = 'scale(1.2)';
                setTimeout(() => {
                    icon.style.transform = 'scale(1)';
                }, 200);
            }
        });
        
        // Add keyboard navigation
        feature.setAttribute('tabindex', '0');
        feature.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.click();
            }
        });
        
        // Observe for intersection
        observer.observe(feature);
    });
}

// Enhanced Keyboard Navigation Support
function setupKeyboardNavigation() {
    document.addEventListener('keydown', function(e) {
        // Refresh with F5 or Ctrl+R
        if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
            e.preventDefault();
            Logger.debug("🔄 Manual refresh triggered");
            refreshPopupData();
        }
        
        // Quick navigation with numbers
        if (e.key >= '1' && e.key <= '4') {
            const featureIndex = parseInt(e.key) - 1;
            const features = document.querySelectorAll('.feature');
            if (features[featureIndex]) {
                features[featureIndex].click();
                features[featureIndex].focus();
            }
        }
        
        // Performance shortcuts
        if (PERF_CONFIG.PERFORMANCE_MONITORING) {
            if (e.ctrlKey && e.shiftKey && e.key === 'P') {
                e.preventDefault();
                togglePerformanceSection();
            }
        }
    });
}

function refreshPopupData() {
    // Clear cache
    if (PERF_CONFIG.CACHE_ENABLED) {
        popupCache.clear();
    }
    
    // Reinitialize
    initializePopup();
}

function togglePerformanceSection() {
    const perfSection = document.querySelector('.performance-section');
    if (perfSection) {
        perfSection.style.display = perfSection.style.display === 'none' ? 'block' : 'none';
    }
}

// Auto-refresh functionality with performance optimization
function startAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    // Only refresh if tab is focused and API is connected
    autoRefreshInterval = setInterval(() => {
        if (document.hasFocus() && apiConnectionStatus === 'connected') {
            Logger.debug("🔄 Auto-refreshing vendor stats");
            // Only refresh stats, don't clear entire cache
            popupCache.data.delete('vendorStats');
            loadVendorStats();
        }
    }, PERF_CONFIG.AUTO_REFRESH_INTERVAL);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// Handle popup visibility changes with performance optimization
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopAutoRefresh();
    } else {
        startAutoRefresh();
        // Only refresh if significant time has passed
        const lastRefresh = popupCache.get('lastRefresh') || 0;
        if (Date.now() - lastRefresh > 60000) { // 1 minute
            if (apiConnectionStatus === 'connected') {
                loadVendorStats();
                popupCache.set('lastRefresh', Date.now());
            }
        }
    }
});

// Handle window focus/blur
window.addEventListener('focus', () => {
    Logger.debug("👁️ Popup focused, checking for updates");
    if (apiConnectionStatus === 'connected') {
        const lastRefresh = popupCache.get('lastRefresh') || 0;
        if (Date.now() - lastRefresh > 30000) { // 30 seconds
            loadVendorStats();
            popupCache.set('lastRefresh', Date.now());
        }
    }
    startAutoRefresh();
});

window.addEventListener('blur', () => {
    Logger.debug("👁️ Popup blurred, stopping auto-refresh");
    stopAutoRefresh();
});

// Initialize auto-refresh when popup loads
setTimeout(() => {
    if (apiConnectionStatus === 'connected') {
        startAutoRefresh();
    }
}, 2000);

// Enhanced Error Handling
window.addEventListener('error', (event) => {
    Logger.error('🔴 Popup runtime error:', event.error);
    showErrorState('خطای غیرمنتظره در رابط کاربری');
});

window.addEventListener('unhandledrejection', (event) => {
    Logger.error('🔴 Unhandled promise rejection:', event.reason);
    showErrorState('خطای غیرمنتظره در درخواست داده');
});

// Utility Functions
function formatNumber(num) {
    if (typeof num !== 'number') return '0';
    
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString('fa-IR');
}

function getTimeAgo(timestamp) {
    const now = new Date().getTime();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    
    if (minutes < 1) return 'هم‌اکنون';
    if (minutes < 60) return `${minutes} دقیقه پیش`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ساعت پیش`;
    
    const days = Math.floor(hours / 24);
    return `${days} روز پیش`;
}

// Add smooth scroll behavior
document.documentElement.style.scrollBehavior = 'smooth';

// Performance monitoring
if (window.performance && window.performance.mark) {
    window.performance.mark('popup-script-loaded');
    
    setTimeout(() => {
        if (window.performance.measure) {
            window.performance.measure('popup-init-time', 'popup-script-loaded');
        }
    }, 1000);
}

Logger.performance("🎉 Enhanced popup script loaded successfully with performance optimizations");

// ===== DEBUGGING AND PERFORMANCE TOOLS =====
if (PERF_CONFIG.DEBUG_LOGGING) {
    // Expose debugging functions
    window.popupDebug = {
        getCache: () => popupCache.data,
        clearCache: () => popupCache.clear(),
        getPerformanceMetrics: () => performanceMetrics,
        toggleLogging: () => {
            PERF_CONFIG.DEBUG_LOGGING = !PERF_CONFIG.DEBUG_LOGGING;
            console.log('Debug logging:', PERF_CONFIG.DEBUG_LOGGING ? 'ENABLED' : 'DISABLED');
        },
        refreshData: refreshPopupData,
        getApiStatus: () => apiConnectionStatus
    };
    
    console.log('Debug tools available: window.popupDebug');
}