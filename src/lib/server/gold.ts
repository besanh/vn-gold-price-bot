import type { GoldItem } from '$lib/types';

export async function getDashboardData(platform: App.Platform) {
    const giaVangTypes = ["SJL1L10", "SJ9999"];
    const miHongCodes = ["SJC"];
    const tasks = [
        fetchMiHong(miHongCodes),
        ...giaVangTypes.map(t => fetchGiaVang(t))
    ];
    const results = await Promise.allSettled(tasks);
    const current: GoldItem[] = results
        .filter(r => r.status === "fulfilled")
        .flatMap((r: any) => Array.isArray(r.value) ? r.value : [r.value])
        .map(item => ({
            ...item,
            name: item.name.includes("Nhẫn") ? "SJC Ring" :
                item.name.includes("99,99") ? "SJC 9999" :
                    item.name.includes("Mi Hồng") ? "Mi Hồng SJC" : item.name
        }));

    const historyRaw = await platform.env.GOLD_KV.get("history_prices");
    const history = historyRaw ? JSON.parse(historyRaw) : {};

    const allowedKeys = [
        ...miHongCodes.map(c => `MH_${c}`),
        ...giaVangTypes.map(t => `GV_${t}`)
    ];
    const filteredHistory: Record<string, { t: number, p: number }[]> = {};
    allowedKeys.forEach(key => {
        if (history[key]) filteredHistory[key] = history[key];
    });

    return { current, history: filteredHistory };
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
        buy: item.buy / 10,
        sell: item.sell / 10,
        change_sell: (item.change_sell || 0) / 10,
        delta: 0,
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
            buy: item.buyingPrice,
            sell: item.sellingPrice,
            change_sell: item.sellChange || 0,
            delta: 0,
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

        if (!success.length) {
            console.log("❌ No data fetched from any source");
            return;
        }

        // 🔑 LOAD LAST
        const lastRaw = await platform.env.GOLD_KV.get("last_prices");
        const lastPrices: Record<string, number> = lastRaw ? JSON.parse(lastRaw) : {};

        // 🔍 DETECT CHANGE
        const threshold = parseInt(platform.env.THRESHOLD || "50000");
        let changed = false;
        for (const item of success) {
            const key = `${item.source}_${item.type}`;
            const last = lastPrices[key];
            if (!last || Math.abs(item.sell - last) > threshold) {
                changed = true;
                break;
            }
        }

        // 📈 UPDATE HISTORY
        const historyDays = parseInt(platform.env.HISTORY_DAYS || "3");
        const historyRaw = await platform.env.GOLD_KV.get("history_prices");
        let history: Record<string, { p: number, t: number }[]> = historyRaw ? JSON.parse(historyRaw) : {};
        const now = Date.now();
        const windowMs = historyDays * 24 * 60 * 60 * 1000;
        const cutoff = now - windowMs;

        success.forEach(item => {
            const key = `${item.source}_${item.type}`;
            if (!history[key]) history[key] = [];
            history[key].push({ p: item.sell, t: now });
            history[key] = history[key].filter(entry => entry.t > cutoff);
        });

        await platform.env.GOLD_KV.put("history_prices", JSON.stringify(history));

        // 🎯 FILTER CHANGED ITEMS
        const formattedItems = success.map(item => {
            const key = `${item.source}_${item.type}`;
            const last = lastPrices[key];
            return { ...item, delta: last ? item.sell - last : 0 };
        });

        const changedItems = formattedItems.filter(item => {
            const key = `${item.source}_${item.type}`;
            const last = lastPrices[key];
            return !last || Math.abs(item.sell - last) > threshold;
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
                    const updatedPrices = { ...lastPrices };
                    success.forEach(item => {
                        const key = `${item.source}_${item.type}`;
                        updatedPrices[key] = item.sell;
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
            const trend = item.delta > 0 ? "📈" : item.delta < 0 ? "📉" : "➖";
            const deltaText = item.delta !== 0 ? ` (<i>${item.delta > 0 ? '↑' : '↓'}${Math.abs(item.delta).toLocaleString("vi-VN")} VND</i>)` : "";
            return `
💰 <b>${item.name}</b> ${trend}
├ 🟢 Buy:  <code>${item.buy.toLocaleString('vi-VN')} VND/mace</code>
├ 🔴 Sell: <code>${item.sell.toLocaleString('vi-VN')} VND/mace</code>${deltaText}
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
    const firstKey = `${current[0].source}_${current[0].type}`;
    const rawHistory = history[firstKey] || [];
    const hourGroups: Record<string, number> = {};
    rawHistory.forEach(d => {
        const date = new Date(d.t + (7 * 60 * 60 * 1000));
        const bucket = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}-${date.getUTCHours()}`;
        hourGroups[bucket] = d.t;
    });
    const sampledTimestamps = Object.values(hourGroups).sort((a, b) => a - b);
    const labels = sampledTimestamps.map(t => {
        const date = new Date(t + (7 * 60 * 60 * 1000));
        return `${date.getUTCDate()}/${date.getUTCMonth() + 1} ${date.getUTCHours()}h`;
    });
    const datasets = current.map((item) => {
        const key = `${item.source}_${item.type}`;
        const itemHistory = history[key] || [];
        const cfg = typeConfig[key] || { label: item.name, color: '#94a3b8' };
        const sampledPrices = sampledTimestamps.map(targetT => {
            const closest = itemHistory.reduce((prev, curr) => Math.abs(curr.t - targetT) < Math.abs(prev.t - targetT) ? curr : prev, { p: item.sell, t: Date.now() });
            return closest.p;
        });
        return { label: cfg.label, data: sampledPrices, borderColor: cfg.color, fill: false, borderWidth: 2, pointRadius: sampledPrices.length > 50 ? 0 : 3 };
    });
    const chartConfig = { type: "line", data: { labels, datasets }, options: { title: { display: true, text: "Gold Price Trend (Hourly)" }, legend: { position: "bottom" }, scales: { xAxes: [{ ticks: { maxTicksLimit: 12, autoSkip: true } }], yAxes: [{ ticks: { callback: (val: number) => (val / 1000000).toFixed(1) + "M" } }] } } };
    return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&width=800&height=500&backgroundColor=white`;
}
