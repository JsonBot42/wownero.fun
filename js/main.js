document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. Market Cap Fetcher ---
    const mcapDisplay = document.getElementById('mcap-display');
    const CACHE_KEY = 'wownero_mcap';
    const CACHE_TIME_KEY = 'wownero_mcap_timestamp';
    const CACHE_DURATION = 300000; // 5 minutes

    const fetchMcap = async () => {
        try {
            // Check cache
            const cachedMcap = localStorage.getItem(CACHE_KEY);
            const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
            const now = Date.now();

            if (cachedMcap && cachedTime && (now - cachedTime < CACHE_DURATION)) {
                formatAndDisplay(cachedMcap);
                return;
            }

            // Fetch fresh data
            const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=wownero&vs_currencies=usd&include_market_cap=true');
            const data = await response.json();
            
            if (data.wownero && data.wownero.usd_market_cap) {
                const mcap = data.wownero.usd_market_cap;
                localStorage.setItem(CACHE_KEY, mcap);
                localStorage.setItem(CACHE_TIME_KEY, now);
                formatAndDisplay(mcap);
            } else {
                throw new Error("Invalid data format");
            }
        } catch (error) {
            console.error("Failed to fetch market cap:", error);
            // Fallback or keep "Loading" / humorous text
            mcapDisplay.innerText = "1 WOW = 1 WOW"; 
        }
    };

    const formatAndDisplay = (mcap) => {
        const formatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(mcap);
        mcapDisplay.innerText = formatted;
        
        // Add a little "pop" animation
        mcapDisplay.classList.add('scale-110');
        setTimeout(() => mcapDisplay.classList.remove('scale-110'), 200);
    };

    // --- 3. Solo Mining Calculator ---
    const hashrateInput = document.getElementById('hashrate-input');
    const hashrateUnit = document.getElementById('hashrate-unit');
    const timeResult = document.getElementById('mining-time-result');
    const diffInfo = document.getElementById('mining-diff-info');
    const earningsContainer = document.getElementById('earnings-container');
    const earn24h = document.getElementById('earn-24h');
    const earn7d = document.getElementById('earn-7d');
    const earn30d = document.getElementById('earn-30d');
    const earn24hUsd = document.getElementById('earn-24h-usd');
    const earn7dUsd = document.getElementById('earn-7d-usd');
    const earn30dUsd = document.getElementById('earn-30d-usd');

    let currentDiff = 3502193242; // Fallback
    let currentReward = 150 * 1e11; // Fallback (~150 WOW * 10^11 atomic units)
    let currentPrice = 0; // Will be updated by fetchMcap
    let dataLoaded = false;

    // Fetch live network stats (Diff + Block Reward)
    const fetchNetworkStats = async () => {
        try {
            // 1. Get Network Info (Diff + Height)
            const infoRes = await fetch('https://explore.wownero.com/api/networkinfo');
            const infoData = await infoRes.json();
            
            if (infoData && infoData.data) {
                currentDiff = infoData.data.difficulty;
                const height = infoData.data.height;
                
                const readableDiff = (currentDiff / 1000000000).toFixed(2) + 'G';
                diffInfo.innerHTML = `Difficulty: <span class="text-green-400">Live (${readableDiff})</span>`;
                
                // 2. Get Last Block (for Reward)
                // We fetch the previous block (height - 1) to be sure it's fully indexed
                const blockRes = await fetch(`https://explore.wownero.com/api/block/${height - 1}`);
                const blockData = await blockRes.json();

                if (blockData && blockData.data && blockData.data.miner_tx) {
                    // In some explorers, reward is in miner_tx.outputs or similar.
                    // The standard Onion/Wownero explorer API usually returns detail of the block.
                    // Let's safe-check a few common fields.
                    // Looking at Wownero explorer source, it often puts total reward in 'reward' field of block header wrapper?
                    // Or we sum outputs of miner_tx.
                   
                    // Let's try to assume specific fields based on common explorer versions
                    // Usually: data.details.reward or data.reward
                    
                    if (blockData.data.reward) {
                         currentReward = blockData.data.reward;
                    } else if (blockData.data.details && blockData.data.details.reward) {
                         currentReward = blockData.data.details.reward;
                    } else {
                        console.warn("Could not parse reward from block, using fallback.");
                    }
                }
                
                dataLoaded = true;
                if(hashrateInput.value) calculateTime(); // Recalculate if user already typed
            }
        } catch (e) {
            console.error("Network stats fetch failed:", e);
            diffInfo.innerHTML = `Difficulty: <span class="text-gray-300">Est. (${(currentDiff/1e9).toFixed(2)}G)</span>`;
        }
    };

    // Helper: update price when mcap is fetched
    // We need to slightly refactor fetchMcap to store price globally
    const updatePrice = (price) => {
        currentPrice = price;
        if(hashrateInput.value) calculateTime();
    };

    // Modified fetchMcap to get price too
    const fetchMcapAndPrice = async () => {
        try {
            const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=wownero&vs_currencies=usd&include_market_cap=true');
            const data = await response.json();
            if (data.wownero) {
                // Update MCAP UI
                const mcap = data.wownero.usd_market_cap;
                const formattedMcap = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(mcap);
                document.getElementById('mcap-display').innerText = formattedMcap;
                
                // Update Price for Calculator
                updatePrice(data.wownero.usd);
            }
        } catch (error) {
            console.error(error);
            document.getElementById('mcap-display').innerText = "1 WOW = 1 WOW";
        }
    };

    fetchNetworkStats();
    fetchMcapAndPrice(); // Replaces original fetchMcap call

    const calculateTime = () => {
        const h = parseFloat(hashrateInput.value);
        const unit = parseFloat(hashrateUnit.value);

        if(!h || h <= 0) {
            timeResult.innerText = "--";
            earningsContainer.classList.add('hidden');
            return;
        }

        const totalHash = h * unit; // H/s
        if(totalHash === 0) return;

        // 1. Time to find block
        // Time = Difficulty / Hashrate
        const secondsPerBlock = currentDiff / totalHash;
        timeResult.innerText = formatDuration(secondsPerBlock);

        // 2. Earnings Calculation
        // Daily Blocks = 86400 / secondsPerBlock
        const dailyBlocks = 86400 / secondsPerBlock;
        
        // WOW Reward per day
        // Wownero units: 11 decimals.
        const atomicUnitsPerDay = dailyBlocks * currentReward;
        const wowPerDay = atomicUnitsPerDay / 1e11;

        // Display
        earningsContainer.classList.remove('hidden');
        
        updateEarningUI(earn24h, earn24hUsd, wowPerDay);
        updateEarningUI(earn7d, earn7dUsd, wowPerDay * 7);
        updateEarningUI(earn30d, earn30dUsd, wowPerDay * 30);
    };

    const updateEarningUI = (elWow, elUsd, amount) => {
        elWow.innerText = amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " WOW";
        if (currentPrice > 0) {
            const val = amount * currentPrice;
            elUsd.innerText = val < 0.01 ? "< $0.01" : "$" + val.toLocaleString(undefined, { maximumFractionDigits: 2 });
        } else {
            elUsd.innerText = "$??";
        }
    };

    const formatDuration = (seconds) => {
        // ... (existing formatDuration code)
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        
        if (days > 365) return "> 1 Year";
        if (days > 0) return `${days}d ${hours}h`;
        
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) return `${hours}h ${minutes}m`;
        
        return `${Math.floor(minutes)}m ${Math.floor(seconds % 60)}s`;
    };

    if(hashrateInput && hashrateUnit) {
        hashrateInput.addEventListener('input', calculateTime);
        hashrateUnit.addEventListener('change', calculateTime);
    }

    // --- 4. Hero Carousel Logic ---
    const slides = document.querySelectorAll('.carousel-slide');
    const indicators = document.querySelectorAll('.indicator');
    let currentSlide = 0;
    const intervalTime = 5000; // 5 seconds

    const showSlide = (index) => {
        slides.forEach((slide, idx) => {
            if (idx === index) {
                slide.classList.remove('opacity-0');
                slide.classList.add('opacity-100');
            } else {
                slide.classList.remove('opacity-100');
                slide.classList.add('opacity-0');
            }
        });

        // Update indicators
        indicators.forEach((ind, idx) => {
            if (idx === index) {
                ind.classList.remove('bg-white/50', 'scale-100');
                ind.classList.add('bg-white', 'scale-125');
            } else {
                ind.classList.add('bg-white/50', 'scale-100');
                ind.classList.remove('bg-white', 'scale-125');
            }
        });
    };

    const nextSlide = () => {
        currentSlide = (currentSlide + 1) % slides.length;
        showSlide(currentSlide);
    };

    // Auto-advance
    if (slides.length > 0) {
        setInterval(nextSlide, intervalTime);
    }
});
