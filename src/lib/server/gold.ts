import type { GoldItem, HistoryData } from '$lib/types';

function parseValue(val: any): number {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const clean = val.replace(/,/g, '');
        return parseFloat(clean) || 0;
    }
    return 0;
}

export async function getDashboardData(platform: App.Platform) {
    const giaVangTypes = ["SJL1L10", "SJ9999"];
    const miHongCodes = ["SJC"];
    const now = Date.now();

    // ⚡ TRY CACHE FIRST (TTL: 2 mins)
    const cachedRaw = await platform.env.GOLD_KV.get("current_prices");
    if (cachedRaw) {
        try {
            const cached = JSON.parse(cachedRaw);
            const cacheAge = Date.now() - (cached.timestamp || 0);
            if (cacheAge < 120000 && cached?.data?.current) {
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

    const lastRaw = await platform.env.GOLD_KV.get("last_prices");
    const lastPrices = lastRaw ? JSON.parse(lastRaw) : {};

    const current: GoldItem[] = results
        .filter(r => r.status === "fulfilled")
        .flatMap((r: any) => Array.isArray(r.value) ? r.value : [r.value])
        .map(item => {
            const key = `${item.source}_${item.type}`;
            const lastBaseline = lastPrices[key];

            const delta_sell = lastBaseline ? (item.sell - lastBaseline.sell) : 0;
            const delta_buy = lastBaseline ? (item.buy - lastBaseline.buy) : 0;

            return {
                ...item,
                name: item.name.includes("Nhẫn") || item.name.includes("Ring") ? "SJC Ring" :
                    item.name.includes("9999") || item.name.includes("99,99") ? "SJC 9999" :
                        item.name.includes("Mi Hồng") ? "Mi Hồng SJC" : item.name,
                delta_sell,
                delta_buy
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

    // 📈 UPDATE HISTORY (Chart)
    let historyChanged = false;
    current.forEach(item => {
        const key = `${item.source}_${item.type}`;
        if (!history[key]) history[key] = [];
        const len = history[key].length;
        const lastEntry = len > 0 ? history[key][len - 1] : null;

        // Add point if price changed or if no point exists for the last hour
        if (!lastEntry || lastEntry.p !== item.sell || (now - lastEntry.t >= 3600000)) {
            history[key].push({ p: item.sell, t: now });
            historyChanged = true;
        }
    });

    if (historyChanged) {
        // Cleanup old points first
        const historyDays = parseInt(platform.env.HISTORY_DAYS || "3");
        const cutoff = Date.now() - (historyDays * 24 * 60 * 60 * 1000);
        Object.keys(history).forEach(key => {
            history[key] = history[key].filter(entry => entry.t > cutoff);
        });
        await platform.env.GOLD_KV.put("history_prices", JSON.stringify(history));
    }

    // Update current cache in background
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
        buy: parseValue(item.buy) / 10 || 0,
        sell: parseValue(item.sell) / 10 || 0,
        change_sell: (parseValue(item.change_sell) || 0) / 10,
        change_buy: (parseValue(item.change_buy) || 0) / 10,
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
            buy: parseValue(item.buyingPrice) || 0,
            sell: parseValue(item.sellingPrice) || 0,
            change_sell: parseValue(item.sellChange) || 0,
            change_buy: parseValue(item.buyChange) || 0,
            delta_sell: 0,
            delta_buy: 0,
            time: item.dateTime.split(" ")[1],
            date: item.dateTime.split(" ")[0]
        }));
}

export async function runSyncJob(platform: App.Platform, isManual: boolean, reset: boolean = false) {
    try {
        if (reset) {
            console.log("🧹 Reset requested: Clearing KV data...");
            await platform.env.GOLD_KV.delete("history_prices");
            await platform.env.GOLD_KV.delete("last_prices");
            await platform.env.GOLD_KV.delete("current_prices");
        }
        const giaVangTypes = ["SJL1L10", "SJ9999"];
        const miHongCodes = ["SJC"];
        const tasks = [
            fetchMiHong(miHongCodes),
            ...giaVangTypes.map(t => fetchGiaVang(t))
        ];

        const results = await Promise.allSettled(tasks);
        const success: GoldItem[] = results
            .filter(r => r.status === "fulfilled")
            .flatMap((r: any) => Array.isArray(r.value) ? r.value : [r.value])
            .map(item => ({
                ...item,
                name: item.name.includes("Nhẫn") || item.name.includes("Ring") ? "SJC Ring" :
                    item.name.includes("9999") || item.name.includes("99,99") ? "SJC 9999" :
                        item.name.includes("Mi Hồng") ? "Mi Hồng SJC" : item.name
            }));

        // 🗑️ ALWAYS CLEANUP OLD HISTORY
        const historyDays = parseInt(platform.env.HISTORY_DAYS || "3");
        const now = Date.now();
        const cutoff = now - (historyDays * 24 * 60 * 60 * 1000);
        const historyRaw = await platform.env.GOLD_KV.get("history_prices");
        let history: Record<string, { p: number, t: number }[]> = historyRaw ? JSON.parse(historyRaw) : {};

        let historyChanged = false;
        Object.keys(history).forEach(key => {
            const initialLen = history[key].length;
            history[key] = history[key].filter(entry => entry.t > cutoff);
            if (history[key].length !== initialLen) historyChanged = true;
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

        // 🔑 LOAD LAST BASELINE
        const lastRaw = await platform.env.GOLD_KV.get("last_prices");
        const lastPrices: Record<string, { buy: number, sell: number }> = lastRaw ? JSON.parse(lastRaw) : {};

        // 🔍 DETECT CHANGE (0 = notify on any change)
        const threshold = parseInt(platform.env.THRESHOLD || "0");
        let changed = false;
        for (const item of success) {
            const key = `${item.source}_${item.type}`;
            const last = lastPrices[key];
            const deltaSell = last ? Math.abs(item.sell - last.sell) : 0;
            const deltaBuy = last ? Math.abs(item.buy - last.buy) : 0;

            console.log(`🔍 [${key}] Current: ${item.sell}, Last: ${last?.sell || 'N/A'}, Delta: ${deltaSell}, Threshold: ${threshold}`);

            if (deltaSell >= threshold || deltaBuy >= threshold || !last) {
                changed = true;
                console.log(`🎯 [${key}] Change detected! Triggering notification.`);
            }
        }

        // 📈 APPEND NEW HISTORY ENTRIES (only if price changed)
        success.forEach(item => {
            const key = `${item.source}_${item.type}`;
            if (!history[key]) history[key] = [];

            const len = history[key].length;
            const lastEntry = len > 0 ? history[key][len - 1] : null;

            // Add point if price changed or if no point exists for the last hour
            if (!lastEntry || lastEntry.p !== item.sell || (now - lastEntry.t >= 3600000)) {
                history[key].push({ p: item.sell, t: now });
                historyChanged = true;
            }
        });

        if (historyChanged) {
            await platform.env.GOLD_KV.put("history_prices", JSON.stringify(history));
            console.log("📈 History updated in KV");
        }

        // ⚡ UPDATE CURRENT CACHE & TRENDS
        const currentRaw = await platform.env.GOLD_KV.get("current_prices");
        const cached = currentRaw ? JSON.parse(currentRaw) : null;
        const cachedCurrent = cached?.data?.current || [];

        success.forEach(item => {
            const old = cachedCurrent.find((o: any) => o.source === item.source && o.type === item.type);
            if (old) {
                item.change_sell = item.sell - old.sell;
                item.change_buy = item.buy - old.buy;
            } else {
                item.change_sell = 0;
                item.change_buy = 0;
            }
        });

        const formattedWithDeltas = success.map(item => {
            const key = `${item.source}_${item.type}`;
            const last = lastPrices[key];
            return {
                ...item,
                delta_sell: last ? (item.sell - last.sell) : 0,
                delta_buy: last ? (item.buy - last.buy) : 0
            };
        });

        const currentPricesData = { current: formattedWithDeltas, history: history };

        await platform.env.GOLD_KV.put("current_prices", JSON.stringify({
            data: currentPricesData,
            timestamp: Date.now()
        }));

        // ⏰ DAILY HEARTBEAT (Force send at 8 AM ICT, first run only)
        const dateICT = new Date(now + (7 * 3600000));
        const hourICT = dateICT.getUTCHours();
        const minuteICT = dateICT.getUTCMinutes();
        const isHeartbeatHour = (hourICT === 8 && minuteICT < 5); // Only first run of 8 AM hour

        if (isHeartbeatHour && !isManual) {
            console.log(`⏱ Daily heartbeat triggered (${hourICT}:${minuteICT} ICT). Forcing notification.`);
            changed = true;
        }

        if (!isManual && !changed) {
            console.log("⏸ No significant changes and not heartbeat hour. Skipping Telegram.");
            return;
        }

        // 🎯 FILTER CHANGED ITEMS
        const itemsToReport = (isManual || isHeartbeatHour) ? formattedWithDeltas : formattedWithDeltas.filter(item => {
            const key = `${item.source}_${item.type}`;
            const last = lastPrices[key];
            if (!last) return true; // Report new items
            return Math.abs(item.sell - last.sell) >= threshold || Math.abs(item.buy - last.buy) >= threshold;
        });

        // 📩 SEND TELEGRAM
        if (isManual || changed) {
            const text = buildMessage(itemsToReport);
            const chartUrl = generateChartUrl(success, history);

            if (platform.env.TOKEN && platform.env.CHAT_ID) {
                console.log(`📡 Sending Telegram message (Items: ${itemsToReport.length})...`);
                const tgRes = await fetch(`https://api.telegram.org/bot${platform.env.TOKEN}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chat_id: platform.env.CHAT_ID, text, parse_mode: "HTML" })
                });

                if (tgRes.ok) {
                    console.log("✅ Telegram message sent successfully.");
                    await fetch(`https://api.telegram.org/bot${platform.env.TOKEN}/sendPhoto`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ chat_id: platform.env.CHAT_ID, photo: chartUrl, caption: "Price Trend (Sampled Hourly)" })
                    });

                    // 💾 SAVE NEW PRICES (Baseline for next notification)
                    // Only update baseline for items that were actually reported
                    const updatedPrices: Record<string, { buy: number, sell: number }> = { ...lastPrices };
                    itemsToReport.forEach(item => {
                        const key = `${item.source}_${item.type}`;
                        updatedPrices[key] = { buy: item.buy, sell: item.sell };
                    });
                    await platform.env.GOLD_KV.put("last_prices", JSON.stringify(updatedPrices));
                    console.log(`💾 Baseline updated in KV for ${itemsToReport.length} items.`);
                } else {
                    const errorText = await tgRes.text();
                    console.error(`❌ Telegram API Error: ${tgRes.status} - ${errorText}`);
                }
            } else {
                console.error("❌ CRITICAL: TOKEN or CHAT_ID is missing in platform.env!");
                console.log("Current Env Keys:", Object.keys(platform.env));
                console.log("Expected Keys: TOKEN, CHAT_ID");
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
            const deltaSellText = item.delta_sell !== 0 ? ` (<i>${item.delta_sell > 0 ? '↑' : '↓'}${Math.abs(item.delta_sell).toLocaleString("vi-VN")}</i>)` : "";
            const todaySellText = item.change_sell !== 0 ? ` [24h: ${item.change_sell > 0 ? '+' : ''}${item.change_sell.toLocaleString("vi-VN")}]` : "";

            const trendBuy = item.delta_buy > 0 ? "📈" : item.delta_buy < 0 ? "📉" : "➖";
            const deltaBuyText = item.delta_buy !== 0 ? ` (<i>${item.delta_buy > 0 ? '↑' : '↓'}${Math.abs(item.delta_buy).toLocaleString("vi-VN")}</i>)` : "";
            const todayBuyText = item.change_buy !== 0 ? ` [24h: ${item.change_buy > 0 ? '+' : ''}${item.change_buy.toLocaleString("vi-VN")}]` : "";

            return `
💰 <b>${item.name}</b>
├ 🟢 <b>Buy:</b>  <code>${item.buy.toLocaleString('vi-VN')}</code>${deltaBuyText}${todayBuyText} ${trendBuy}
├ 🔴 <b>Sell:</b> <code>${item.sell.toLocaleString('vi-VN')}</code>${deltaSellText}${todaySellText} ${trendSell}
└ 🕒 <i>Refreshed: ${item.time} | ${item.date}</i>`;
        }).join("\n")}`;
    }).join("\n\n──────────────\n\n");

    return header + body;
}

function generateChartUrl(current: GoldItem[], history: Record<string, { p: number, t: number }[]>) {
    const typeConfig: Record<string, { label: string, color: string }> = {
        'MH_SJC': { label: 'Mi Hồng SJC', color: '#f59e0b' },
        'GV_SJ9999': { label: 'SJC Ring', color: '#0ea5e9' },
        'GV_SJL1L10': { label: 'SJC 9999', color: '#10b981' }
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

    const chartConfig = { type: "line", data: { labels, datasets }, options: { title: { display: true, text: "Gold Price Trend (Hourly)" }, legend: { position: "bottom" }, scales: { xAxes: [{ ticks: { maxTicksLimit: 12, autoSkip: true } }], yAxes: [{ ticks: {} }] } } };
    return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&width=800&height=500&backgroundColor=white`;
}
