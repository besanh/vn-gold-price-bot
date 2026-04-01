import type { GoldItem, HistoryData } from '$lib/types';

export async function getDashboardData(platform: App.Platform) {
    const giaVangTypes = ["SJL1L10", "SJ9999"];
    const miHongCodes = ["SJC"];

    // ⚡ TRY CACHE FIRST
    const cachedRaw = await platform.env.GOLD_KV.get("current_prices");
    if (cachedRaw) {
        try {
            const cached = JSON.parse(cachedRaw);
            if (cached && cached.data && Array.isArray(cached.data.current)) {
                // Sanitize cached data to prevent NaN leakage
                cached.data.current = cached.data.current.map((item: GoldItem) => ({
                    ...item,
                    buy: Number(item.buy) || 0,
                    sell: Number(item.sell) || 0,
                    change_buy: Number(item.change_buy) || 0,
                    change_sell: Number(item.change_sell) || 0,
                    delta_buy: Number(item.delta_buy) || 0,
                    delta_sell: Number(item.delta_sell) || 0
                }));
                return cached.data;
            }
        } catch (e) {
            console.warn("Invalid cache data", e);
        }
    }

    // FALLBACK TO FRESH FETCH
    const tasks = [
        fetchMiHong(miHongCodes),
        ...giaVangTypes.map(t => fetchGiaVang(t))
    ];
    const results = await Promise.allSettled(tasks);

    const historyRaw = await platform.env.GOLD_KV.get("history_prices");
    const history: HistoryData = historyRaw ? JSON.parse(historyRaw) : {};

    const current: GoldItem[] = results
        .filter(r => r.status === "fulfilled")
        .flatMap((r: any) => Array.isArray(r.value) ? r.value : [r.value])
        .map(item => {
            const key = `${item.source}_${item.type}`;
            const itemHistory = history[key] || [];
            const lastEntry = itemHistory.length > 0 ? itemHistory[itemHistory.length - 1] : null;

            let change_sell = Number(item.change_sell) || 0;
            let change_buy = Number(item.change_buy) || 0;

            if (lastEntry && typeof lastEntry.p === 'number' && !isNaN(lastEntry.p)) {
                if (item.sell !== lastEntry.p) {
                    change_sell = item.sell - lastEntry.p;
                }
            }

            return {
                ...item,
                name: item.name.includes("Nhẫn") ? "SJC Ring" :
                    item.name.includes("99,99") ? "SJC 9999" :
                        item.name.includes("Mi Hồng") ? "Mi Hồng SJC" : item.name,
                change_sell: isNaN(change_sell) ? 0 : change_sell,
                change_buy: isNaN(change_buy) ? 0 : change_buy
            };
        });

    const allowedKeys = [
        ...miHongCodes.map(c => `MH_${c}`),
        ...giaVangTypes.map(t => `GV_${t}`)
    ];
    const filteredHistory: HistoryData = {};
    allowedKeys.forEach(key => {
        if (history[key]) filteredHistory[key] = history[key];
    });

    const responseData = { current, history: filteredHistory };

    // Update cache in background
    await platform.env.GOLD_KV.put("current_prices", JSON.stringify({
        data: responseData,
        timestamp: Date.now()
    }));

    return responseData;
}

async function fetchGiaVang(type: string): Promise<GoldItem> {
    const res = await fetch(`https://giavang.now/api/prices?type=${type}`);
    if (!res.ok) throw new Error(`giavang.now failed: ${type}`);

    const data: any = await res.json();
    const item = data?.data?.[0] || data;

    if (!item?.sell) throw new Error(`giavang.now invalid: ${type}`);

    return {
        source: "GV",
        type,
        name: item.name || type,
        buy: Number(item.buy) / 10 || 0,
        sell: Number(item.sell) / 10 || 0,
        change_sell: (Number(item.change_sell) || 0) / 10,
        change_buy: (Number(item.change_buy) || 0) / 10,
        delta_sell: 0,
        delta_buy: 0,
        time: item.time,
        date: item.date
    };
}

async function fetchMiHong(codes: string[]): Promise<GoldItem[]> {
    const res = await fetch(`https://api.mihong.vn/v1/gold-prices?market=domestic&t=${Date.now()}`, {
        headers: { "Cache-Control": "no-cache" }
    });
    if (!res.ok) throw new Error("Mi Hong API failed");

    const data: any[] = await res.json();

    return data
        .filter(item => codes.includes(item.code))
        .map(item => ({
            source: "MH",
            type: item.code,
            name: `Mi Hồng ${item.code}`,
            buy: Number(item.buyingPrice) || 0,
            sell: Number(item.sellingPrice) || 0,
            change_sell: Number(item.sellChange) || 0,
            change_buy: Number(item.buyChange) || 0,
            delta_sell: 0,
            delta_buy: 0,
            time: item.dateTime.split(" ")[1],
            date: item.dateTime.split(" ")[0]
        }));
}

export async function runSyncJob(platform: App.Platform, isManual: boolean) {
    try {
        const giaVangTypes = ["SJL1L10", "SJ9999"];
        const miHongCodes = ["SJC"];
        const tasks = [
            fetchMiHong(miHongCodes),
            ...giaVangTypes.map(t => fetchGiaVang(t))
        ];

        const results = await Promise.allSettled(tasks);
        const success: GoldItem[] = results
            .filter(r => r.status === "fulfilled")
            .flatMap((r: any) => Array.isArray(r.value) ? r.value : [r.value]);

        // 🗑️ ALWAYS CLEANUP OLD DATA (runs even if APIs fail)
        const historyDays = parseInt(platform.env.HISTORY_DAYS || "3");
        const now = Date.now();
        const cutoff = now - (historyDays * 24 * 60 * 60 * 1000);
        const historyRaw = await platform.env.GOLD_KV.get("history_prices");
        let history: Record<string, { p: number, t: number }[]> = historyRaw ? JSON.parse(historyRaw) : {};

        let historyChanged = false;
        const validKeys = new Set(success.map(item => `${item.source}_${item.type}`));

        // Purge keys older than retention window, but keep a historical anchor for currently tracked items
        Object.keys(history).forEach(key => {
            const initialLen = history[key].length;

            if (!validKeys.has(key)) {
                history[key] = history[key].filter(entry => entry.t > cutoff);
            } else {
                let keepIndex = 0;
                for (let i = history[key].length - 1; i >= 0; i--) {
                    if (history[key][i].t <= cutoff) {
                        keepIndex = i;
                        break;
                    }
                }
                history[key] = history[key].slice(keepIndex);
            }

            if (history[key].length !== initialLen) {
                historyChanged = true;
            }
            if (history[key].length === 0) {
                delete history[key];
                historyChanged = true;
            }
        });

        if (!success.length) {
            // Save cleanup even if no new data fetched
            if (historyChanged) {
                await platform.env.GOLD_KV.put("history_prices", JSON.stringify(history));
            }
            console.log("❌ No data fetched from any source");
            return;
        }

        // 🔑 LOAD LAST
        const lastRaw = await platform.env.GOLD_KV.get("last_prices");
        const lastPricesRaw = lastRaw ? JSON.parse(lastRaw) : {};
        const lastPrices: Record<string, { buy: number, sell: number }> = {};
        for (const k in lastPricesRaw) {
            if (typeof lastPricesRaw[k] === "number") {
                lastPrices[k] = { sell: lastPricesRaw[k], buy: 0 };
            } else {
                lastPrices[k] = lastPricesRaw[k];
            }
        }

        // 🔍 DETECT CHANGE
        const threshold = parseInt(platform.env.THRESHOLD || "50000");
        let changed = false;
        for (const item of success) {
            const key = `${item.source}_${item.type}`;
            const last = lastPrices[key];
            if (!last || Math.abs(item.sell - last.sell) > threshold || Math.abs(item.buy - last.buy) > threshold) {
                changed = true;
                break;
            }
        }

        // 📈 APPEND NEW HISTORY ENTRIES (only if price changed)
        success.forEach(item => {
            const key = `${item.source}_${item.type}`;
            if (!history[key]) history[key] = [];

            const len = history[key].length;
            const lastEntry = len > 0 ? history[key][len - 1] : null;

            if (!lastEntry || lastEntry.p !== item.sell) {
                history[key].push({ p: item.sell, t: now });
                historyChanged = true;
            }
        });

        if (historyChanged) {
            await platform.env.GOLD_KV.put("history_prices", JSON.stringify(history));
            console.log("📈 History updated in KV");
        }

        // ⚡ UPDATE CURRENT CACHE ONLY IF DATA CHANGED
        let currentCacheChanged = true;
        const currentPricesData = { current: success, history: history };
        const currentRaw = await platform.env.GOLD_KV.get("current_prices");

        if (currentRaw) {
            try {
                const cached = JSON.parse(currentRaw);
                let priceChanged = false;
                const cachedCurrent = cached.data?.current || [];

                if (success.length !== cachedCurrent.length) {
                    priceChanged = true;
                }

                for (const item of success) {
                    const old = cachedCurrent.find((o: any) => o.source === item.source && o.type === item.type);
                    if (!old) {
                        priceChanged = true;
                        continue;
                    }

                    // Override API trend with our internally tracked cache difference
                    if (old.sell !== item.sell) {
                        item.change_sell = item.sell - old.sell;
                        priceChanged = true;
                    } else {
                        item.change_sell = old.change_sell !== undefined ? old.change_sell : item.change_sell;
                    }

                    if (old.buy !== undefined && old.buy !== item.buy && old.buy !== 0) {
                        item.change_buy = item.buy - old.buy;
                        priceChanged = true;
                    } else {
                        item.change_buy = old.change_buy !== undefined ? old.change_buy : item.change_buy;
                    }
                }

                if (!priceChanged && !historyChanged) {
                    currentCacheChanged = false;
                }
            } catch (e) { }
        }

        if (currentCacheChanged || isManual) {
            await platform.env.GOLD_KV.put("current_prices", JSON.stringify({
                data: currentPricesData,
                timestamp: Date.now()
            }));
            console.log(currentCacheChanged ? "🔄 Cache updated due to changes" : "🔄 Cache updated (manual sync)");
        } else {
            console.log("⏸ No data changes, skipping cache writes");
        }

        // 🎯 FILTER CHANGED ITEMS
        const formattedItems = success.map(item => {
            const key = `${item.source}_${item.type}`;
            const last = lastPrices[key];
            return {
                ...item,
                delta_sell: last ? item.sell - last.sell : 0,
                delta_buy: last ? item.buy - last.buy : 0
            };
        });

        const changedItems = formattedItems.filter(item => {
            const key = `${item.source}_${item.type}`;
            const last = lastPrices[key];
            return !last || Math.abs(item.sell - last.sell) > threshold || Math.abs(item.buy - last.buy) > threshold;
        });

        const itemsToReport = isManual ? formattedItems : changedItems;

        if (!isManual && !changed) {
            console.log("⏸ No changes to report");
            return;
        }

        // 📩 SEND TELEGRAM
        if (isManual || changed) {
            const text = buildMessage(itemsToReport);
            const chartUrl = generateChartUrl(success, history);

            if (platform.env.TOKEN && platform.env.CHAT_ID) {
                const tgRes = await fetch(`https://api.telegram.org/bot${platform.env.TOKEN}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chat_id: platform.env.CHAT_ID, text, parse_mode: "HTML" })
                });

                if (tgRes.ok) {
                    await fetch(`https://api.telegram.org/bot${platform.env.TOKEN}/sendPhoto`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ chat_id: platform.env.CHAT_ID, photo: chartUrl, caption: "Price Trend (Sampled Hourly)" })
                    });

                    // 💾 SAVE NEW PRICES (Baseline for next notification)
                    const updatedPrices: Record<string, { buy: number, sell: number }> = { ...lastPrices };
                    success.forEach(item => {
                        const key = `${item.source}_${item.type}`;
                        updatedPrices[key] = { buy: item.buy, sell: item.sell };
                    });
                    await platform.env.GOLD_KV.put("last_prices", JSON.stringify(updatedPrices));
                    console.log("✅ Baseline updated in KV after notification");
                }
            }
        }

    } catch (err) {
        console.error("🔥 SYNC ERROR:", err);
    }
}

function buildMessage(list: GoldItem[]) {
    const groups = list.reduce((acc, item) => {
        if (!acc[item.source]) acc[item.source] = [];
        acc[item.source].push(item);
        return acc;
    }, {} as Record<string, GoldItem[]>);

    const sources = Object.keys(groups).sort((a, b) => (a === "MH" ? -1 : 1));
    const header = "🔔 <b>GOLD PRICE UPDATE</b> ✨\n\n";

    const body = sources.map(source => {
        const items = groups[source];
        const sourceName = source === "MH" ? "🏢 <b>MI HONG SYSTEM</b>" : "🏦 <b>GOLD PRICE EXCHANGE</b>";
        return `${sourceName}\n${items.map(item => {
            const trendSell = item.delta_sell > 0 ? "📈" : item.delta_sell < 0 ? "📉" : "➖";
            const deltaSellText = item.delta_sell !== 0 ? ` (<i>${item.delta_sell > 0 ? '↑' : '↓'}${Math.abs(item.delta_sell).toLocaleString("vi-VN")} VND</i>) ` : " ";

            const trendBuy = item.delta_buy > 0 ? "📈" : item.delta_buy < 0 ? "📉" : "➖";
            const deltaBuyText = item.delta_buy !== 0 ? ` (<i>${item.delta_buy > 0 ? '↑' : '↓'}${Math.abs(item.delta_buy).toLocaleString("vi-VN")} VND</i>) ` : " ";

            return `
💰 <b>${item.name}</b>
├ 🟢 Buy:  <code>${item.buy.toLocaleString('vi-VN')} VND/mace</code>${deltaBuyText}${trendBuy}
├ 🔴 Sell: <code>${item.sell.toLocaleString('vi-VN')} VND/mace</code>${deltaSellText}${trendSell}
└ 🕒 <i>Updated: ${item.time} | ${item.date}</i>`;
        }).join("\n")}`;
    }).join("\n\n──────────────\n\n");

    return header + body;
}

function generateChartUrl(current: GoldItem[], history: Record<string, { p: number, t: number }[]>) {
    const typeConfig: Record<string, { label: string, color: string }> = {
        'MH_SJC': { label: 'Mi Hồng SJC', color: '#f59e0b' },
        'GV_SJ9999': { label: 'SJC 9999', color: '#0ea5e9' },
        'GV_SJL1L10': { label: 'SJC Ring', color: '#10b981' }
    };
    if (!current.length) return "";

    const nowT = Date.now();
    const maxWindow = 3 * 24 * 3600 * 1000;
    let oldestT = nowT;

    Object.values(history).forEach(arr => {
        if (arr.length > 0 && arr[0].t < oldestT) {
            oldestT = arr[0].t;
        }
    });

    if (nowT - oldestT > maxWindow) {
        oldestT = nowT - maxWindow;
    }

    oldestT = Math.floor(oldestT / 3600000) * 3600000;

    const sampledTimestamps: number[] = [];
    for (let t = oldestT; t <= nowT; t += 3600000) {
        sampledTimestamps.push(t);
    }

    const labels = sampledTimestamps.map(t => {
        const date = new Date(t + (7 * 3600000));
        return `${date.getUTCDate()}/${date.getUTCMonth() + 1} ${date.getUTCHours()}h`;
    });

    const datasets = current.map((item) => {
        const key = `${item.source}_${item.type}`;
        const itemHistory = history[key] || [];
        const cfg = typeConfig[key] || { label: item.name, color: '#94a3b8' };

        const sampledPrices = sampledTimestamps.map(targetT => {
            let price = item.sell;
            let found = false;
            for (let i = itemHistory.length - 1; i >= 0; i--) {
                if (itemHistory[i].t <= targetT) {
                    price = itemHistory[i].p;
                    found = true;
                    break;
                }
            }
            if (!found && itemHistory.length > 0) {
                price = itemHistory[0].p;
            }
            return price;
        });

        return { label: cfg.label, data: sampledPrices, borderColor: cfg.color, fill: false, borderWidth: 2, pointRadius: sampledPrices.length > 50 ? 0 : 3 };
    });

    const chartConfig = { type: "line", data: { labels, datasets }, options: { title: { display: true, text: "Gold Price Trend (Hourly)" }, legend: { position: "bottom" }, scales: { xAxes: [{ ticks: { maxTicksLimit: 12, autoSkip: true } }], yAxes: [{ ticks: { callback: (val: number) => (val / 1000000).toFixed(1) + "M" } }] } } };
    return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&width=800&height=500&backgroundColor=white`;
}
